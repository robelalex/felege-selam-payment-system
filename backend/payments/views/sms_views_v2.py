# payments/views/sms_views_v2.py
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.core.exceptions import ObjectDoesNotExist
from ..services.multi_school_sms_service import MultiSchoolSMSService
from payments.tokens import generate_payment_token
from payments.models import Payment as PaymentModel
from ..models import SMSHistory, PaymentDeadline
from students.models import Student
from schools.models import School
from schools.utils import get_school_for_user
from academics.models import AcademicYear
import logging

logger = logging.getLogger(__name__)

# ============ MULTI-SCHOOL SMS ENDPOINTS ============

class MultiSchoolSMSBalanceView(APIView):
    """Get SMS balance for the current school"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # ✅ FIX: this used to require request.user.school_profile directly
        # and a matching X-School-ID header, which only worked for accounts
        # with a SchoolAdminProfile row. super_admin accounts (and staff
        # logins resolved only through UserProfile) don't necessarily have
        # one, so this endpoint 400/403'd for them and the SMS dashboard's
        # usage card silently failed to load. get_school_for_user() is the
        # same resolver already used by SchoolSMSConfigView/SchoolSMSTestView
        # (SchoolAdminProfile -> UserProfile -> X-School-ID header fallback),
        # so this endpoint now behaves consistently with the rest of the
        # SMS settings flow instead of being stricter than everything else.
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            sms_service = MultiSchoolSMSService(school.id)
            balance = sms_service.get_balance()
            return Response(balance)
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=500)


class MultiSchoolSendTestSMSView(APIView):
    """Send test SMS using current school's credentials"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # ✅ FIX: same robust resolver as MultiSchoolSMSBalanceView above —
        # see the comment there for why the old school_profile-only lookup
        # broke this for super_admin / UserProfile-only accounts.
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        phone = request.data.get('phone')
        if not phone:
            phone = school.phone
            if not phone:
                return Response({'error': 'No phone number provided. Please provide a phone number or add school phone.'}, status=400)
        
        try:
            sms_service = MultiSchoolSMSService(school.id)
            result = sms_service.test_credentials()
            return Response(result)
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=500)


class MultiSchoolSendPaymentReminderView(APIView):
    """Send payment reminder with payment link to a specific student"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # ✅ FIX: same robust resolver — see MultiSchoolSMSBalanceView comment.
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        
        if not student_id or not deadline_id:
            return Response({'error': 'student_id and deadline_id required'}, status=400)
        
        try:
            # Get student and deadline
            student = Student.objects.get(student_id=student_id, school=school)
            deadline = PaymentDeadline.objects.get(id=deadline_id, school=school)
            
            # Check if already paid
            from ..models import Payment
            if Payment.objects.filter(student=student, deadline=deadline, status='verified').exists():
                return Response({'error': 'Student already paid for this deadline'}, status=400)
            

            # ✅ MONEY-SAFETY FIX (Jimma request #1 — fee exceptions): this
            # used to always create the pending Payment with
            # `deadline.amount`. That Payment row is exactly what gets
            # charged later when the parent clicks the SMS payment link
            # (PaymentInitiateView -> initiate_payment_checkout reads
            # payment.amount as-is) — so a waiver/partial student texted
            # this link would have been charged the full normal fee,
            # silently overriding their approved exception. Now computed
            # the same way as the Chapa "Pay Now" button.
            from ..services.fee_override_service import get_effective_deadline_amount
            effective_amount = get_effective_deadline_amount(student, deadline)
            if effective_amount <= 0:
                return Response({'error': 'Nothing is due for this month — already covered by a fee waiver.'}, status=400)

            payment_obj, created = PaymentModel.objects.get_or_create(
                student=student,
                deadline=deadline,
                defaults={
                    'amount': effective_amount,
                    'payment_method': 'chapa',
                    'paid_by': student.full_name,
                    'paid_by_phone': student.parent_phone,
                    'status': 'pending'
                }
            )
            if not created and payment_obj.status == 'pending' and payment_obj.amount != effective_amount:
                # An override could have been granted/changed after this
                # pending row was first created — keep it in sync.
                payment_obj.amount = effective_amount
                payment_obj.save(update_fields=['amount'])
            token, record = generate_payment_token(payment_obj, student.parent_phone, channel="sms")
            payment_link = f"https://felege-selam-payment-system.vercel.app/pay/{token}"
            
            # Create bilingual message with payment link
            # ✅ FIX: display_label -> "Registration Fee" for registration
            # deadlines instead of get_month_display() showing a blank
            # month value.
            message = f"""የትምህርት ክፍያ ማስታወሻ - {deadline.display_label} {deadline.academic_year}

