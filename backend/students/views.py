# students/views.py - COMPLETE UPDATED with multi-school support
from django.http import HttpResponse
from .services.bulk_import import BulkImportService
import json
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Student
from .serializers import StudentSerializer
from payments.models import Payment, PaymentDeadline, PaymentSlip
import pandas as pd
from io import BytesIO
from datetime import datetime
from schools.models import School
from academics.models import AcademicYear

# ✅ NEW: Import helper functions
from common.utils import get_school_id_from_request, is_super_admin, get_user_school


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    
    def get_queryset(self):
        """Filter students by school (super admin sees all, school admin sees only their school)"""
        queryset = Student.objects.all()
        
        # ✅ Get school ID from request (header or user profile)
        school_id = get_school_id_from_request(self.request)
        user = self.request.user
        
        print(f"📚 StudentViewSet - User: {user.username}, is_super_admin: {is_super_admin(user)}")
        print(f"📚 StudentViewSet - school_id from request: {school_id}")
        
        # ✅ Super admins see all, school admins see only their school
        if not is_super_admin(user) and school_id:
            queryset = queryset.filter(school_id=school_id)
            print(f"📚 Filtered students by school ID (school admin): {school_id}")
        elif school_id:
            queryset = queryset.filter(school_id=school_id)
            print(f"📚 Filtered students by school ID (with filter): {school_id}")
        
        # Filter by academic year
        year_id = self.request.query_params.get('academic_year_id')
        year_param = self.request.query_params.get('academic_year')
        year_alt = self.request.query_params.get('year')
        year_id_alt = self.request.query_params.get('year_id')
        
        year_value = year_id or year_id_alt or year_alt or year_param
        
        if year_value:
            try:
                try:
                    year = AcademicYear.objects.get(id=int(year_value))
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
                serializer = self.get_serializer(student)
                return Response(serializer.data)
            except Student.DoesNotExist:
                return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)
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
                data.append({
                    'id': deadline.id,
                    'deadline_id': deadline.id,
                    'month_name': deadline.get_month_display(),
                    'month_number': deadline.month,
                    'academic_year': deadline.academic_year.name if deadline.academic_year else student.academic_year,
                    'amount': str(deadline.amount),
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
            # ✅ Get school from user profile or header
            school_id = get_school_id_from_request(request)
            
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
            
            # ✅ Get school from user profile or header
            school_id = get_school_id_from_request(request)
            
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

    # ========== NEW: PENDING SLIPS ENDPOINT FOR PARENT DASHBOARD ==========
    
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
        - Students in 'promote_ids' → grade +1, academic_year updated
        - Students NOT in 'promote_ids' → grade stays same, academic_year updated (repeaters)
        - Student IDs NEVER change
        """
        from academics.models import AcademicYear
        
        school_id = get_school_id_from_request(request)
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        
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
                    # ✅ PROMOTE: Grade +1, move to next year
                    if student.grade >= 8:
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