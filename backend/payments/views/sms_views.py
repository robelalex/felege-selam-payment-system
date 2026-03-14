# backend/payments/views/sms_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from ..services.sms_service import SMSService
from ..models import SMSHistory
from students.models import Student
from academics.models import AcademicYear
from ..models import Payment, PaymentDeadline

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUser])
def sms_balance(request):
    """Check SMS account balance"""
    try:
        service = SMSService()
        balance = service.get_balance()
        return Response(balance)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_test_sms(request):
    """Send a test SMS to verify configuration"""
    phone = request.data.get('phone')
    message = request.data.get('message', 'Test message from Felege Selam School')
    
    if not phone:
        return Response({'error': 'Phone number required'}, status=400)
    
    try:
        service = SMSService()
        result = service.send_sms(phone, message, related_to='test')
        return Response(result)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminUser])
def sms_history(request):
    """Get SMS sending history"""
    try:
        limit = int(request.query_params.get('limit', 100))
        history = SMSHistory.objects.all()[:limit]
        data = [{
            'id': h.id,
            'recipient': h.recipient,
            'message': h.message[:50] + '...' if len(h.message) > 50 else h.message,
            'status': h.status,
            'related_to': h.related_to,
            'created_at': h.created_at,
        } for h in history]
        
        return Response(data)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_payment_reminder(request):
    """Send payment reminder to a specific student"""
    student_id = request.data.get('student_id')
    deadline_id = request.data.get('deadline_id')
    
    try:
        student = Student.objects.get(student_id=student_id)
        deadline = PaymentDeadline.objects.get(id=deadline_id)
        
        # Check if already paid
        if Payment.objects.filter(student=student, deadline=deadline, status='verified').exists():
            return Response({'error': 'Student already paid for this month'}, status=400)
        
        message = f"Dear parent, your child {student.first_name} {student.last_name} has pending payment of {deadline.amount} Birr for {deadline.get_month_display()} {deadline.academic_year}. Please pay soon. - Felege Selam School"
        
        service = SMSService()
        result = service.send_sms(
            student.parent_phone, 
            message,
            related_to=f"reminder_{student.student_id}_{deadline.id}"
        )
        
        return Response(result)
        
    except Student.DoesNotExist:
        return Response({'error': 'Student not found'}, status=404)
    except PaymentDeadline.DoesNotExist:
        return Response({'error': 'Deadline not found'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_bulk_reminders(request):
    """Send bulk reminders to multiple students"""
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    
    if not student_ids:
        return Response({'error': 'No students selected'}, status=400)
    
    try:
        # Get current academic year
        current_year = AcademicYear.objects.filter(is_current=True).first()
        if not current_year:
            return Response({'error': 'No current academic year set'}, status=400)
        
        # Get deadline for specified month or all pending
        if month:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=current_year.name,
                month=month,
                is_active=True
            )
        else:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=current_year.name,
                is_active=True
            )
        
        students = Student.objects.filter(student_id__in=student_ids, status='active')
        
        service = SMSService()
        results = []
        
        for student in students:
            if not student.parent_phone:
                continue
                
            # Find pending deadlines for this student
            paid_deadlines = Payment.objects.filter(
                student=student,
                status='verified'
            ).values_list('deadline_id', flat=True)
            
            pending = deadlines.exclude(id__in=paid_deadlines)
            
            if pending.exists():
                if custom_message:
                    message = custom_message
                else:
                    months = [d.get_month_display() for d in pending]
                    total = sum(d.amount for d in pending)
                    message = f"Dear parent, your child {student.first_name} {student.last_name} has pending payment for: {', '.join(months)}. Total due: {total} Birr. - Felege Selam School"
                
                result = service.send_sms(
                    student.parent_phone,
                    message,
                    related_to=f"bulk_reminder_{student.student_id}"
                )
                results.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'phone': student.parent_phone,
                    'success': result['success']
                })
        
        return Response({
            'total_processed': len(results),
            'successful': sum(1 for r in results if r['success']),
            'failed': sum(1 for r in results if not r['success']),
            'results': results
        })
    except Exception as e:
        return Response({'error': str(e)}, status=500)