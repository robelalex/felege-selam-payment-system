# backend/payments/views/slip_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny  # Changed to AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
from ..models import PaymentSlip, Student, PaymentDeadline, Payment
import os
from django.conf import settings
from ..services.ocr_service import OCRService

@api_view(['POST'])
@permission_classes([AllowAny])  # 👈 CHANGED
def upload_slip(request):
    # ... (keep your existing code, just change the decorator line above)
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
        
        file_path = default_storage.save(
            f'slips/{student.student_id}_{deadline.id}_{slip_image.name}',
            ContentFile(slip_image.read())
        )
        
        ocr = OCRService()
        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
        ai_result = ocr.verify_slip(full_path, float(amount))
        
        auto_verified = False
        status_value = 'pending'
        
        if ai_result['success'] and ai_result['confidence'] >= 85:
            auto_verified = True
            status_value = 'verified'
        
        slip = PaymentSlip.objects.create(
            student=student,
            deadline=deadline,
            amount=amount,
            bank_name=bank_name,
            slip_image=file_path,
            uploaded_by=request.data.get('uploaded_by', 'Parent'),
            status=status_value,
            ai_confidence=ai_result.get('confidence', 0),
            ai_extracted_amount=ai_result.get('extracted_amount'),
            ai_message=ai_result.get('message', ''),
            ai_reviewed=True,
            auto_verified=auto_verified
        )
        
        if auto_verified:
            Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method='bank_transfer',
                transaction_reference=f'SLIP-AI-{slip.id}',
                status='verified',
                verified_by=None,
                paid_by=request.data.get('uploaded_by', 'Parent'),
                paid_by_phone=''
            )
        
        return Response({
            'success': True,
            'message': 'Slip uploaded successfully',
            'slip_id': slip.id,
            'status': status_value,
            'ai_confidence': ai_result.get('confidence', 0),
            'auto_verified': auto_verified
        }, status=201)
        
    except Student.DoesNotExist:
        return Response({'error': 'Student not found'}, status=404)
    except PaymentDeadline.DoesNotExist:
        return Response({'error': 'Deadline not found'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])  # 👈 CHANGED
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
        'ai_confidence': s.ai_confidence,
        'ai_extracted_amount': float(s.ai_extracted_amount) if s.ai_extracted_amount else None,
        'ai_message': s.ai_message,
        'auto_verified': s.auto_verified
    } for s in slips]
    
    return Response(data)


@api_view(['POST'])
@permission_classes([AllowAny])  # 👈 CHANGED
def verify_slip(request, slip_id):
    """Verify or reject a slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        action = request.data.get('action')
        
        if action == 'verify':
            slip.status = 'verified'
            slip.verified_by = None  # No user for now
            slip.verified_at = timezone.now()
            
            Payment.objects.create(
                student=slip.student,
                deadline=slip.deadline,
                amount=slip.amount,
                payment_method='bank_transfer',
                transaction_reference=f'SLIP-{slip.id}',
                status='verified',
                verified_by=None,
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


@api_view(['GET'])
@permission_classes([AllowAny])  # 👈 CHANGED
def ai_stats(request):
    """Get AI verification statistics"""
    total = PaymentSlip.objects.count()
    auto_verified = PaymentSlip.objects.filter(auto_verified=True).count()
    pending_ai = PaymentSlip.objects.filter(ai_reviewed=False).count()
    high_confidence = PaymentSlip.objects.filter(ai_confidence__gte=85).count()
    
    return Response({
        'total_slips': total,
        'auto_verified': auto_verified,
        'pending_ai_review': pending_ai,
        'high_confidence': high_confidence,
        'accuracy_rate': round((auto_verified / total * 100) if total > 0 else 0, 1)
    })