ለ: {student.full_name}
ክፍያ: {effective_amount} ብር
የማስከፈያ ቀን: {deadline.due_date}

እባክዎ በመስመር ላይ ለመክፈል ይህን አገናኝ ይጫኑ:
{payment_link}

ለማንኛውም ጥያቄ ወደ ትምህርት ቤቱ ይደውሉ: {school.phone}

---
Payment Reminder - {deadline.academic_year} {deadline.display_label}

Student: {student.full_name}
Amount: {effective_amount} ETB
Due: {deadline.due_date}

Click here to pay online: {payment_link}

For questions, call: {school.phone}"""
            
            # Send using multi-school SMS
            sms_service = MultiSchoolSMSService(school.id)
            result = sms_service.send_sms(
                student.parent_phone,
                message,
                related_to=f"reminder_{student.student_id}_{deadline.id}"
            )
            
            # Log to SMSHistory
            SMSHistory.objects.create(
                recipient=student.parent_phone,
                message=message[:500],
                status='sent' if result.get('success') else 'failed',
                message_id=result.get('message_id', ''),
                related_to=f"deadline_{deadline.id}_student_{student.id}"
            )
            
            # Also create PaymentReminder record
            from ..models import PaymentReminder
            PaymentReminder.objects.create(
                student=student,
                deadline=deadline,
                sent_to=student.parent_phone,
                message=message[:500],
                status='sent'
            )
            
            return Response({
                'success': True,
                'message': 'Payment reminder sent successfully',
                'payment_link': payment_link,
                'sms_result': result
            })
            
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=404)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': 'Deadline not found'}, status=404)
        except Exception as e:
            logger.error(f"Failed to send reminder: {e}")
            return Response({'error': str(e)}, status=500)


class MultiSchoolSendBulkRemindersView(APIView):
    """Send bulk payment reminders with payment links to multiple students"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # ✅ FIX: same robust resolver — see MultiSchoolSMSBalanceView comment.
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        student_ids = request.data.get('student_ids', [])
        deadline_id = request.data.get('deadline_id')
        custom_message = request.data.get('message', '')
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=400)
        
        if not deadline_id:
            return Response({'error': 'deadline_id required'}, status=400)
        
        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id, school=school)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': 'Deadline not found'}, status=404)
        
        # Get students
        students = Student.objects.filter(
            student_id__in=student_ids,
            school=school,
            status='active'
        ).exclude(parent_phone__isnull=True).exclude(parent_phone='')
        
        results = []
        successful_count = 0
        
        sms_service = MultiSchoolSMSService(school.id)
        
        for student in students:
            try:
                # Check if already paid
                from ..models import Payment
                if Payment.objects.filter(student=student, deadline=deadline, status='verified').exists():
                    results.append({
                        'student_id': student.student_id,
                        'name': student.full_name,
                        'success': False,
                        'message': 'Already paid'
                    })
                    continue
                
                # ✅ Fee exceptions (Jimma request #1) + money-safety, same
                # reasoning as the single-reminder view above — skip
                # students already fully covered, and always compute the
                # charged amount server-side.
                from ..services.fee_override_service import get_effective_deadline_amount
                effective_amount = get_effective_deadline_amount(student, deadline)
                if effective_amount <= 0:
                    results.append({
                        'student_id': student.student_id,
                        'name': student.full_name,
                        'success': False,
                        'message': 'Covered by fee waiver — nothing due'
                    })
                    continue

                # Generate secure payment link
                payment_obj, created = PaymentModel.objects.get_or_create(
                    student=student,
                    deadline=deadline,
                    defaults={
                        'amount': effective_amount,
                        'payment_method': 'chapa',
                        'paid_by': student.full_name,
                        'paid_by_phone': student.parent_phone,
                        'status': 'pending'
                    }
                )
                if not created and payment_obj.status == 'pending' and payment_obj.amount != effective_amount:
                    payment_obj.amount = effective_amount
                    payment_obj.save(update_fields=['amount'])
                token, record = generate_payment_token(payment_obj, student.parent_phone, channel="sms")
                payment_link = f"https://felege-selam-payment-system.vercel.app/pay/{token}"
                
                # Build message
                if custom_message:
                    message = f"{custom_message}\n\nPay here: {payment_link}"
                else:
                    message = f"""የትምህርት ክፍያ ማስታወሻ - {deadline.academic_year} {deadline.display_label}

ለ: {student.full_name}
ክፍያ: {effective_amount} ብር
የማስከፈያ ቀን: {deadline.due_date}

እባክዎ በመስመር ላይ ይክፈሉ: {payment_link}

ለማንኛውም ጥያቄ ወደ ትምህርት ቤቱ ይደውሉ: {school.phone}"""
                
                # Send SMS
                result = sms_service.send_sms(
                    student.parent_phone,
                    message,
                    related_to=f"bulk_reminder_{deadline.id}"
                )
                
                if result.get('success'):
                    successful_count += 1
                    
                    # Log to SMSHistory
                    SMSHistory.objects.create(
                        recipient=student.parent_phone,
                        message=message[:500],
                        status='sent',
                        message_id=result.get('message_id', ''),
                        related_to=f"bulk_{deadline.id}_student_{student.id}"
                    )
                    
                    # Create PaymentReminder record
                    from ..models import PaymentReminder
                    PaymentReminder.objects.create(
                        student=student,
                        deadline=deadline,
                        sent_to=student.parent_phone,
                        message=message[:500],
                        status='sent'
                    )
                
                results.append({
                    'student_id': student.student_id,
                    'name': student.full_name,
                    'phone': student.parent_phone,
                    'success': result.get('success', False),
                    'message': result.get('message', 'Sent' if result.get('success') else 'Failed')
                })
                
            except Exception as e:
                logger.error(f"Failed for student {student.student_id}: {e}")
                results.append({
                    'student_id': student.student_id,
                    'name': student.full_name,
                    'success': False,
                    'error': str(e)
                })
        
        return Response({
            'total_processed': len(results),
            'successful': successful_count,
            'failed': len(results) - successful_count,
            'deadline': {
                'id': deadline.id,
                'month': deadline.display_label,
                'amount': float(deadline.amount)
            },
            'results': results
        })


class MultiSchoolSMSPendingRemindersView(APIView):
    """Get students with pending payments for a deadline"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, deadline_id):
        # ✅ FIX: same robust resolver — see MultiSchoolSMSBalanceView comment.
        try:
            school = get_school_for_user(request)
        except ObjectDoesNotExist as e:
            return Response(
                {'error': 'School association not found.', 'detail': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id, school=school)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': 'Deadline not found'}, status=404)
        
        # Get all active students in this school
        students = Student.objects.filter(school=school, status='active')
        
        # Filter by grade if deadline has specific grade
        if deadline.grade:
            students = students.filter(grade=deadline.grade)
        
        # Get students who have NOT paid this deadline
        from ..models import Payment
        paid_student_ids = Payment.objects.filter(
            deadline=deadline,
            status='verified'
        ).values_list('student_id', flat=True)
        
        pending_students = students.exclude(id__in=paid_student_ids)
        
        # Only include students with phone numbers
        pending_students = pending_students.exclude(parent_phone__isnull=True).exclude(parent_phone='')
        
        # ✅ Fee exceptions (Jimma request #1): show staff the real amount
        # each student owes (waiver/partial), not the blanket deadline
        # amount — this list is what staff pick reminder recipients from.
        from ..services.fee_override_service import get_effective_deadline_amount
        data = []
        for s in pending_students:
            effective_amount = get_effective_deadline_amount(s, deadline)
            if effective_amount <= 0:
                continue
            data.append({
                'student_id': s.student_id,
                'name': s.full_name,
                'grade': s.grade,
                'parent_phone': s.parent_phone,
                'parent_email': s.parent_email,
                'amount': float(effective_amount)
            })
        
        return Response({
            'deadline': {
                'id': deadline.id,
                'month': deadline.display_label,
                'academic_year': deadline.academic_year,
                'amount': float(deadline.amount),
                'due_date': deadline.due_date
            },
            'total_pending': len(data),
            'students': data
        })