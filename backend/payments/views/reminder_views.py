# backend/payments/views/reminder_views.py - UPDATED with School Filtering
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
        
        print(f"📱 ReminderViewSet.pending - school_id: {school_id}")
        print(f"📱 ReminderViewSet.pending - year_id: {year_id}")
        
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
            school_id=school_id  # ✅ Pass school_id to service
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
            school_id=school_id  # ✅ Pass school_id to service
        )
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })


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
    """Get pending reminders filtered by academic year - with school filtering"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    year_id = request.query_params.get('academic_year_id')
    
    print(f"📱 ===== STANDALONE REMINDER FUNCTION CALLED =====")
    print(f"📱 school_id: {school_id}")
    print(f"📱 year_id: {year_id}")
    
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
        
        print(f"📱 Students found: {students.count()}")
        
        # Get deadlines for this academic year AND this school
        deadlines = PaymentDeadline.objects.filter(
            academic_year=academic_year.name,
            is_active=True,
            school_id=int(school_id)
        )
        
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
            for deadline in deadlines:
                if (student.id, deadline.id) not in paid_set:
                    student_pending.append({
                        'month': deadline.month,
                        'month_name': deadline.get_month_display(),
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date,
                        'deadline_id': deadline.id
                    })
            
            if student_pending:
                pending_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'parent_phone': student.parent_phone,
                    'pending_months': student_pending,
                    'total_due': sum(p['amount'] for p in student_pending)
                })
        
        return Response({
            'total_pending': len(pending_students),
            'total_pending_months': sum(len(p['pending_months']) for p in pending_students),
            'students': pending_students,
            'academic_year': academic_year.name
        })
        
    except AcademicYear.DoesNotExist:
        return Response({'error': 'Academic year not found'}, status=404)