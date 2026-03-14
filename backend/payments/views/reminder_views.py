# backend/payments/views/reminder_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from ..services.reminder_service import ReminderService

class ReminderViewSet(viewsets.ViewSet):
    """ViewSet for handling payment reminders"""
    
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all students with pending payments"""
        month = request.query_params.get('month')
        grade = request.query_params.get('grade')
        
        service = ReminderService()
        results = service.get_pending_students(month, grade)
        
        return Response(results)
    
    @action(detail=False, methods=['post'])
    def send(self, request):
        """Send SMS reminders to selected students"""
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        service = ReminderService()
        results = service.send_reminders(student_ids, month, custom_message)
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })

# 👇 ADD THIS FUNCTION - It's missing!
def send_reminders(request):
    """Legacy function for sending reminders"""
    service = ReminderService()
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    results = service.send_reminders(student_ids, month, custom_message)
    return Response(results)

def send_payment_confirmation(request, payment_id):
    """Send payment confirmation SMS"""
    from .sms_views import send_payment_confirmation as sms_confirmation
    return sms_confirmation(request, payment_id)