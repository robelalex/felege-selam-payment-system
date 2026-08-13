# students/views.py - COMPLETE UPDATED with multi-school support + grades 1-12 + sections
from django.http import HttpResponse
from .services.bulk_import import BulkImportService
import json
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Student, Section, StudentDocument, GRADUATION_GRADE
from .serializers import StudentSerializer, SectionSerializer, StudentDocumentSerializer
from payments.models import Payment, PaymentDeadline, PaymentSlip
import pandas as pd
from io import BytesIO
from datetime import datetime
from schools.models import School
from academics.models import AcademicYear

# ✅ NEW: Import helper functions
from common.utils import get_verified_school_id, is_super_admin, get_user_school
from authentication.permissions import CanManageStudents, IsParentOfStudentOrCanManage, IsSameSchoolOrOwnParent

# ✅ NEW: which enrollment document(s) each grade transition requires —
# same rule the frontend registration form already uses for its
# "recommended documents" hint, now also used server-side so the parent
# portal can show an accurate checklist without duplicating the logic.
RECOMMENDED_DOC_TYPES_BY_GRADE = {
    1: ['birth_certificate'],
    7: ['leaving_certificate_grade6'],
    9: ['leaving_certificate_grade8'],
    12: ['grade12_certificate'],
}


def _send_registration_reminder_email(student):
    """Plain-text email pointing the parent at the existing Parent Portal
    OTP login — same send_mail/anymail setup that already sends the login
    codes (see authentication.views.send_otp_via_email), so it works
    everywhere that already works today, no extra config needed."""
    from django.core.mail import send_mail
    from django.conf import settings

    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')
    login_link = f"{frontend_url}/parent-login"
    school_name = student.school.name

    subject = f"Finish {student.formatted_name}'s registration — {school_name}"
    message = (
        f"Hello,\n\n"
        f"{student.formatted_name}'s registration at {school_name} is almost done — "
        f"we still need a photo and/or a document or two.\n\n"
        f"Please log in to the Parent Portal using this email address ({student.parent_email}) "
        f"and your child's Student ID ({student.student_id or 'ask the school office'}):\n"
        f"{login_link}\n\n"
        f"You'll get a one-time login code by email — no password needed. "
        f"Once you're in, you can upload the photo and documents directly.\n\n"
        f"Thank you,\n{school_name}"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[student.parent_email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"❌ Failed to send registration reminder to {student.parent_email}: {e}")
        return False


class StudentViewSet(viewsets.ModelViewSet):
    """
    ✅ SECURITY FIX: this previously had no permission_classes at all,
    which meant it inherited the project-wide default of AllowAny —
    student records (names, phone numbers, payment status) were readable
    AND writable by anyone on the internet who sent an X-School-ID header,
    no login required. IsAuthenticated is now required for everything,
    and only school_admin/registrar can create/edit/delete (see
    get_permissions below) — everyone else on staff can still view.
    """
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # ✅ SECURITY FIX: bulk_import, update_monthly_fee, and
        # selective_promote all modify/create student records in bulk or
        # change financial data, but weren't in the original list — any
        # authenticated staff member, regardless of role, could use them.
        # ✅ NEW: parent self-service actions — a parent may only touch
        # their OWN child's record (enforced object-by-object inside
        # IsParentOfStudentOrCanManage), staff who can manage students
        # keep access too.
        if self.action in ('registration_status', 'parent_upload_photo', 'parent_upload_document'):
            return [IsAuthenticated(), IsParentOfStudentOrCanManage()]

        # ✅ SECURITY FIX: these three are read-only per-student detail
        # endpoints used by BOTH the parent portal AND several staff
        # views (e.g. the admin dashboard's Class Details breakdown) that
        # aren't limited to registrars. Same-school staff keep read
        # access as before; a parent is now restricted to their own
        # child instead of any student by ID.
        if self.action in ('payment_history', 'pending_payments', 'pending_slips'):
            return [IsAuthenticated(), IsSameSchoolOrOwnParent()]

        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'bulk_import', 'update_monthly_fee', 'selective_promote',
            'upload_document', 'delete_document', 'bulk_photo_upload',
            'send_registration_reminder', 'send_registration_reminders_bulk',
        ):
            return [IsAuthenticated(), CanManageStudents()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Filter students by school (super admin sees all, school admin sees only their school)"""
        queryset = Student.objects.all()

        # ✅ SECURITY FIX: get_school_id_from_request trusted the header
        # FIRST for every user, not just super admins — a school admin from
        # School A could set X-School-ID to School B and see/edit School
        # B's students. get_verified_school_id ignores the header entirely
        # for non-super-admins, resolving their school from their own
        # account instead.
        school_id = get_verified_school_id(self.request)
        user = self.request.user

        # ✅ Super admins see all, school admins see only their school
        if not is_super_admin(user) and school_id:
            queryset = queryset.filter(school_id=school_id)
        elif school_id:
            queryset = queryset.filter(school_id=school_id)

        # Filter by academic year
        year_id = self.request.query_params.get('academic_year_id')
        year_param = self.request.query_params.get('academic_year')
        year_alt = self.request.query_params.get('year')
        year_id_alt = self.request.query_params.get('year_id')

        year_value = year_id or year_id_alt or year_alt or year_param

        # 🔎 DIAGNOSTIC: show exactly what academic_year strings actually
        # exist on this school's students BEFORE we filter by year, so a
        # mismatch (e.g. "2018" vs "2018 E.C." vs blank) is provable from
        # one log line instead of guessed at.
        existing_years = list(queryset.values_list('academic_year', flat=True).distinct())
        print(f"📚 DEBUG - academic_year values actually on {queryset.count()} students "
              f"for this school BEFORE year filter: {existing_years}")

        if year_value:
            try:
                try:
                    year = AcademicYear.objects.get(id=int(year_value))
                    # 🔎 DIAGNOSTIC: the two strings PRINT identically but
                    # the filter still returns 0 — that pattern means an
                    # invisible character difference (different space type,
                    # stray whitespace, etc). Compare raw bytes to prove it.
                    print(f"📚 DEBUG - AcademicYear.name bytes: {year.name.encode('utf-8')!r} (len={len(year.name)})")
                    for v in existing_years:
                        if v:
                            match = (v == year.name)
                            print(f"📚 DEBUG - student value bytes: {v.encode('utf-8')!r} (len={len(v)}) — matches AcademicYear.name: {match}")
                    queryset = queryset.filter(academic_year=year.name)
                    print(f"📚 Filtered by AcademicYear ID {year_value}: {year.name}")
                except (ValueError, AcademicYear.DoesNotExist):
                    try:
                        year = AcademicYear.objects.get(year_ec=int(year_value))
                        queryset = queryset.filter(academic_year=year.name)
                        print(f"📚 Filtered by AcademicYear year_ec {year_value}: {year.name}")
                    except (ValueError, AcademicYear.DoesNotExist):
                        queryset = queryset.filter(academic_year=year_value)
                        print(f"📚 Filtered by AcademicYear string: {year_value}")
            except Exception as e:
                print(f"📚 Error filtering by year: {e}")

        # Filter by date range if provided
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if start_date:
            queryset = queryset.filter(enrollment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(enrollment_date__lte=end_date)

        queryset = queryset.order_by('grade', 'first_name')
        print(f"📚 Total students after filtering: {queryset.count()}")

        return queryset

    def list(self, request, *args, **kwargs):
        """Override list to ensure school filtering is applied"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """✅ Automatically set school from X-School-ID header when creating a student"""
        school_id = self.request.headers.get('X-School-ID')

        if not school_id:
            raise serializers.ValidationError({"error": "School ID required (X-School-ID header)"})

        try:
            school = School.objects.get(id=int(school_id))
            serializer.save(school=school)
            print(f"📚 Created student for school: {school.name}")
        except School.DoesNotExist:
            raise serializers.ValidationError({"error": "School not found"})
        except ValueError:
            raise serializers.ValidationError({"error": "Invalid school ID"})

    def perform_update(self, serializer):
        """✅ CRITICAL: Prevent school_id from being changed during update"""
        # Get the existing student
        student = self.get_object()

        # Get the school from the request header
        school_id = self.request.headers.get('X-School-ID')

        if not school_id:
            raise serializers.ValidationError({"error": "School ID required (X-School-ID header)"})

        # ✅ Verify the student belongs to the current school
        if str(student.school_id) != str(school_id):
            raise serializers.ValidationError({
                "error": "You cannot modify a student from another school"
            })

        # ✅ Save without changing the school
        serializer.save(school=student.school)
        print(f"📚 Updated student {student.student_id} for school {student.school.name}")

    @action(detail=False, methods=['get'], url_path='search_by_id')
    def search_by_id(self, request):
        """Search student by their unique ID"""
        student_id = request.query_params.get('student_id', None)
        if student_id:
            try:
                student = Student.objects.get(student_id=student_id)
            except Student.DoesNotExist:
                return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

            # ✅ SECURITY FIX: this used to return the full student record
            # (name, phone numbers, address, monthly fee) to ANY logged-in
            # account for ANY student ID, with the parent/child match only
            # checked afterwards in the browser's JavaScript — so the data
            # had already left the server before that check ever ran, and
            # calling this endpoint directly (Postman, curl, devtools)
            # skipped the check entirely. Same 404 for "wrong owner" as for
            # "doesn't exist" so this endpoint can't be used to probe which
            # student IDs are valid.
            if not IsParentOfStudentOrCanManage().has_object_permission(request, self, student):
                return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

            serializer = self.get_serializer(student)
            return Response(serializer.data)
        return Response({'error': 'Please provide student_id'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='payment_history')
    def payment_history(self, request, pk=None):
        """Get payment history for a specific student - ONLY for their academic year"""
        student = self.get_object()

        # ✅ FIX: Get the AcademicYear object from the student's academic_year string
        try:
            academic_year_obj = AcademicYear.objects.get(
                name=student.academic_year,
                school=student.school
            )
        except AcademicYear.DoesNotExist:
            # If no matching AcademicYear found, return empty
            return Response([])

        # ✅ CORRECT: Use the AcademicYear object, not the string
        payments = Payment.objects.filter(
            student=student,
            deadline__academic_year=academic_year_obj
        ).order_by('-created_at')

        data = []
        for payment in payments:
            data.append({
                'id': payment.id,
                'month': payment.deadline.get_month_display(),
                'academic_year': payment.deadline.academic_year.name if payment.deadline.academic_year else student.academic_year,
                'amount': str(payment.amount),
                'status': payment.status,
                'payment_date': payment.created_at,
                'payment_method': payment.payment_method,
                'transaction_ref': payment.transaction_reference,
                'is_from_slip': getattr(payment, 'is_from_slip', False),
            })

        return Response(data)

    @action(detail=True, methods=['get'], url_path='pending_payments')
    def pending_payments(self, request, pk=None):
        """Get all pending payments for a student - INCLUDING slip payments"""
        try:
            student = self.get_object()
            print(f"📚 Getting pending payments for student ID: {student.id} - {student.student_id}")
            print(f"📚 Student grade: {student.grade}")

            # ✅ FIX: Get the AcademicYear object
            try:
                academic_year_obj = AcademicYear.objects.get(
                    name=student.academic_year,
                    school=student.school
                )
            except AcademicYear.DoesNotExist:
                print(f"⚠️ AcademicYear '{student.academic_year}' not found for school {student.school_id}")
                return Response([])

            # Get verified/paid deadlines from regular payments
            paid_deadlines = Payment.objects.filter(
                student=student,
                status='verified'
            ).values_list('deadline_id', flat=True)

            print(f"📚 Paid deadline IDs: {list(paid_deadlines)}")

            # ✅ CORRECT: Use the AcademicYear object, not the string
            pending_deadlines = PaymentDeadline.objects.filter(
                school=student.school,
                academic_year=academic_year_obj,
                is_active=True
            ).exclude(id__in=paid_deadlines)

            # Filter deadlines by student's grade
            filtered_deadlines = []
            for deadline in pending_deadlines:
                if deadline.grade is None or deadline.grade == student.grade:
                    filtered_deadlines.append(deadline)

            print(f"📚 Found {len(filtered_deadlines)} pending deadlines for grade {student.grade}")

            # ✅ Fee exceptions (Jimma request #1): this is the actual
            # endpoint the parent app / admin "pending payments" screen
            # calls — it was still reading deadline.amount directly, so a
            # waiver/partial student's fee override wasn't visible here
            # even though it was already applied on report_service.py and
            # (critically) the Chapa charge itself. Fixed the same way.
            from payments.services.fee_override_service import get_effective_deadline_amount, get_active_override

            # 🔍 DIAGNOSTIC (temporary): print exactly what override lookup
            # sees for this student/year, so a "why isn't my override
            # showing up" report can be root-caused from the server log
            # alone, without needing DB access. Safe to remove later.
            _debug_override = get_active_override(student, academic_year_obj)
            print(
                f"🔍 FeeOverride check — student.id={student.id} "
                f"academic_year_obj.id={academic_year_obj.id} ({academic_year_obj.name}) -> "
                + (
                    f"FOUND override id={_debug_override.id} type={_debug_override.override_type} "
                    f"amount={_debug_override.amount} is_active={_debug_override.is_active} "
                    f"override.academic_year_id={_debug_override.academic_year_id}"
                    if _debug_override else "NO ACTIVE OVERRIDE FOUND for this (student, academic_year) pair"
                )
            )

            # ✅ NEW: Also get pending payments from slip uploads (not yet verified)
            pending_slip_payments = Payment.objects.filter(
                student=student,
                status='pending',
                is_from_slip=True
            ).select_related('deadline', 'slip')

            # Format the response
            data = []

            # Add regular pending deadlines
            for deadline in filtered_deadlines:
                effective_amount = get_effective_deadline_amount(student, deadline)
                if effective_amount <= 0:
                    # 'waiver' students: covered by the one-time amount
                    # charged on the year's first deadline — nothing else
                    # to show as pending for this month.
                    continue
                data.append({
                    'id': deadline.id,
                    'deadline_id': deadline.id,
                    'month_name': deadline.get_month_display(),
                    'month_number': deadline.month,
                    'academic_year': deadline.academic_year.name if deadline.academic_year else student.academic_year,
                    'amount': str(effective_amount),
                    # 🔍 DIAGNOSTIC (temporary): visible in the browser
                    # Network tab response — confirms whether the backend
                    # is actually seeing an override for this deadline.
                    'original_amount': str(deadline.amount),
                    'has_fee_override': effective_amount != deadline.amount,
                    'due_date': deadline.due_date,
                    'description': deadline.description,
                    'grade': deadline.grade,
                    'is_active': deadline.is_active,
                    'is_from_slip': False,
                    'payment_status': None,
                    'slip_status': None
                })
                print(f"📚 Added pending: {deadline.get_month_display()} - Grade: {deadline.grade if deadline.grade else 'All Grades'}")

            # ✅ Add pending slip payments
            for payment in pending_slip_payments:
                data.append({
                    'id': payment.id,  # Payment ID for reference
                    'deadline_id': payment.deadline.id,
                    'month_name': payment.deadline.get_month_display(),
                    'month_number': payment.deadline.month,
                    'academic_year': payment.deadline.academic_year.name if payment.deadline.academic_year else student.academic_year,
                    'amount': str(payment.amount),
                    'due_date': payment.deadline.due_date,
                    'description': f"Bank Slip Upload - Pending Verification",
                    'grade': payment.deadline.grade,
                    'is_active': True,
                    'is_from_slip': True,
                    'payment_status': payment.status,
                    'slip_status': payment.slip.status if payment.slip else 'pending',
                    'payment_id': payment.id,
                    'slip_image': payment.slip.slip_image.url if payment.slip and payment.slip.slip_image else None
                })
                print(f"📚 Added pending slip payment: {payment.deadline.get_month_display()}")

            return Response(data)

        except Exception as e:
            print(f"❌ Error in pending_payments: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='download_template')
    def download_template(self, request):
        """Download Excel template for bulk import"""
        try:
            # ✅ SECURITY FIX: was get_school_id_from_request (header-first
            # for everyone) — now resolves from the real account.
            school_id = get_verified_school_id(request)

            if school_id:
                school = School.objects.get(id=school_id)
            else:
                return Response({'error': 'School not identified. Please contact administrator.'}, status=400)

            service = BulkImportService(school.id)
            excel_file = service.download_template()

            response = HttpResponse(
                excel_file.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="student_import_template.xlsx"'
            return response

        except School.DoesNotExist:
            return Response({'error': 'School not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'], url_path='bulk_import')
    def bulk_import(self, request):
        """Import students from uploaded Excel file"""
        try:
            if 'file' not in request.FILES:
                return Response({'error': 'No file uploaded'}, status=400)

            file = request.FILES['file']

            # ✅ SECURITY FIX: was get_school_id_from_request (header-first
            # for everyone) — now resolves from the real account, so a
            # staff member can no longer bulk-import students into a
            # DIFFERENT school by changing a header.
            school_id = get_verified_school_id(request)

            if school_id:
                school = School.objects.get(id=school_id)
            else:
                return Response({'error': 'School not identified. Please contact administrator.'}, status=400)

            service = BulkImportService(school.id)
            results = service.process_file(file)

            return Response(results)

        except School.DoesNotExist:
            return Response({'error': 'School not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'], url_path='export_students')
    def export_students(self, request):
        """Export all students to Excel"""
        try:
            students = self.get_queryset()

            data = []
            for student in students:
                data.append({
                    'Student ID': student.student_id,
                    'First Name': student.first_name,
                    'Last Name': student.last_name,
                    'Father Name': student.father_name,
                    'Mother Name': student.mother_name,
                    'Grade': student.grade,
                    'Section': student.section,
                    'Academic Year': student.academic_year,
                    'Parent Name': student.parent_full_name,
                    'Parent Phone': student.parent_phone,
                    'Monthly Fee': student.monthly_fee,
                    'Status': student.status
                })

            df = pd.DataFrame(data)

            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Students', index=False)

            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="students_export_{datetime.now().strftime("%Y%m%d")}.xlsx"'
            return response

        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export all students to Excel with full details"""
        try:
            students = self.get_queryset()

            data = []
            for student in students:
                data.append({
                    'Student ID': student.student_id,
                    'First Name': student.first_name,
                    'Last Name': student.last_name,
                    'Father Name': student.father_name,
                    'Mother Name': student.mother_name,
                    'Grade': student.grade,
                    'Section': student.section,
                    'Academic Year': student.academic_year,
                    'Parent Name': student.parent_full_name,
                    'Parent Phone': student.parent_phone,
                    'Alternative Phone': student.parent_alternative_phone,
                    'Parent Email': student.parent_email,
                    'Monthly Fee': student.monthly_fee,
                    'City': student.city,
                    'Subcity': student.subcity,
                    'Kebele': student.kebele,
                    'House Number': student.house_number,
                    'Status': student.status,
                    'Enrollment Date': student.enrollment_date
                })

            df = pd.DataFrame(data)

            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Students', index=False)

            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="students_export_{datetime.now().strftime("%Y%m%d")}.xlsx"'
            return response

        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=True, methods=['patch'])
    def update_monthly_fee(self, request, pk=None):
        """Update a student's monthly fee"""
        student = self.get_object()
        new_fee = request.data.get('monthly_fee')

        if new_fee:
            student.monthly_fee = new_fee
            student.save()
            return Response({'success': True, 'monthly_fee': student.monthly_fee})

        return Response({'error': 'monthly_fee required'}, status=400)

    @action(detail=True, methods=['post'], url_path='request_payment_deletion')
    def request_payment_deletion(self, request, pk=None):
        """
        Parent requests deletion of a payment (for pending/unverified payments only)
        """
        student = self.get_object()
        payment_id = request.data.get('payment_id')
        reason = request.data.get('reason', '')

        if not payment_id:
            return Response({'error': 'Payment ID required'}, status=400)

        try:
            payment = Payment.objects.get(id=payment_id, student=student)

            # Only allow deletion request for pending payments
            if payment.status != 'pending':
                return Response({'error': 'Only pending payments can be deleted'}, status=400)

            # Check if within 24 hours
            from django.utils import timezone
            from datetime import timedelta

            time_diff = timezone.now() - payment.created_at
            if time_diff > timedelta(hours=24):
                return Response({'error': 'Deletion request window has expired (24 hours)'}, status=400)

            # Delete the payment (it's pending)
            payment.delete()

            # Log the deletion (optional)
            print(f"🗑️ Parent requested deletion of payment {payment_id} for student {student.student_id}. Reason: {reason}")

            return Response({'success': True, 'message': 'Payment deleted successfully'})

        except Payment.DoesNotExist:
            return Response({'error': 'Payment not found'}, status=404)

    # ========== PENDING SLIPS ENDPOINT FOR PARENT DASHBOARD ==========

    @action(detail=True, methods=['get'], url_path='pending_slips')
    def pending_slips(self, request, pk=None):
        """
        Get all pending bank slips for a student
        This is used by ParentDashboard to prevent double payment
        """
        try:
            student = self.get_object()
            print(f"📋 Getting pending slips for student: {student.student_id}")

            # ✅ FIXED: Filter by verification_status instead of legacy status
            # Async workflow sets verification_status='queued' immediately on upload
            pending_slips = PaymentSlip.objects.filter(
                student=student,
                verification_status__in=['pending', 'queued', 'failed', 'manual_review', 'timeout']
            ).select_related('deadline')

            data = []
            for slip in pending_slips:
                data.append({
                    'id': slip.id,
                    'deadline_id': slip.deadline.id,
                    'amount': float(slip.amount),
                    'month_name': slip.deadline.get_month_display(),
                    'month_number': slip.deadline.month,
                    'academic_year': slip.deadline.academic_year.name,
                    'uploaded_at': slip.uploaded_at,
                    'transaction_reference': slip.transaction_reference or '',
                    'status': slip.status,
                    'verification_status': slip.verification_status,  # ✅ NEW: Include async status
                    'slip_image': slip.slip_image.url if slip.slip_image else None,
                    'due_date': slip.deadline.due_date.isoformat() if slip.deadline.due_date else None,
                    'description': slip.deadline.description or f"Bank Slip - {slip.deadline.get_month_display()}"
                })

            print(f"📋 Found {len(data)} pending slips for student {student.student_id}")
            return Response(data)

        except Exception as e:
            print(f"❌ Error in pending_slips: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], url_path='selective_promote')
    def selective_promote(self, request):
        """
        Selectively promote students.
        - Students in 'promote_ids' → grade +1 (Active), OR graduated if already at GRADUATION_GRADE
        - Students NOT in 'promote_ids' → grade stays same, academic_year updated (repeaters)
        - Student IDs NEVER change
        """
        from academics.models import AcademicYear

        # ✅ SECURITY FIX: was get_school_id_from_request (header-first for
        # everyone) — now resolves from the real account.
        school_id = get_verified_school_id(request)
        if not school_id:
            return Response({'error': 'No school associated with this account'}, status=400)

        promote_ids = request.data.get('promote_ids', [])  # List of student PKs to promote
        current_year_id = request.data.get('current_year_id')  # Current academic year ID
        next_year_id = request.data.get('next_year_id')  # Next academic year ID

        if not current_year_id or not next_year_id:
            return Response({'error': 'Both current_year_id and next_year_id are required'}, status=400)

        try:
            current_year = AcademicYear.objects.get(id=int(current_year_id), school_id=int(school_id))
            next_year = AcademicYear.objects.get(id=int(next_year_id), school_id=int(school_id))
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found for this school'}, status=404)

        # Get all active students in the current year for this school
        all_students = Student.objects.filter(
            school_id=int(school_id),
            academic_year=current_year.name,
            status='active'
        )

        promoted_count = 0
        repeated_count = 0
        graduated_count = 0
        errors = []

        for student in all_students:
            try:
                if student.pk in promote_ids:
                    # ✅ PROMOTE: Grade +1, move to next year (unless at graduation threshold)
                    if student.grade >= GRADUATION_GRADE:
                        student.status = 'graduated'
                        graduated_count += 1
                    else:
                        student.grade += 1
                        promoted_count += 1

                    # Preserve monthly_fee (don't overwrite custom fees)
                    if not student.monthly_fee or student.monthly_fee == 0:
                        new_fee = next_year.get_default_fee_for_grade(student.grade, int(school_id))
                        if new_fee:
                            student.monthly_fee = new_fee

                else:
                    # ✅ REPEAT: Stay in same grade, move to next year
                    repeated_count += 1
                    # Fee stays exactly the same for repeaters

                # ✅ CRITICAL: Update academic_year for ALL students (promoted AND repeaters)
                # Student ID remains CONSTANT - never changed
                student.academic_year = next_year.name
                student.save(update_fields=['grade', 'academic_year', 'monthly_fee', 'status'])

            except Exception as e:
                errors.append(f"Student {student.student_id}: {str(e)}")

        # Log the promotion
        from academics.models import YearPromotionLog
        YearPromotionLog.objects.create(
            from_year=current_year,
            to_year=next_year,
            students_promoted=promoted_count,
            students_graduated=graduated_count,
            promoted_by=request.user if request.user.is_authenticated else None
        )

        return Response({
            'success': True,
            'promoted': promoted_count,
            'repeated': repeated_count,
            'graduated': graduated_count,
            'total_processed': all_students.count(),
            'from_year': current_year.name,
            'to_year': next_year.name,
            'errors': errors
        })

    # ========== ENROLLMENT DOCUMENTS (birth certificate, leaving certs, etc.) ==========

    @action(detail=True, methods=['post'], url_path='upload_document')
    def upload_document(self, request, pk=None):
        """
        Attach an enrollment document (birth certificate, grade 6/8 leaving
        certificate, transfer certificate, etc.) to this student.
        Expects multipart form data: file, document_type, notes (optional).
        """
        student = self.get_object()

        if 'file' not in request.FILES:
            return Response({'error': 'No file uploaded'}, status=400)

        document_type = request.data.get('document_type')
        valid_types = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)
        if document_type not in valid_types:
            return Response(
                {'error': f'document_type must be one of: {", ".join(valid_types.keys())}'},
                status=400
            )

        document = StudentDocument.objects.create(
            student=student,
            document_type=document_type,
            file=request.FILES['file'],
            notes=request.data.get('notes', '')
        )

        serializer = StudentDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='documents')
    def list_documents(self, request, pk=None):
        """List all enrollment documents attached to this student."""
        student = self.get_object()
        documents = student.documents.all()
        serializer = StudentDocumentSerializer(documents, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'], url_path='delete_document/(?P<document_id>[^/.]+)')
    def delete_document(self, request, pk=None, document_id=None):
        """Remove an enrollment document from this student."""
        student = self.get_object()
        try:
            document = student.documents.get(id=document_id)
        except StudentDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=404)
        document.delete()
        return Response({'success': True})

    # ========== PARENT SELF-SERVICE REGISTRATION COMPLETION ==========
    # A parent who's already logged into the Parent Portal (existing
    # email-OTP flow — see authentication.views.parent_login_step1/2)
    # can finish their own child's registration themselves: upload the
    # student photo and whichever enrollment documents this grade needs,
    # instead of a staff member doing it in person one student at a time.
    # No new link/token system — it rides on the login flow that's
    # already built and already secure.

    @action(detail=True, methods=['get'], url_path='registration_status')
    def registration_status(self, request, pk=None):
        """What's still missing for this student: photo and/or any
        grade-appropriate enrollment documents. Used to render the
        parent's checklist and the admin's 'incomplete' badge."""
        student = self.get_object()
        required_types = RECOMMENDED_DOC_TYPES_BY_GRADE.get(student.grade, [])
        uploaded_types = set(student.documents.values_list('document_type', flat=True))
        doc_labels = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)

        required_documents = [
            {'value': t, 'label': doc_labels[t], 'uploaded': t in uploaded_types}
            for t in required_types
        ]
        missing = [d for d in required_documents if not d['uploaded']]

        return Response({
            'student_id': student.student_id,
            'student_name': student.formatted_name,
            'has_photo': bool(student.photo),
            'required_documents': required_documents,
            'is_complete': bool(student.photo) and not missing,
        })

    @action(detail=True, methods=['post'], url_path='parent_upload_photo')
    def parent_upload_photo(self, request, pk=None):
        """Parent uploads/replaces their child's profile photo."""
        student = self.get_object()
        photo = request.FILES.get('photo')
        if not photo:
            return Response({'error': 'No photo uploaded'}, status=400)
        if photo.size > 5 * 1024 * 1024:
            return Response({'error': 'Photo must be smaller than 5MB'}, status=400)

        student.photo = photo
        student.save(update_fields=['photo'])
        return Response({
            'success': True,
            'photo': StudentSerializer(student, context={'request': request}).data.get('photo'),
        })

    @action(detail=True, methods=['post'], url_path='parent_upload_document')
    def parent_upload_document(self, request, pk=None):
        """Parent uploads one enrollment document for their child. Unlike
        the staff-facing upload_document above, re-uploading the same
        document_type REPLACES the previous file rather than creating a
        duplicate — a parent correcting a blurry scan shouldn't leave two
        rows behind for the registrar to sort out."""
        student = self.get_object()
        if 'file' not in request.FILES:
            return Response({'error': 'No file uploaded'}, status=400)

        document_type = request.data.get('document_type')
        valid_types = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)
        if document_type not in valid_types:
            return Response(
                {'error': f'document_type must be one of: {", ".join(valid_types.keys())}'},
                status=400
            )

        document, _ = StudentDocument.objects.update_or_create(
            student=student,
            document_type=document_type,
            defaults={'file': request.FILES['file']}
        )
        serializer = StudentDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='send_registration_reminder')
    def send_registration_reminder(self, request, pk=None):
        """Staff-triggered: emails this student's parent a plain
        instruction to log into the Parent Portal and finish uploading
        the photo/documents. Reuses the same OTP login already built —
        the parent gets a one-time code by email, no separate token."""
        student = self.get_object()
        if not student.parent_email:
            return Response({'error': 'This student has no parent email on file'}, status=400)

        sent = _send_registration_reminder_email(student)
        if not sent:
            return Response({'error': 'Failed to send email'}, status=500)
        return Response({'success': True, 'message': f'Reminder sent to {student.parent_email}'})

    @action(detail=False, methods=['post'], url_path='send_registration_reminders_bulk')
    def send_registration_reminders_bulk(self, request):
        """Send the reminder to every student currently in view (respects
        the same school/academic-year filters as the student list) who is
        still missing a photo or a required document — one click instead
        of doing it student-by-student."""
        queryset = self.filter_queryset(self.get_queryset())
        sent, skipped_no_email, still_missing_but_not_sent = [], [], []

        for student in queryset:
            required_types = RECOMMENDED_DOC_TYPES_BY_GRADE.get(student.grade, [])
            uploaded_types = set(student.documents.values_list('document_type', flat=True))
            incomplete = (not student.photo) or any(t not in uploaded_types for t in required_types)
            if not incomplete:
                continue
            if not student.parent_email:
                skipped_no_email.append(student.formatted_name)
                continue
            if _send_registration_reminder_email(student):
                sent.append(student.formatted_name)
            else:
                still_missing_but_not_sent.append(student.formatted_name)

        return Response({
            'sent_count': len(sent),
            'skipped_no_email_count': len(skipped_no_email),
            'skipped_no_email': skipped_no_email,
            'failed_count': len(still_missing_but_not_sent),
        })

    # ========== BULK PHOTO UPLOAD (ZIP, matched by Student ID filename) ==========

    @action(detail=False, methods=['post'], url_path='bulk_photo_upload')
    def bulk_photo_upload(self, request):
        """
        Bulk-attach student photos from a single ZIP file.

        How it works: the registrar names each photo file after the
        student's Student ID (e.g. FS-2024-1001.jpg) — the same IDs that
        are already generated during the normal registration/bulk-import
        flow — zips them together, and uploads the ZIP once here. Each
        photo is matched to a student by filename and saved to that
        student's `photo` field. This is purely additive: it reuses the
        existing `photo` ImageField and doesn't change how photos are
        stored, served, or read anywhere else in the system.

        Only matches students within the uploader's own school, so a
        mis-named file can't accidentally overwrite another school's data.
        """
        import zipfile
        from django.core.files.base import ContentFile

        if 'file' not in request.FILES:
            return Response({'error': 'No ZIP file uploaded'}, status=400)

        zip_file = request.FILES['file']
        if not zip_file.name.lower().endswith('.zip'):
            return Response({'error': 'Please upload a .zip file'}, status=400)

        school_id = get_verified_school_id(request)
        if not school_id:
            return Response({'error': 'School not identified. Please contact administrator.'}, status=400)

        ALLOWED_EXTENSIONS = ('.jpg', '.jpeg', '.png')
        MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5MB per photo, matches frontend limit

        matched = []
        unmatched = []
        errors = []

        try:
            with zipfile.ZipFile(zip_file) as archive:
                for entry in archive.infolist():
                    # Skip directories and macOS metadata junk
                    if entry.is_dir() or '/__MACOSX' in entry.filename or entry.filename.startswith('.'):
                        continue

                    filename = entry.filename.split('/')[-1]  # ignore any folder path inside the zip
                    if not filename:
                        continue

                    name_no_ext, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
                    ext = f'.{ext.lower()}'

                    if ext not in ALLOWED_EXTENSIONS:
                        unmatched.append({'filename': filename, 'reason': 'Unsupported file type (use JPG or PNG)'})
                        continue

                    if entry.file_size > MAX_PHOTO_SIZE:
                        unmatched.append({'filename': filename, 'reason': 'File larger than 5MB'})
                        continue

                    student_id = name_no_ext.strip()
                    student = Student.objects.filter(
                        student_id=student_id,
                        school_id=school_id
                    ).first()

                    if not student:
                        unmatched.append({'filename': filename, 'reason': f'No student found with ID "{student_id}" in this school'})
                        continue

                    try:
                        photo_bytes = archive.read(entry)
                        student.photo.save(filename, ContentFile(photo_bytes), save=True)
                        matched.append({'filename': filename, 'student_id': student.student_id, 'student_name': student.full_name})
                    except Exception as e:
                        errors.append({'filename': filename, 'error': str(e)})

        except zipfile.BadZipFile:
            return Response({'error': 'That file is not a valid ZIP archive'}, status=400)

        return Response({
            'success': True,
            'matched_count': len(matched),
            'unmatched_count': len(unmatched),
            'error_count': len(errors),
            'matched': matched,
            'unmatched': unmatched,
            'errors': errors,
        })


