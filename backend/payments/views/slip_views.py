# backend/payments/views/slip_views.py - UPDATED with School Filtering
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
from ..models import PaymentSlip, Student, PaymentDeadline, Payment
import os
from django.conf import settings
from ..services.ocr_service import OCRService
from academics.models import AcademicYear
from schools.models import School  # ✅ Added


@api_view(['POST'])
@permission_classes([AllowAny])
def upload_slip(request):
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
        
        # ✅ Verify student belongs to the school from header
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(student.school_id) != school_id:
                    return Response({'error': 'Student does not belong to your school'}, status=403)
            except:
                pass
        
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
@permission_classes([AllowAny])
def pending_slips(request):
    """Get all pending slips for admin, filtered by school and academic year"""
    
    # ✅ FILTER BY SCHOOL FROM HEADER
    school_id = request.headers.get('X-School-ID')
    print(f"📱 pending_slips - X-School-ID: {school_id}")
    
    slips = PaymentSlip.objects.filter(status='pending')
    
    # ✅ Filter by school
    if school_id:
        try:
            slips = slips.filter(student__school_id=int(school_id))
            print(f"📱 Filtered slips by school ID: {school_id}")
        except ValueError:
            print(f"📱 Invalid school ID: {school_id}")
    else:
        # If no school header, return empty (security)
        return Response([], status=200)
    
    # Filter by academic year
    year_id = request.query_params.get('academic_year_id')
    year_param = request.query_params.get('academic_year')
    year_alt = request.query_params.get('year')
    
    year_value = year_id or year_alt or year_param
    
    if year_value:
        try:
            year = AcademicYear.objects.get(id=int(year_value))
            slips = slips.filter(student__academic_year=year.name)
            print(f"📱 Filtering slips by year: {year.name}")
        except (ValueError, AcademicYear.DoesNotExist):
            try:
                year = AcademicYear.objects.get(year_ec=int(year_value))
                slips = slips.filter(student__academic_year=year.name)
                print(f"📱 Filtering slips by year_ec: {year.name}")
            except (ValueError, AcademicYear.DoesNotExist):
                slips = slips.filter(student__academic_year=year_value)
                print(f"📱 Filtering slips by string: {year_value}")
    
    slips = slips.select_related('student', 'deadline').order_by('-uploaded_at')
    
    # Build full image URLs
    data = [{
        'id': s.id,
        'student_id': s.student.student_id,
        'student_name': s.student.full_name,
        'grade': s.student.grade,
        'month': s.deadline.get_month_display(),
        'amount': float(s.amount),
        'bank_name': s.bank_name,
        'slip_image': request.build_absolute_uri(s.slip_image.url) if s.slip_image else None,
        'uploaded_by': s.uploaded_by,
        'uploaded_at': s.uploaded_at,
        'ai_confidence': s.ai_confidence,
        'ai_extracted_amount': float(s.ai_extracted_amount) if s.ai_extracted_amount else None,
        'ai_message': s.ai_message,
        'auto_verified': s.auto_verified
    } for s in slips]
    
    print(f"📱 Returning {len(data)} pending slips")
    return Response(data)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_slip(request, slip_id):
    """Verify or reject a slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        
        # ✅ Verify slip belongs to the school from header
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except:
                pass
        
        action = request.data.get('action')
        
        if action == 'verify':
            slip.status = 'verified'
            slip.verified_by = None
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
@permission_classes([AllowAny])
def ai_stats(request):
    """Get AI verification statistics for the current school"""
    
    # ✅ FILTER BY SCHOOL FROM HEADER
    school_id = request.headers.get('X-School-ID')
    print(f"📊 ai_stats - X-School-ID: {school_id}")
    
    slips = PaymentSlip.objects.all()
    
    if school_id:
        try:
            slips = slips.filter(student__school_id=int(school_id))
            print(f"📊 Filtered stats by school ID: {school_id}")
        except ValueError:
            pass
    
    total = slips.count()
    auto_verified = slips.filter(auto_verified=True).count()
    pending_ai = slips.filter(ai_reviewed=False).count()
    high_confidence = slips.filter(ai_confidence__gte=85).count()
    
    return Response({
        'total_slips': total,
        'auto_verified': auto_verified,
        'pending_ai_review': pending_ai,
        'high_confidence': high_confidence,
        'accuracy_rate': round((auto_verified / total * 100) if total > 0 else 0, 1)
    })