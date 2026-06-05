# backend/payments/views/sms_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from ..services.sms_service import SMSService
from ..models import SMSHistory
from students.models import Student
from academics.models import AcademicYear
from ..models import Payment, PaymentDeadline, PaymentSlip  # ✅ Added PaymentSlip

@api_view(['GET'])
@permission_classes([AllowAny])
def sms_balance(request):
    """Check SMS account balance"""
    try:
        service = SMSService()
        balance = service.get_balance()
        return Response(balance)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
def send_bulk_reminders(request):
    """Send bulk reminders to multiple students for the selected academic year"""
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    
    # ✅ Get academic year from request
    academic_year_id = request.data.get('academic_year_id')
    academic_year_param = request.data.get('academic_year')
    
    if not student_ids:
        return Response({'error': 'No students selected'}, status=400)
    
    try:
        # ✅ Determine which academic year to use
        academic_year = None
        
        if academic_year_id:
            try:
                academic_year = AcademicYear.objects.get(id=academic_year_id)
            except AcademicYear.DoesNotExist:
                pass
        elif academic_year_param:
            try:
                academic_year = AcademicYear.objects.get(year_ec=int(academic_year_param))
            except (ValueError, AcademicYear.DoesNotExist):
                academic_year = AcademicYear.objects.filter(name=academic_year_param).first()
        
        # ✅ Fallback to current academic year
        if not academic_year:
            academic_year = AcademicYear.objects.filter(is_current=True).first()
        
        if not academic_year:
            return Response({'error': 'No academic year specified and no current year set'}, status=400)
        
        print(f"📱 Sending bulk reminders for academic year: {academic_year.name}")
        
        # ✅ Get deadlines for the selected academic year
        if month:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=academic_year.name,
                month=month,
                is_active=True
            )
        else:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=academic_year.name,
                is_active=True
            )
        
        # ✅ Filter students by academic year
        students = Student.objects.filter(
            student_id__in=student_ids, 
            status='active',
            academic_year=academic_year.name  # ✅ Only students in selected year
        )
        
        print(f"📱 Found {students.count()} students in {academic_year.name}")
        
        service = SMSService()
        results = []
        
        for student in students:
            if not student.parent_phone:
                continue
                
            # Find pending deadlines for this student (only in selected academic year)
            paid_deadlines = Payment.objects.filter(
                student=student,
                status='verified',
                deadline__academic_year=academic_year.name  # ✅ Only payments in selected year
            ).values_list('deadline_id', flat=True)
            
            pending = deadlines.exclude(id__in=paid_deadlines)
            
            if pending.exists():
                if custom_message:
                    message = custom_message
                else:
                    months_list = [d.get_month_display() for d in pending]
                    total = sum(d.amount for d in pending)
                    message = f"Dear parent, your child {student.first_name} {student.last_name} has pending payment for: {', '.join(months_list)}. Total due: {total} Birr. - Felege Selam School"
                
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


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_slips(request):
    """Get all pending slips for admin, filtered by academic year"""
    slips = PaymentSlip.objects.filter(status='pending')
    
    # ✅ Filter by academic year using student's academic_year
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