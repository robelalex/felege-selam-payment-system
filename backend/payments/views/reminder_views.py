# backend/payments/views/reminder_views.py - UPDATED with Email Reminders & Search
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from ..services.reminder_service import ReminderService
from academics.models import AcademicYear
from students.models import Student
from ..models import Payment, PaymentDeadline
from django.db import models
from schools.models import SchoolAdminProfile
from datetime import date

class ReminderViewSet(viewsets.ViewSet):
    """ViewSet for handling payment reminders with school filtering"""
    
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all students with pending payments for the selected academic year"""
        
        # ✅ Get school from header
        school_id = request.headers.get('X-School-ID')
        year_id = request.query_params.get('academic_year_id')
        year_param = request.query_params.get('academic_year')
        year_alt = request.query_params.get('year')
        month = request.query_params.get('month')
        grade = request.query_params.get('grade')
        student_search = request.query_params.get('student_search')
        
        print(f"📱 ReminderViewSet.pending - school_id: {school_id}")
        print(f"📱 ReminderViewSet.pending - year_id: {year_id}")
        print(f"📱 ReminderViewSet.pending - student_search: {student_search}")
        
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        
        # Determine academic year
        academic_year = None
        year_value = year_id or year_alt or year_param
        
        if year_value:
            try:
                academic_year = AcademicYear.objects.get(id=int(year_value), school_id=int(school_id))
                print(f"📱 Found academic year by ID: {academic_year.name}")
            except (ValueError, AcademicYear.DoesNotExist):
                try:
                    academic_year = AcademicYear.objects.get(year_ec=int(year_value), school_id=int(school_id))
                    print(f"📱 Found academic year by year_ec: {academic_year.name}")
                except (ValueError, AcademicYear.DoesNotExist):
                    try:
                        academic_year = AcademicYear.objects.get(name=year_value, school_id=int(school_id))
                        print(f"📱 Found academic year by name: {academic_year.name}")
                    except AcademicYear.DoesNotExist:
                        academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
                        print(f"📱 Using current academic year: {academic_year.name if academic_year else 'None'}")
        else:
            academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
            print(f"📱 No year param, using current: {academic_year.name if academic_year else 'None'}")
        
        # Create service and get results with academic year filter
        service = ReminderService()
        results = service.get_pending_students(
            month=month, 
            grade=grade,
            academic_year=academic_year.name if academic_year else None,
            school_id=school_id,
            student_search=student_search
        )
        
        return Response(results)
    
    @action(detail=False, methods=['post'])
    def send(self, request):
        """Send SMS reminders to selected students"""
        
        # ✅ Get school from header
        school_id = request.headers.get('X-School-ID')
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        academic_year = request.data.get('academic_year')
        
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        # ✅ Verify all students belong to this school
        students = Student.objects.filter(student_id__in=student_ids, school_id=int(school_id))
        if students.count() != len(student_ids):
            return Response({'error': 'Some students do not belong to your school'}, status=403)
        
        service = ReminderService()
        results = service.send_reminders(
            student_ids, 
            month, 
            custom_message,
            academic_year=academic_year,
            school_id=school_id
        )
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })
    
    # ✅ FIXED: Email reminders endpoint
    @action(detail=False, methods=['post'])
    def send_email_reminders(self, request):
        """Send EMAIL reminders to selected students"""
        
        # ✅ Get school from header
        school_id = request.headers.get('X-School-ID')
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        academic_year = request.data.get('academic_year')
        
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        # ✅ Import all required modules
        from common.email_service import send_payment_reminder_email, PaymentLinkService
        from schools.models import School
        
        # ✅ Get school object
        school = School.objects.get(id=int(school_id))
        
        # ✅ Verify all students belong to this school
        students = Student.objects.filter(student_id__in=student_ids, school_id=int(school_id))
        
        results = []
        
        for student in students:
            # Get parent email
            parent_email = getattr(student, 'parent_email', None)
            
            if not parent_email:
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': None,
                    'success': False,
                    'message': 'No email address found for this student'
                })
                continue
            
            # Get pending months for this student
            pending_months_list = []
            total_due = 0
            pending_deadlines = []
            
            # Get deadlines for the academic year
            year_name = academic_year
            if not year_name:
                # Get current academic year for this school
                current_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
                year_name = current_year.name if current_year else None
            
            # Get deadlines
            deadlines = PaymentDeadline.objects.filter(
                academic_year=year_name,
                is_active=True,
                school_id=int(school_id)
            )
            
            # Filter by month if specified
            if month and month != 'all' and month != 'None':
                try:
                    deadlines = deadlines.filter(month=int(month))
                except (ValueError, TypeError):
                    pass
            
            # Only get deadlines that apply to this student's grade
            student_deadlines = deadlines.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            # Get paid deadline IDs
            paid_deadline_ids = Payment.objects.filter(
                student=student,
                status='verified'
            ).values_list('deadline_id', flat=True)
            
            # Find unpaid deadlines
            for deadline in student_deadlines:
                if deadline.id not in paid_deadline_ids:
                    month_name = self.get_month_name(deadline.month)
                    pending_months_list.append(f"{month_name} - {float(deadline.amount)} Birr")
                    total_due += float(deadline.amount)
                    pending_deadlines.append(deadline)
            
            if not pending_months_list:
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': parent_email,
                    'success': False,
                    'message': 'No pending payments found for this student'
                })
                continue
            
            pending_months_text = ', '.join(pending_months_list)
            
            # Generate payment link for first pending deadline
            payment_link = None
            if pending_deadlines:
                first_deadline = pending_deadlines[0]
                payment_link = PaymentLinkService.generate_payment_link(
                    student_id=student.student_id,
                    deadline_id=first_deadline.id,
                    amount=float(first_deadline.amount),
                    student_name=student.full_name
                )
            
            # Send email - CORRECT ORDER with all parameters
            email_result = send_payment_reminder_email(
                recipient_email=parent_email,
                student_name=student.full_name,
                pending_months=pending_months_text,
                total_due=total_due,
                custom_message=custom_message if custom_message else None,
                school=school,
                payment_link=payment_link
            )
            
            # Handle result
            if isinstance(email_result, tuple):
                success = email_result[0]
                message = email_result[1] if len(email_result) > 1 else ('Sent' if success else 'Failed')
            else:
                success = email_result.get('success', False) if isinstance(email_result, dict) else False
                message = email_result.get('message', '') if isinstance(email_result, dict) else ('Sent' if success else 'Failed')
            
            results.append({
                'student_id': student.student_id,
                'student_name': student.full_name,
                'email': parent_email,
                'success': success,
                'message': message
            })
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })
    
    def get_month_name(self, month_num):
        """Convert month number to Amharic name"""
        months = [
            'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
            'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
        ]
        try:
            if month_num is None:
                return "All Months"
            return months[int(month_num) - 1]
        except:
            return f"ወር {month_num}"


# ✅ Helper functions
@api_view(['POST'])
@permission_classes([AllowAny])
def send_reminders(request):
    """Legacy function for sending reminders"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    service = ReminderService()
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    academic_year = request.data.get('academic_year')
    
    results = service.send_reminders(
        student_ids, 
        month, 
        custom_message, 
        academic_year=academic_year,
        school_id=school_id
    )
    
    return Response({
        'successful': len([r for r in results if r['success']]),
        'failed': len([r for r in results if not r['success']]),
        'total_processed': len(results),
        'results': results
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def send_payment_confirmation(request, payment_id):
    """Send payment confirmation SMS"""
    from .sms_views import send_payment_confirmation as sms_confirmation
    return sms_confirmation(request, payment_id)


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_reminders_filtered(request):
    """Get pending reminders filtered by academic year - with school filtering and GRADE-SPECIFIC deadlines"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    year_id = request.query_params.get('academic_year_id')
    month = request.query_params.get('month')
    grade = request.query_params.get('grade')
    student_search = request.query_params.get('student_search')
    
    print(f"📱 ===== STANDALONE REMINDER FUNCTION CALLED =====")
    print(f"📱 school_id: {school_id}")
    print(f"📱 year_id: {year_id}")
    print(f"📱 month: {month}")
    print(f"📱 grade: {grade}")
    print(f"📱 student_search: {student_search}")
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    if not year_id:
        return Response({'error': 'academic_year_id required'}, status=400)
    
    try:
        academic_year = AcademicYear.objects.get(id=int(year_id), school_id=int(school_id))
        print(f"📱 Academic year: {academic_year.name}")
        
        # Get students in this academic year AND this school
        students = Student.objects.filter(
            status='active',
            academic_year=academic_year.name,
            school_id=int(school_id)
        )
        
        # Filter by grade if provided
        if grade and grade != 'all' and grade != 'None':
            try:
                students = students.filter(grade=int(grade))
                print(f"📱 Filtered to grade: {grade}")
            except (ValueError, TypeError):
                pass
        
        # Filter by student search if provided
        if student_search and student_search != '':
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
            print(f"📱 Filtered by search: {student_search}")
        
        print(f"📱 Students found: {students.count()}")
        
        # ✅ Get base deadlines for this academic year AND this school
        base_deadlines = PaymentDeadline.objects.filter(
            academic_year=academic_year.name,
            is_active=True,
            school_id=int(school_id)
        )
        
        # Filter by month if provided
        if month and month != 'all' and month != 'None':
            try:
                base_deadlines = base_deadlines.filter(month=int(month))
                print(f"📱 Filtered to month: {month}")
            except (ValueError, TypeError):
                pass
        
        # Get verified payments
        verified_payments = Payment.objects.filter(
            status='verified',
            student__academic_year=academic_year.name,
            student__school_id=int(school_id)
        ).values_list('student_id', 'deadline_id')
        
        paid_set = set()
        for student_id, deadline_id in verified_payments:
            paid_set.add((student_id, deadline_id))
        
        pending_students = []
        
        for student in students:
            student_pending = []
            
            # ✅ CRITICAL FIX: Filter deadlines by student's grade
            student_deadlines = base_deadlines.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            print(f"📱 Student {student.student_id} (Grade {student.grade}) has {student_deadlines.count()} applicable deadlines")
            
            for deadline in student_deadlines:
                if (student.id, deadline.id) not in paid_set:
                    student_pending.append({
                        'month': deadline.month,
                        'month_name': deadline.get_month_display(),
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date,
                        'deadline_id': deadline.id,
                        'days_overdue': (date.today() - deadline.due_date).days if deadline.due_date and deadline.due_date < date.today() else 0
                    })
            
            if student_pending:
                parent_email = getattr(student, 'parent_email', None)
                if not parent_email:
                    parent_email = getattr(student, 'guardian_email', None)
                
                pending_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'parent_phone': student.parent_phone,
                    'parent_name': student.parent_full_name,
                    'parent_email': parent_email,
                    'pending_months': student_pending,
                    'total_due': sum(p['amount'] for p in student_pending),
                    'academic_year': student.academic_year
                })
        
        return Response({
            'total_pending': len(pending_students),
            'total_pending_months': sum(len(p['pending_months']) for p in pending_students),
            'students': pending_students,
            'academic_year': academic_year.name
        })
        
    except AcademicYear.DoesNotExist:
        return Response({'error': 'Academic year not found'}, status=404)