# payments/views/sms_views_v2.py
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from ..services.multi_school_sms_service import MultiSchoolSMSService
from ..services.payment_link_service import PaymentLinkService
from ..models import SMSHistory, PaymentDeadline
from students.models import Student
from schools.models import School
from academics.models import AcademicYear
import logging

logger = logging.getLogger(__name__)

# ============ MULTI-SCHOOL SMS ENDPOINTS ============

class MultiSchoolSMSBalanceView(APIView):
    """Get SMS balance for the current school"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'X-School-ID header required'}, status=400)
        
        # Verify admin has access
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) != school_id:
                return Response({'error': 'Access denied'}, status=403)
            school = admin_profile.school
        except Exception as e:
            return Response({'error': 'School admin profile not found'}, status=403)
        
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
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'X-School-ID header required'}, status=400)
        
        # Verify admin has access
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) != school_id:
                return Response({'error': 'Access denied'}, status=403)
            school = admin_profile.school
        except Exception as e:
            return Response({'error': 'School admin profile not found'}, status=403)
        
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
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'X-School-ID header required'}, status=400)
        
        # Verify admin has access
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) != school_id:
                return Response({'error': 'Access denied'}, status=403)
            school = admin_profile.school
        except Exception as e:
            return Response({'error': 'School admin profile not found'}, status=403)
        
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
            
            # Generate payment link
            payment_link = PaymentLinkService.generate_payment_link(
                student_id=student.student_id,
                deadline_id=deadline.id,
                amount=float(deadline.amount),
                student_name=student.full_name
            )
            
            # Create bilingual message with payment link
            message = f"""የትምህርት ክፍያ ማስታወሻ - {deadline.get_month_display()} {deadline.academic_year}

ለ: {student.full_name}
ክፍያ: {deadline.amount} ብር
የማስከፈያ ቀን: {deadline.due_date}

እባክዎ በመስመር ላይ ለመክፈል ይህን አገናኝ ይጫኑ:
{payment_link}

በማንኛውም ጥያቄ ወደ ትምህርት ቤቱ ይደውሉ: {school.phone}

---
Payment Reminder - {deadline.academic_year} {deadline.get_month_display()}

Student: {student.full_name}
Amount: {deadline.amount} ETB
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
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'X-School-ID header required'}, status=400)
        
        # Verify admin has access
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) != school_id:
                return Response({'error': 'Access denied'}, status=403)
            school = admin_profile.school
        except Exception as e:
            return Response({'error': 'School admin profile not found'}, status=403)
        
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
                
                # Generate payment link
                payment_link = PaymentLinkService.generate_payment_link(
                    student_id=student.student_id,
                    deadline_id=deadline.id,
                    amount=float(deadline.amount),
                    student_name=student.full_name
                )
                
                # Build message
                if custom_message:
                    message = f"{custom_message}\n\nPay here: {payment_link}"
                else:
                    message = f"""የትምህርት ክፍያ ማስታወሻ - {deadline.academic_year} {deadline.get_month_display()}

ለ: {student.full_name}
ክፍያ: {deadline.amount} ብር
የማስከፈያ ቀን: {deadline.due_date}

እባክዎ በመስመር ላይ ይክፈሉ: {payment_link}

በማንኛውም ጥያቄ ወደ ትምህርት ቤቱ ይደውሉ: {school.phone}"""
                
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
                'month': deadline.get_month_display(),
                'amount': float(deadline.amount)
            },
            'results': results
        })


class MultiSchoolSMSPendingRemindersView(APIView):
    """Get students with pending payments for a deadline"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, deadline_id):
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'X-School-ID header required'}, status=400)
        
        # Verify admin has access
        try:
            admin_profile = request.user.school_profile
            if str(admin_profile.school.id) != school_id:
                return Response({'error': 'Access denied'}, status=403)
            school = admin_profile.school
        except Exception as e:
            return Response({'error': 'School admin profile not found'}, status=403)
        
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
        
        data = [{
            'student_id': s.student_id,
            'name': s.full_name,
            'grade': s.grade,
            'parent_phone': s.parent_phone,
            'parent_email': s.parent_email,
            'amount': float(deadline.amount)
        } for s in pending_students]
        
        return Response({
            'deadline': {
                'id': deadline.id,
                'month': deadline.get_month_display(),
                'academic_year': deadline.academic_year,
                'amount': float(deadline.amount),
                'due_date': deadline.due_date
            },
            'total_pending': len(data),
            'students': data
        })