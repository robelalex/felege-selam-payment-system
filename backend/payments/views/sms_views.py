# payments/views/sms_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from students.models import Student
from payments.models import Payment, PaymentDeadline, PaymentReminder
from payments.services.sms_service import SMSService
import json

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_reminders(request):
    """Send SMS reminders to selected students"""
    try:
        data = request.data
        student_ids = data.get('student_ids', [])
        custom_message = data.get('custom_message', '')
        
        if not student_ids:
            return Response({
                'success': False,
                'error': 'No students selected'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get students
        students = Student.objects.filter(id__in=student_ids)
        
        # Prepare SMS recipients
        recipients = []
        sms_service = SMSService()
        
        for student in students:
            # Get pending payments for this student
            paid_deadlines = Payment.objects.filter(
                student=student, 
                status='verified'
            ).values_list('deadline_id', flat=True)
            
            pending_deadlines = PaymentDeadline.objects.filter(
                school=student.school,
                is_active=True
            ).exclude(id__in=paid_deadlines)
            
            if pending_deadlines.exists() and student.parent_phone:
                total_due = sum(d.amount for d in pending_deadlines)
                
                if custom_message:
                    message = custom_message
                else:
                    months = [d.get_month_display() for d in pending_deadlines]
                    months_str = ', '.join(months)
                    message = f"Dear parent, your child {student.full_name} has pending payment for: {months_str}. Total due: {total_due} Birr. Please pay soon. - Felege Selam School"
                
                recipients.append({
                    'phone': student.parent_phone,
                    'message': message
                })
        
        # Send SMS
        if recipients:
            results = sms_service.send_bulk_sms(recipients)
            
            # Create reminder records
            for result in results:
                if result['success']:
                    # Find the student for this phone
                    student = students.filter(parent_phone=result['phone']).first()
                    if student:
                        PaymentReminder.objects.create(
                            student=student,
                            deadline=None,
                            sent_to=result['phone'],
                            message=next((r['message'] for r in recipients if r['phone'] == result['phone']), ''),
                            status='sent'
                        )
            
            return Response({
                'success': True,
                'message': f'Sent {len(results)} SMS reminders',
                'results': results
            })
        else:
            return Response({
                'success': False,
                'error': 'No valid phone numbers found for selected students'
            }, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_payment_confirmation(request, payment_id):
    """Send confirmation SMS after payment verification"""
    try:
        payment = Payment.objects.get(id=payment_id)
        student = payment.student
        
        if not student.parent_phone:
            return Response({
                'success': False,
                'error': 'No phone number for this student'
            })
        
        message = f"Dear parent, we have received your payment of {payment.amount} Birr for {student.full_name} for {payment.deadline.get_month_display()} {payment.deadline.academic_year}. Thank you! - Felege Selam School"
        
        sms_service = SMSService()
        result = sms_service.send_sms(student.parent_phone, message)
        
        if result['success']:
            PaymentReminder.objects.create(
                student=student,
                deadline=payment.deadline,
                sent_to=student.parent_phone,
                message=message,
                status='sent'
            )
            
        return Response(result)
        
    except Payment.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Payment not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)