class SectionViewSet(viewsets.ModelViewSet):
    """
    Manages per-grade, per-school sections (A-Z).
    Student.section is still a plain CharField — this only controls
    what's selectable in the registration form dropdown.
    """
    serializer_class = SectionSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), CanManageStudents()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = Section.objects.filter(is_active=True)
        # ✅ SECURITY FIX: was get_school_id_from_request (header-first for
        # everyone) — now resolves from the real account.
        school_id = get_verified_school_id(self.request)
        if school_id:
            queryset = queryset.filter(school_id=school_id)

        grade = self.request.query_params.get('grade')
        if grade:
            try:
                queryset = queryset.filter(grade=int(grade))
            except ValueError:
                pass

        return queryset.order_by('grade', 'name')

    def perform_create(self, serializer):
        school_id = self.request.headers.get('X-School-ID')
        if not school_id:
            raise serializers.ValidationError({"error": "School ID required (X-School-ID header)"})
        try:
            school = School.objects.get(id=int(school_id))
            serializer.save(school=school)
            print(f"📚 Created section {serializer.instance.name} for grade {serializer.instance.grade}")
        except School.DoesNotExist:
            raise serializers.ValidationError({"error": "School not found"})
        except ValueError:
            raise serializers.ValidationError({"error": "Invalid school ID"})

    def perform_destroy(self, instance):
        # Soft-delete: keep historical students pointing at a real section name,
        # and just remove it from future selection.
        instance.is_active = False
        instance.save()