# students/views.py - COMPLETE UPDATED with multi-school support + grades 1-12 + sections
from django.http import HttpResponse, Http404
from .services.bulk_import import BulkImportService
import json
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Student, Section, StudentDocument, RequiredDocumentRequest, GRADUATION_GRADE
from .serializers import StudentSerializer, SectionSerializer, StudentDocumentSerializer, RequiredDocumentRequestSerializer
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


def get_required_document_types(grade):
    """
    ✅ BUG FIX (requested): every document type required for a student
    currently in `grade`, ACCUMULATED across every earlier transition
    threshold up to and including their current grade — not just
    whichever single entry happens to match their exact current grade.

    Before this fix, RECOMMENDED_DOC_TYPES_BY_GRADE.get(student.grade, [])
    only ever checked the ONE grade the student is currently in. So a
    student in Grade 9 was correctly asked for their Grade 8 leaving
    certificate — but the moment that same student was promoted to
    Grade 10, the requirement silently disappeared, because there's no
    entry for grade 10 in the dict. The system would then only ever
    check for a photo and (if they were in Grade 1) a birth certificate,
    which matches exactly what was reported: older/higher-grade students
    kept showing as "complete" or only missing a photo, even when a
    leaving certificate was never actually uploaded.

    A required document doesn't stop being required once a student
    moves past that grade — it should stay on the checklist until it's
    actually uploaded. So this returns the UNION of every threshold at
    or below the student's current grade: e.g. a Grade 10 student
    requires birth_certificate (grade 1) + leaving_certificate_grade6
    (grade 7) + leaving_certificate_grade8 (grade 9) all at once — not
    just whichever one matches grade 10 exactly (nothing, previously).
    A student who has already uploaded the Grade 6 certificate simply
    shows that one as satisfied and moves on to checking Grade 8 — it
    doesn't stop checking altogether.
    """
    required = []
    for threshold_grade in sorted(RECOMMENDED_DOC_TYPES_BY_GRADE):
        if threshold_grade <= grade:
            required.extend(RECOMMENDED_DOC_TYPES_BY_GRADE[threshold_grade])
    return required


def _current_academic_year_for(student):
    """Best-effort lookup of this student's school's current AcademicYear
    row, to tag a newly-uploaded StudentDocument with. Returns None
    (never raises) if the school has no academic year marked current —
    the field is nullable specifically so this can't block an upload."""
    try:
        from academics.models import AcademicYear
        return AcademicYear.objects.filter(
            school_id=student.school_id, is_current=True
        ).first()
    except Exception:
        return None


