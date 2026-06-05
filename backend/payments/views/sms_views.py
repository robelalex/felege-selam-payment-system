# backend/payments/views/sms_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from ..services.sms_service import SMSService
from ..models import SMSHistory
from students.models import Student
from academics.models import AcademicYear
from ..models import Payment, PaymentDeadline, PaymentSlip
from django.db import models
from datetime import date

@api_view(['GET'])
@permission_classes([AllowAny])
def sms_balance(request):
    """Check SMS account balance"""
    try:
        service = SMSService()
        balance = service.get_balance()
        
        # ✅ Extract just the balance string if it's an object
        if isinstance(balance, dict) and balance.get('success'):
            if isinstance(balance.get('balance'), dict):
                user_data = balance['balance'].get('UserData', {})
                balance_str = user_data.get('balance', 'Available')
                return Response({'success': True, 'balance': balance_str})
        
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
    """Send bulk reminders to multiple students for the selected academic year with GRADE-SPECIFIC filtering"""
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    
    # ✅ Get academic year from request
    academic_year_id = request.data.get('academic_year_id')
    academic_year_param = request.data.get('academic_year')
    
    print(f"\n{'='*60}")
    print(f"📱 SEND BULK SMS - REQUEST RECEIVED")
    print(f"   student_ids: {student_ids}")
    print(f"   month: {month}")
    print(f"   custom_message: {custom_message[:50] if custom_message else 'None'}...")
    print(f"   school_id: {school_id}")
    print(f"   academic_year_id: {academic_year_id}")
    print(f"   academic_year_param: {academic_year_param}")
    print(f"{'='*60}\n")
    
    if not student_ids:
        return Response({'error': 'No students selected'}, status=400)
    
    try:
        # ✅ Determine which academic year to use
        academic_year = None
        
        if academic_year_id:
            try:
                academic_year = AcademicYear.objects.get(id=academic_year_id)
                print(f"✅ Found academic year by ID: {academic_year.name}")
            except AcademicYear.DoesNotExist:
                print(f"⚠️ Academic year not found by ID: {academic_year_id}")
                pass
        elif academic_year_param:
            try:
                academic_year = AcademicYear.objects.get(year_ec=int(academic_year_param))
                print(f"✅ Found academic year by year_ec: {academic_year.name}")
            except (ValueError, AcademicYear.DoesNotExist):
                academic_year = AcademicYear.objects.filter(name=academic_year_param).first()
                if academic_year:
                    print(f"✅ Found academic year by name: {academic_year.name}")
                else:
                    print(f"⚠️ Academic year not found by param: {academic_year_param}")
        
        # ✅ Fallback to current academic year
        if not academic_year:
            if school_id:
                academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
                print(f"✅ Using current academic year for school {school_id}: {academic_year.name if academic_year else 'None'}")
            else:
                academic_year = AcademicYear.objects.filter(is_current=True).first()
                print(f"✅ Using global current academic year: {academic_year.name if academic_year else 'None'}")
        
        if not academic_year:
            return Response({'error': 'No academic year specified and no current year set'}, status=400)
        
        print(f"\n📚 Academic Year: {academic_year.name}")
        
        # ✅ Get base deadlines for the selected academic year
        base_deadlines = PaymentDeadline.objects.filter(
            academic_year=academic_year.name,
            is_active=True
        )
        
        print(f"📅 Total active deadlines for {academic_year.name}: {base_deadlines.count()}")
        
        # Filter by school if provided
        if school_id:
            try:
                base_deadlines = base_deadlines.filter(school_id=int(school_id))
                print(f"📅 Deadlines after school filter (school_id={school_id}): {base_deadlines.count()}")
            except ValueError:
                pass
        
        # Filter by month if provided
        if month and month != 'all' and month != 'None':
            try:
                base_deadlines = base_deadlines.filter(month=int(month))
                print(f"📅 Deadlines after month filter (month={month}): {base_deadlines.count()}")
            except (ValueError, TypeError):
                pass
        
        # ✅ Filter students by academic year and school
        students = Student.objects.filter(
            student_id__in=student_ids, 
            status='active',
            academic_year=academic_year.name
        )
        
        if school_id:
            try:
                students = students.filter(school_id=int(school_id))
            except ValueError:
                pass
        
        print(f"\n👨‍🎓 Found {students.count()} students matching the criteria")
        
        service = SMSService()
        results = []
        successful_count = 0
        failed_count = 0
        
        for idx, student in enumerate(students, 1):
            print(f"\n--- Student {idx}/{students.count()} ---")
            print(f"ID: {student.student_id}")
            print(f"Name: {student.first_name} {student.last_name}")
            print(f"Grade: {student.grade}")
            print(f"Parent Phone: '{student.parent_phone}'")
            print(f"Parent Email: '{student.parent_email}'")
            
            # Check phone number
            if not student.parent_phone or student.parent_phone.strip() == '':
                print(f"❌ NO PHONE NUMBER - Skipping")
                results.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'phone': None,
                    'success': False,
                    'message': 'No phone number available'
                })
                failed_count += 1
                continue
            
            # Filter deadlines by student's grade
            student_deadlines = base_deadlines.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            print(f"📅 Deadlines applicable for grade {student.grade}: {student_deadlines.count()}")
            
            # List the deadlines
            for d in student_deadlines:
                print(f"   - Month {d.month}: {d.get_month_display()} - Amount: {d.amount}")
            
            # Find paid deadlines for this student
            paid_deadlines = Payment.objects.filter(
                student=student,
                status='verified',
                deadline__academic_year=academic_year.name
            ).values_list('deadline_id', flat=True)
            
            print(f"✅ Paid deadlines: {len(paid_deadlines)}")
            
            # Get pending deadlines (not paid)
            pending = student_deadlines.exclude(id__in=paid_deadlines)
            pending_count = pending.count()
            
            print(f"⏳ Pending deadlines: {pending_count}")
            
            if pending_count > 0:
                # List pending deadlines
                for d in pending:
                    print(f"   PENDING: Month {d.month}: {d.get_month_display()} - Amount: {d.amount}")
                
                if custom_message:
                    message = custom_message
                    print(f"📝 Using custom message")
                else:
                    months_list = []
                    total = 0
                    for d in pending:
                        month_name = d.get_month_display()
                        months_list.append(f"{month_name} ({float(d.amount)} Birr)")
                        total += float(d.amount)
                    
                    message = f"Dear parent, your child {student.first_name} {student.last_name} has pending payment for: {', '.join(months_list)}. Total due: {total:,.2f} Birr. Please pay soon."
                    print(f"📝 Generated message: {message[:100]}...")
                
                print(f"📤 Sending SMS to {student.parent_phone}...")
                result = service.send_sms(
                    student.parent_phone,
                    message,
                    related_to=f"bulk_reminder_{student.student_id}"
                )
                
                print(f"📬 SMS Result: success={result.get('success')}, message={result.get('message', 'N/A')}")
                
                if result.get('success'):
                    successful_count += 1
                else:
                    failed_count += 1
                
                results.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'phone': student.parent_phone,
                    'success': result.get('success', False),
                    'message': result.get('message', 'Sent' if result.get('success') else 'Failed')
                })
            else:
                print(f"⏭️ No pending payments - Skipping")
                results.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'phone': student.parent_phone,
                    'success': False,
                    'message': 'No pending payments for this student'
                })
                failed_count += 1
        
        print(f"\n{'='*60}")
        print(f"📱 BULK SMS COMPLETE")
        print(f"   Total students: {len(results)}")
        print(f"   Successful: {successful_count}")
        print(f"   Failed: {failed_count}")
        print(f"{'='*60}\n")
        
        return Response({
            'total_processed': len(results),
            'successful': successful_count,
            'failed': failed_count,
            'sent': successful_count,
            'results': results
        })
        
    except Exception as e:
        print(f"❌ Error in send_bulk_reminders: {e}")
        import traceback
        traceback.print_exc()
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