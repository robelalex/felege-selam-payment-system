# payments/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Payment, PaymentDeadline, PaymentReminder
from students.models import Student
from .serializers import PaymentSerializer, PaymentDeadlineSerializer
from .services.reminder_service import ReminderService

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    
    @action(detail=False, methods=['post'])
    def initiate_payment(self, request):
        """Parent initiates a payment"""
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method', 'telebirr')
        paid_by = request.data.get('paid_by')
        paid_by_phone = request.data.get('paid_by_phone')
        
        try:
            student = Student.objects.get(student_id=student_id)
            deadline = PaymentDeadline.objects.get(id=deadline_id)
            
            # Create payment record
            payment = Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method=payment_method,
                paid_by=paid_by,
                paid_by_phone=paid_by_phone,
                status='pending'
            )
            
            serializer = self.get_serializer(payment)
            return Response({
                'success': True,
                'message': 'Payment initiated successfully',
                'payment': serializer.data,
                'instructions': 'Please complete the payment using Telebirr or bank transfer'
            }, status=status.HTTP_201_CREATED)
            
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': 'Payment deadline not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def verify_payment(self, request, pk=None):
        """Admin verifies a payment"""
        payment = self.get_object()
        
        # This would be called by admin after confirming money received
        payment.status = 'verified'
        payment.verified_at = timezone.now()
        payment.verified_by = request.user
        payment.save()
        
        return Response({'success': True, 'message': 'Payment verified successfully'})
    
    @action(detail=False, methods=['get'])
    def pending_verifications(self, request):
        """Get all payments pending verification (for admin)"""
        pending_payments = Payment.objects.filter(status='pending')
        serializer = self.get_serializer(pending_payments, many=True)
        return Response(serializer.data)

class PaymentDeadlineViewSet(viewsets.ModelViewSet):
    queryset = PaymentDeadline.objects.all()
    serializer_class = PaymentDeadlineSerializer
    
    @action(detail=False, methods=['get'])
    def active_deadlines(self, request):
        """Get all active payment deadlines"""
        school_id = request.query_params.get('school_id')
        if school_id:
            deadlines = PaymentDeadline.objects.filter(school_id=school_id, is_active=True)
        else:
            deadlines = PaymentDeadline.objects.filter(is_active=True)
        
        serializer = self.get_serializer(deadlines, many=True)
        return Response(serializer.data)
    
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
            return Response({'error': 'No students selected'}, status=400)
        
        service = ReminderService()
        results = service.send_reminders(student_ids, month, custom_message)
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })