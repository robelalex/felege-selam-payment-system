from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from ..models import PaymentSlip, Student, PaymentDeadline
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os

@api_view(['POST'])
@permission_classes([AllowAny])  # Parents don't need login
def upload_slip(request):
    """Upload a bank slip for verification"""
    try:
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        amount = request.data.get('amount')
        bank_name = request.data.get('bank_name', '')
        slip_image = request.FILES.get('slip_image')
        
        if not all([student_id, deadline_id, amount, slip_image]):
            return Response({'error': 'Missing required fields'}, status=400)
        
        student = Student.objects.get(student_id=student_id)
        deadline = PaymentDeadline.objects.get(id=deadline_id)
        
        # Save the image
        file_path = default_storage.save(
            f'slips/{student.student_id}_{deadline.id}_{slip_image.name}',
            ContentFile(slip_image.read())
        )
        
        slip = PaymentSlip.objects.create(
            student=student,
            deadline=deadline,
            amount=amount,
            bank_name=bank_name,
            slip_image=file_path,
            uploaded_by=request.data.get('uploaded_by', 'Parent'),
            status='pending'
        )
        
        return Response({
            'success': True,
            'message': 'Slip uploaded successfully',
            'slip_id': slip.id
        }, status=201)
        
    except Student.DoesNotExist:
        return Response({'error': 'Student not found'}, status=404)
    except PaymentDeadline.DoesNotExist:
        return Response({'error': 'Deadline not found'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_slips(request):
    """Get all pending slips for admin"""
    slips = PaymentSlip.objects.filter(status='pending').select_related('student', 'deadline')
    data = [{
        'id': s.id,
        'student_id': s.student.student_id,
        'student_name': s.student.full_name,
        'grade': s.student.grade,
        'month': s.deadline.get_month_display(),
        'amount': float(s.amount),
        'bank_name': s.bank_name,
        'slip_image': s.slip_image.url if s.slip_image else None,
        'uploaded_by': s.uploaded_by,
        'uploaded_at': s.uploaded_at,
    } for s in slips]
    
    return Response(data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_slip(request, slip_id):
    """Verify or reject a slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        action = request.data.get('action')  # 'verify' or 'reject'
        
        if action == 'verify':
            slip.status = 'verified'
            slip.verified_by = request.user
            slip.verified_at = timezone.now()
            
            # Also create a payment record
            from .models import Payment
            Payment.objects.create(
                student=slip.student,
                deadline=slip.deadline,
                amount=slip.amount,
                payment_method='bank_transfer',
                transaction_reference=f'SLIP-{slip.id}',
                status='verified',
                verified_by=request.user,
                paid_by=slip.uploaded_by,
                paid_by_phone=''
            )
            
        elif action == 'reject':
            slip.status = 'rejected'
        else:
            return Response({'error': 'Invalid action'}, status=400)
        
        slip.save()
        
        return Response({'success': True, 'status': slip.status})
        
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)