def _auto_resolve_document_requests(student, document_type):
    """When a document of a given type is uploaded (by staff or parent),
    auto-close any open admin RequiredDocumentRequest of that SAME type
    for this student — except 'other', whose free-text label makes an
    automatic match unreliable; those stay open until an admin resolves
    them manually. Never raises — a failure here shouldn't block the
    upload itself."""
    if document_type == 'other':
        return
    try:
        from django.utils import timezone
        RequiredDocumentRequest.objects.filter(
            student=student, document_type=document_type, is_resolved=False
        ).update(is_resolved=True, resolved_at=timezone.now())
    except Exception:
        pass


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
        if self.action in ('payment_history', 'pending_payments', 'pending_slips', 'child_record'):
            return [IsAuthenticated(), IsSameSchoolOrOwnParent()]

        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'bulk_import', 'update_monthly_fee', 'selective_promote',
            'upload_document', 'delete_document', 'bulk_photo_upload',
            'send_registration_reminder', 'send_registration_reminders_bulk',
            'review_document', 'request_document', 'list_document_requests',
            'delete_document_request', 'resolve_document_request',
            'request_document_bulk',
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
        # ✅ BUG FIX: this year filter is only meaningful for the STUDENT
        # LIST page ("show me this school's students for 2018 E.C."). It
        # was being applied unconditionally, which meant every
        # single-student-by-ID action (retrieve, pending_slips,
        # child_record, payment_history, pending_payments,
        # registration_status, parent uploads) ALSO got filtered by an
        # academic_year string match that has nothing to do with "does
        # this ID exist and does this caller have permission to see it."
        # If a student's stored `academic_year` text doesn't match the
        # AcademicYear row's name byte-for-byte (a trailing space, "2018"
        # vs "2018 E.C.", etc — see the DEBUG logging above, which exists
        # because this has bitten this exact field before), the student
        # silently disappears from the queryset and a perfectly valid,
        # permitted lookup 404s. Worse, pending_slips/child_record wrap
        # get_object() in a bare except Exception, which turns that same
        # 404 into a misleading 500. Concretely: this is why
        # GET /api/students/64/ 404'd and
        # GET /api/students/64/pending_slips/ 500'd in production while
        # working locally — the two databases have slightly different
        # academic_year text for that student, not different code.
        # Detail-by-ID actions identify their target by pk already, so
        # they skip this filter entirely; only list-style actions
        # (default DRF `list`, bulk exports, etc.) need it.
        DETAIL_ACTIONS_SKIP_YEAR_FILTER = {
            'retrieve', 'pending_slips', 'child_record', 'payment_history',
            'pending_payments', 'registration_status',
            'parent_upload_photo', 'parent_upload_document',
            'upload_document', 'delete_document', 'review_document',
        }
        skip_year_filter = getattr(self, 'action', None) in DETAIL_ACTIONS_SKIP_YEAR_FILTER

        year_id = self.request.query_params.get('academic_year_id')
        year_param = self.request.query_params.get('academic_year')
        year_alt = self.request.query_params.get('year')
        year_id_alt = self.request.query_params.get('year_id')

        year_value = None if skip_year_filter else (year_id or year_id_alt or year_alt or year_param)

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
        """
        ✅ SECURITY FIX (tenant isolation): this used to trust the raw
        X-School-ID header directly, with NO check that it matched the
        authenticated user's own school. Any school_admin/staff account
        anywhere on the platform could send a DIFFERENT school's ID and
        have a student record silently created under that other school —
        a real cross-tenant write, not just a read. Now uses
        get_verified_school_id(), the same helper get_queryset() already
        uses below: for a normal school_admin/staff user this is always
        resolved from THEIR OWN profile and the header is ignored
        entirely — they cannot override which school they're creating
        into, no matter what they send. A super admin (who legitimately
        manages multiple schools) is the only case where the header is
        still honored, exactly as with every other view in this file.
        """
        school_id = get_verified_school_id(self.request)

        if not school_id:
            raise serializers.ValidationError({"error": "Could not determine your school. If you manage multiple schools, set X-School-ID; otherwise contact support."})

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
                    # ✅ FIX: get_month_display() rendered blank/"None" for a
                    # registration deadline (month is always None there by
                    # design) — the parent dashboard showed a blank label
                    # for the registration fee. display_label handles both.
                    'month_name': deadline.display_label,
                    'month_number': deadline.month,
                    # ✅ NEW: lets the parent dashboard tell a one-time
                    # registration fee apart from a monthly deadline, so it
                    # can show a distinct "Pay Now only, own receipt" card
                    # instead of the monthly slip/bank-transfer flow.
                    'deadline_type': deadline.deadline_type,
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
                print(f"📚 Added pending: {deadline.display_label} - Grade: {deadline.grade if deadline.grade else 'All Grades'}")

            # ✅ Add pending slip payments
            for payment in pending_slip_payments:
                data.append({
                    'id': payment.id,  # Payment ID for reference
                    'deadline_id': payment.deadline.id,
                    'month_name': payment.deadline.display_label,
                    'month_number': payment.deadline.month,
                    'deadline_type': payment.deadline.deadline_type,
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
                print(f"📚 Added pending slip payment: {payment.deadline.display_label}")

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

        except Http404:
            # ✅ FIX: a genuinely missing/not-yours student should stay a
            # 404, not get relabeled as a 500 by the catch-all below.
            raise
        except Exception as e:
            print(f"❌ Error in pending_slips: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'], url_path='child_record')
    def child_record(self, request, pk=None):
        """
        ✅ NEW — Jimma request #4 (part 1). "My child's record": daily
        attendance, per-subject attendance, and marks — one connected
        view, not two separate features, per how the school asked for it.

        Scoped strictly to this one student via self.get_object(), which
        triggers IsSameSchoolOrOwnParent.has_object_permission — a parent
        can only ever reach their OWN child's row (matched by
        parent_email), same guard already protecting payment_history/
        pending_payments/pending_slips above. Staff at the student's
        school keep read access too, same as those three.

        Marks: only status='accepted' rows are returned. draft/submitted/
        rejected are internal homeroom-review states — showing a parent
        an unreviewed or corrected-away score would be actively
        misleading, not just premature.

        Groups marks by Term (Semester 1/2 today; this naturally extends
        to Quarters later since Term already models "a grading period",
        not "a semester" specifically — no rework needed here when item 7
        lands). Assessment types created before Term existed have
        term=None by design (backward compatibility) — grouped under
        'Ungrouped' rather than silently dropped.
        """
        from exams.models import DailyAttendance, SubjectAttendance, Mark

        try:
            student = self.get_object()

            try:
                academic_year_obj = AcademicYear.objects.get(
                    name=student.academic_year,
                    school=student.school
                )
            except AcademicYear.DoesNotExist:
                return Response({
                    'student': {
                        'student_id': student.student_id,
                        'name': f"{student.formatted_name}",
                        'grade': student.grade,
                        'section': student.section,
                    },
                    'academic_year': None,
                    'attendance': {'daily': {'summary': {}, 'records': []}, 'subject': []},
                    'marks': {'terms': []},
                })

            # ---- Daily (homeroom) attendance ---------------------------
            daily_qs = DailyAttendance.objects.filter(
                student=student, academic_year=academic_year_obj
            ).order_by('-date')

            daily_counts = {'present': 0, 'absent': 0, 'late': 0, 'excused': 0}
            for row in daily_qs:
                if row.status in daily_counts:
                    daily_counts[row.status] += 1
            daily_total = sum(daily_counts.values())

            daily_records = [{
                'date': a.date.isoformat(),
                'status': a.status,
                'status_display': a.get_status_display(),
            } for a in daily_qs[:60]]  # most recent 60 school days — a full term's worth without an unbounded payload

            # ---- Subject attendance, grouped per subject ----------------
            subject_qs = SubjectAttendance.objects.filter(
                student=student, academic_year=academic_year_obj
            ).select_related('subject').order_by('subject__name', '-date')

            subject_groups = {}
            for row in subject_qs:
                key = row.subject_id
                if key not in subject_groups:
                    subject_groups[key] = {
                        'subject': row.subject.name,
                        'summary': {'present': 0, 'absent': 0, 'late': 0, 'excused': 0},
                        'records': [],
                    }
                if row.status in subject_groups[key]['summary']:
                    subject_groups[key]['summary'][row.status] += 1
                if len(subject_groups[key]['records']) < 30:  # recent 30 periods per subject
                    subject_groups[key]['records'].append({
                        'date': row.date.isoformat(),
                        'status': row.status,
                        'status_display': row.get_status_display(),
                    })

            # ---- Marks: accepted only, grouped by term -------------------
            marks_qs = Mark.objects.filter(
                student=student, academic_year=academic_year_obj, status='accepted'
            ).select_related('subject', 'assessment_type', 'assessment_type__term').order_by(
                'assessment_type__term__order', 'subject__name', 'assessment_type__order'
            )

            term_groups = {}
            for m in marks_qs:
                term = m.assessment_type.term
                term_key = term.id if term else 'ungrouped'
                if term_key not in term_groups:
                    term_groups[term_key] = {
                        'term': term.name if term else 'Ungrouped',
                        'order': term.order if term else 9999,
                        'marks': [],
                    }
                term_groups[term_key]['marks'].append({
                    'subject': m.subject.name,
                    'assessment_type': m.assessment_type.name,
                    'score': float(m.score) if m.score is not None else None,
                    'max_score': float(m.assessment_type.max_score),
                    'reviewed_at': m.reviewed_at.strftime('%Y-%m-%d') if m.reviewed_at else None,
                })

            terms_sorted = sorted(term_groups.values(), key=lambda t: t['order'])

            return Response({
                'student': {
                    'student_id': student.student_id,
                    'name': f"{student.formatted_name}",
                    'grade': student.grade,
                    'section': student.section,
                },
                'academic_year': academic_year_obj.name,
                'attendance': {
                    'daily': {
                        'summary': {
                            **daily_counts,
                            'total_days': daily_total,
                            'attendance_rate': round((daily_counts['present'] + daily_counts['late']) / daily_total * 100, 1) if daily_total else None,
                        },
                        'records': daily_records,
                    },
                    'subject': list(subject_groups.values()),
                },
                'marks': {'terms': terms_sorted},
            })

        except Http404:
            # ✅ FIX: same reasoning as pending_slips above — a real 404
            # (student not found / not yours) shouldn't be relabeled 500.
            raise
        except Exception as e:
            print(f"❌ Error in child_record: {str(e)}")
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
        Expects multipart form data: file, document_type, notes (optional),
        custom_label (optional — used for document_type='other' or to
        annotate an 'educational_document').
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
            custom_label=request.data.get('custom_label', ''),
            # ✅ Tag with the student's current academic year so a
            # yearly educational document (or a re-required cert) from
            # this year is tracked separately from an old one.
            academic_year=_current_academic_year_for(student),
            file=request.FILES['file'],
            notes=request.data.get('notes', '')
        )
        _auto_resolve_document_requests(student, document_type)

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

    @action(detail=True, methods=['post'], url_path='review_document/(?P<document_id>[^/.]+)')
    def review_document(self, request, pk=None, document_id=None):
        """
        ✅ NEW: admin review of an uploaded document — mark it verified or
        rejected, with an optional note explaining why (shown to the
        parent, e.g. "photo is cut off, please re-scan the full page").
        Expects JSON body: { "status": "verified" | "rejected", "note": "" }
        """
        student = self.get_object()
        try:
            document = student.documents.get(id=document_id)
        except StudentDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=404)

        new_status = request.data.get('status')
        if new_status not in ('verified', 'rejected', 'pending'):
            return Response({'error': "status must be 'verified', 'rejected', or 'pending'"}, status=400)

        from django.utils import timezone
        document.status = new_status
        document.verified = (new_status == 'verified')
        document.review_note = request.data.get('note', '')
        document.reviewed_at = timezone.now()
        document.save(update_fields=['status', 'verified', 'review_note', 'reviewed_at'])

        serializer = StudentDocumentSerializer(document)
        return Response(serializer.data)

    # ========== ADMIN-MANUAL "WE STILL NEED THIS" DOCUMENT REQUESTS ==========
    # The grade-based RECOMMENDED_DOC_TYPES_BY_GRADE list covers the usual
    # transition points automatically. These three actions let an admin
    # additionally flag something specific to ONE student (a re-scan, a
    # one-off letter, an educational document after a transfer) — it
    # shows up on that parent's dashboard checklist the same way, without
    # the admin needing to message the parent separately.

    @action(detail=True, methods=['post'], url_path='request_document')
    def request_document(self, request, pk=None):
        """Flag that this specific student still needs to submit a
        document. Expects JSON body: { "document_type": "...",
        "custom_label": "" (required if document_type is 'other'),
        "note": "" (optional, shown to the parent) }"""
        student = self.get_object()
        document_type = request.data.get('document_type')
        valid_types = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)
        if document_type not in valid_types:
            return Response(
                {'error': f'document_type must be one of: {", ".join(valid_types.keys())}'},
                status=400
            )
        custom_label = request.data.get('custom_label', '')
        if document_type == 'other' and not custom_label.strip():
            return Response({'error': "custom_label is required when document_type is 'other'"}, status=400)

        req = RequiredDocumentRequest.objects.create(
            student=student,
            document_type=document_type,
            custom_label=custom_label,
            note=request.data.get('note', ''),
            requested_by=getattr(request.user, 'email', '') or getattr(request.user, 'username', ''),
        )
        serializer = RequiredDocumentRequestSerializer(req)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='document_requests')
    def list_document_requests(self, request, pk=None):
        """List every admin-manual document request for this student
        (open and resolved) — for the admin's own document panel."""
        student = self.get_object()
        requests_qs = student.document_requests.all()
        serializer = RequiredDocumentRequestSerializer(requests_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'], url_path='delete_document_request/(?P<request_id>[^/.]+)')
    def delete_document_request(self, request, pk=None, request_id=None):
        """Cancel an admin-manual document request (e.g. it was raised by
        mistake) — removes it from the parent's checklist immediately."""
        student = self.get_object()
        try:
            req = student.document_requests.get(id=request_id)
        except RequiredDocumentRequest.DoesNotExist:
            return Response({'error': 'Request not found'}, status=404)
        req.delete()
        return Response({'success': True})

    @action(detail=True, methods=['post'], url_path='resolve_document_request/(?P<request_id>[^/.]+)')
    def resolve_document_request(self, request, pk=None, request_id=None):
        """Mark an admin-manual request as fulfilled without deleting it
        — keeps the history (who requested it, when it was resolved)
        instead of erasing the row. Mainly for 'other'-type requests,
        which can't be auto-resolved by matching an upload."""
        student = self.get_object()
        try:
            req = student.document_requests.get(id=request_id)
        except RequiredDocumentRequest.DoesNotExist:
            return Response({'error': 'Request not found'}, status=404)
        from django.utils import timezone
        req.is_resolved = True
        req.resolved_at = timezone.now()
        req.save(update_fields=['is_resolved', 'resolved_at'])
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='request_document_bulk')
    def request_document_bulk(self, request):
        """
        ✅ NEW: same as request_document above, but for many students at
        once — e.g. "every Grade 9 - Section A student needs this year's
        educational document". Does NOT touch or replace the single-
        student request_document/upload flows; this is purely an
        additional bulk entry point, same pattern as bulk_import /
        bulk_photo_upload / send_registration_reminders_bulk.

        Expects JSON body:
        { "student_ids": [<Student.id>, ...], "document_type": "...",
          "custom_label": "" (required if document_type is 'other'),
          "note": "" (optional, shown to each parent) }

        Skips a student who already has an open (unresolved) request of
        the exact same type+label, so clicking this twice for an
        overlapping selection doesn't spam duplicate rows.
        """
        student_ids = request.data.get('student_ids', [])
        document_type = request.data.get('document_type')
        custom_label = request.data.get('custom_label', '')
        note = request.data.get('note', '')

        valid_types = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)
        if document_type not in valid_types:
            return Response(
                {'error': f'document_type must be one of: {", ".join(valid_types.keys())}'},
                status=400
            )
        if document_type == 'other' and not custom_label.strip():
            return Response({'error': "custom_label is required when document_type is 'other'"}, status=400)
        if not student_ids:
            return Response({'error': 'No students selected'}, status=400)

        # ✅ SECURITY: scope strictly to students this admin can actually
        # manage (their school, unless super admin) — same guard bulk_import
        # and the other bulk actions above use, so a school admin can't be
        # handed another school's student IDs and have this act on them.
        students = self.get_queryset().filter(id__in=student_ids)

        requester = getattr(request.user, 'email', '') or getattr(request.user, 'username', '')
        created, skipped_existing = [], []

        for student in students:
            already_open = RequiredDocumentRequest.objects.filter(
                student=student, document_type=document_type,
                custom_label=custom_label, is_resolved=False
            ).exists()
            if already_open:
                skipped_existing.append(student.formatted_name)
                continue
            RequiredDocumentRequest.objects.create(
                student=student,
                document_type=document_type,
                custom_label=custom_label,
                note=note,
                requested_by=requester,
            )
            created.append(student.formatted_name)

        not_found_count = len(student_ids) - students.count()

        return Response({
            'created_count': len(created),
            'skipped_existing_count': len(skipped_existing),
            'skipped_existing': skipped_existing,
            'not_found_or_not_permitted_count': not_found_count,
        })

    @action(detail=False, methods=['get'], url_path='missing_documents')
    def missing_documents(self, request):
        """
        ✅ NEW: report of every student still missing a photo and/or a
        required enrollment document — grade-based rule
        (RECOMMENDED_DOC_TYPES_BY_GRADE) AND any admin-manual
        RequiredDocumentRequest, combined. Respects the same school +
        academic-year scoping as the student list itself (get_queryset).
        Grade/section filtering is left to the frontend (same pattern
        used on the main Students list) since this endpoint already
        returns every incomplete student in one call — the admin can
        switch grade/section instantly without another round trip.
        """
        queryset = self.filter_queryset(self.get_queryset()).prefetch_related(
            'documents', 'document_requests'
        )
        doc_labels = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)
        results = []

        for student in queryset:
            required_types = get_required_document_types(student.grade)  # ✅ BUG FIX: cumulative, not exact-grade-only
            uploaded_types = {d.document_type for d in student.documents.all()}
            missing_required = [t for t in required_types if t not in uploaded_types]
            open_requests = [r for r in student.document_requests.all() if not r.is_resolved]

            missing_labels = [doc_labels.get(t, t) for t in missing_required]
            missing_labels += [
                r.custom_label or doc_labels.get(r.document_type, 'Document')
                for r in open_requests
            ]
            missing_photo = not bool(student.photo)

            if not missing_labels and not missing_photo:
                continue  # nothing outstanding — skip, this is a report of gaps only

            results.append({
                'id': student.id,
                'student_id': student.student_id,
                'name': student.formatted_name,
                'grade': student.grade,
                'section': student.section,
                'missing_photo': missing_photo,
                'missing_documents': missing_labels,
                'missing_count': len(missing_labels) + (1 if missing_photo else 0),
                'parent_phone': student.parent_phone,
                'parent_email': getattr(student, 'parent_email', ''),
            })

        # Worst-first, so the admin sees who needs the most follow-up at a glance
        results.sort(key=lambda s: -s['missing_count'])

        return Response({
            'total_incomplete': len(results),
            'total_checked': queryset.count(),
            'students': results,
        })

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
        grade-appropriate enrollment documents, PLUS anything an admin
        manually flagged for this specific student. Used to render the
        parent's checklist and the admin's 'incomplete' badge."""
        student = self.get_object()
        required_types = get_required_document_types(student.grade)  # ✅ BUG FIX: cumulative, not exact-grade-only
        docs_by_type = {}
        for doc in student.documents.all():
            # a type can have multiple rows historically; keep the most
            # recent (documents are ordered '-uploaded_at' by default)
            docs_by_type.setdefault(doc.document_type, doc)
        doc_labels = dict(StudentDocument.DOCUMENT_TYPE_CHOICES)

        required_documents = [
            {
                'value': t,
                'label': doc_labels[t],
                'uploaded': t in docs_by_type,
                # ✅ NEW: parent can see WHY a re-upload is needed instead
                # of a rejected file just sitting there unexplained.
                'status': docs_by_type[t].status if t in docs_by_type else None,
                'review_note': docs_by_type[t].review_note if t in docs_by_type else '',
                'source': 'grade_requirement',
            }
            for t in required_types
        ]

        # ✅ NEW: admin-manual requests specific to this student, merged
        # into the same checklist. A request for a type already in the
        # grade-based list above is skipped here to avoid a duplicate row
        # — its note is folded into the existing entry instead.
        manual_requests = student.document_requests.filter(is_resolved=False)
        existing_values = {d['value'] for d in required_documents}
        for req in manual_requests:
            if req.document_type != 'other' and req.document_type in existing_values:
                for d in required_documents:
                    if d['value'] == req.document_type and req.note:
                        d['admin_note'] = req.note
                continue
            label = req.custom_label or doc_labels.get(req.document_type, 'Document')
            required_documents.append({
                'value': req.document_type,
                'label': label,
                'uploaded': req.document_type in docs_by_type and req.document_type != 'other',
                'status': docs_by_type.get(req.document_type).status if req.document_type in docs_by_type and req.document_type != 'other' else None,
                'review_note': '',
                'admin_note': req.note,
                'source': 'admin_request',
                'request_id': req.id,
            })

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
            defaults={
                'file': request.FILES['file'],
                'custom_label': request.data.get('custom_label', ''),
                'academic_year': _current_academic_year_for(student),
                # ✅ A re-upload (e.g. fixing a rejected scan) needs fresh
                # admin review — without this, a document the admin
                # already rejected would keep showing as "rejected" (or
                # worse, stay silently 'verified' from a previous year's
                # unrelated file) even after the parent submitted a new
                # one.
                'status': 'pending',
                'verified': False,
                'review_note': '',
                'reviewed_at': None,
            }
        )
        _auto_resolve_document_requests(student, document_type)
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
            required_types = get_required_document_types(student.grade)  # ✅ BUG FIX: cumulative, not exact-grade-only
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
        """
        ✅ SECURITY FIX (tenant isolation) — same issue and same fix as
        StudentViewSet.perform_create above: was trusting the raw
        X-School-ID header with no check against the authenticated
        user's actual school, allowing a cross-tenant write (a section
        created under a different school than the one the acting admin
        actually belongs to). Now resolved via get_verified_school_id(),
        which ignores the header entirely for non-super-admins.
        """
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise serializers.ValidationError({"error": "Could not determine your school. If you manage multiple schools, set X-School-ID; otherwise contact support."})
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