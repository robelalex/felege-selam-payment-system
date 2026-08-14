# backend/payments/views/reminder_views.py - UPDATED with Email Reminders & Search
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from ..services.reminder_service import ReminderService
from academics.models import AcademicYear
from students.models import Student
from common.email_service import PaymentLinkService
from ..models import Payment, PaymentDeadline
from django.db import models
from schools.models import SchoolAdminProfile
from datetime import date
from authentication.permissions import CanManagePayments
from common.utils import get_verified_school_id

class ReminderViewSet(viewsets.ViewSet):
    """
    ViewSet for handling payment reminders with school filtering

    ✅ SECURITY FIX: this class had no permission_classes at all, which
    meant it inherited the project-wide default of AllowAny. `send` and
    `send_email_reminders` both accept a caller-controlled `message` field
    — anyone on the internet, no login, could have sent arbitrary text
    through the school's real SMS/email sender to real parents' phones
    and inboxes. Now requires a logged-in staff member who can manage
    payments, and the school is resolved from their real account.
    """
    permission_classes = [IsAuthenticated, CanManagePayments]

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all students with pending payments for the selected academic year"""
        
        school_id = get_verified_school_id(request)
        year_id = request.query_params.get('academic_year_id')
        year_param = request.query_params.get('academic_year')
        year_alt = request.query_params.get('year')
        month = request.query_params.get('month')
        grade = request.query_params.get('grade')
        student_search = request.query_params.get('student_search')
        
        if not school_id:
            return Response({'error': 'No school associated with this account'}, status=400)
        
        # Determine academic year
        academic_year = None
        year_value = year_id or year_alt or year_param
        
        if year_value:
            try:
                academic_year = AcademicYear.objects.get(id=int(year_value), school_id=int(school_id))
                print(f"📱 Found academic year by ID: {academic_year.name}")
            except (ValueError, AcademicYear.DoesNotExist):
                try:
                    academic_year = AcademicYear.objects.get(year_ec=int(year_value), school_id=int(school_id))
                    print(f"📱 Found academic year by year_ec: {academic_year.name}")
                except (ValueError, AcademicYear.DoesNotExist):
                    try:
                        academic_year = AcademicYear.objects.get(name=year_value, school_id=int(school_id))
                        print(f"📱 Found academic year by name: {academic_year.name}")
                    except AcademicYear.DoesNotExist:
                        academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
                        print(f"📱 Using current academic year: {academic_year.name if academic_year else 'None'}")
        else:
            academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
            print(f"📱 No year param, using current: {academic_year.name if academic_year else 'None'}")
        
        # Create service and get results with academic year filter
        service = ReminderService()
        results = service.get_pending_students(
            month=month, 
            grade=grade,
            academic_year=academic_year.name if academic_year else None,
            school_id=school_id,
            student_search=student_search
        )
        
        return Response(results)
    
    @action(detail=False, methods=['post'])
    def send(self, request):
        """Send SMS reminders to selected students"""
        
        school_id = get_verified_school_id(request)
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        academic_year = request.data.get('academic_year')
        
        if not school_id:
            return Response({'error': 'No school associated with this account'}, status=400)
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        # ✅ Verify all students belong to this school
        students = Student.objects.filter(student_id__in=student_ids, school_id=school_id)
        if students.count() != len(student_ids):
            return Response({'error': 'Some students do not belong to your school'}, status=403)
        
        service = ReminderService()
        results = service.send_reminders(
            student_ids, 
            month, 
            custom_message,
            academic_year=academic_year,
            school_id=school_id
        )
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })
    
    @action(detail=False, methods=['post'])
    def send_email_reminders(self, request):
        """Send EMAIL reminders using SCHOOL'S OWN BREVO ACCOUNT"""
        
        school_id = get_verified_school_id(request)
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        academic_year_param = request.data.get('academic_year')
        
        if not school_id:
            return Response({'error': 'No school associated with this account'}, status=400)
        
        if not student_ids:
            return Response({'error': 'No students selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from schools.models import School
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            return Response({'error': 'School not found'}, status=404)
        
        # ✅ FIX 1: Resolve academic year PARAMETER to an OBJECT before filtering
        academic_year_obj = None
        if academic_year_param:
            try:
                # Try to fetch by name first (e.g., "2018 E.C.")
                academic_year_obj = AcademicYear.objects.get(
                    name=str(academic_year_param), 
                    school_id=school_id
                )
            except AcademicYear.DoesNotExist:
                try:
                    # Fallback: try to parse as integer ID
                    academic_year_obj = AcademicYear.objects.get(
                        id=int(academic_year_param), 
                        school_id=school_id
                    )
                except (ValueError, AcademicYear.DoesNotExist):
                    pass
        
        # If no param provided or lookup failed, use current year
        if not academic_year_obj:
            academic_year_obj = AcademicYear.objects.filter(
                school_id=school_id, 
                is_current=True
            ).first()
            
        if not academic_year_obj:
            return Response({
                'success': False,
                'sent': 0,
                'failed': len(student_ids),
                'results': [{'student_id': sid, 'success': False, 'message': 'Academic year not found'} for sid in student_ids]
            })

        # Verify all students belong to this school
        students = Student.objects.filter(student_id__in=student_ids, school_id=school_id)
        
        results = []
        
        for student in students:
            parent_email = getattr(student, 'parent_email', None)
            
            if not parent_email:
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': None,
                    'success': False,
                    'message': 'No email address found'
                })
                continue
            
            # Get pending months
            pending_months_list = []
            total_due = 0
            pending_deadlines = []
            
            # ✅ FIX 2: Use the ACADEMIC YEAR OBJECT here, not the string name
            deadlines = PaymentDeadline.objects.filter(
                academic_year=academic_year_obj,  # <-- Changed from year_name
                is_active=True,
                school_id=school_id
            )
            
            if month and month != 'all' and month != 'None':
                try:
                    deadlines = deadlines.filter(month=int(month))
                except (ValueError, TypeError):
                    pass
            
            student_deadlines = deadlines.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            paid_deadline_ids = Payment.objects.filter(
                student=student,
                status='verified'
            ).values_list('deadline_id', flat=True)
            
            for deadline in student_deadlines:
                if deadline.id not in paid_deadline_ids:
                    # ✅ Fee exceptions (Jimma request #1): skip a month
                    # already fully covered by a waiver, and quote the
                    # real amount owed for partial arrangements.
                    from ..services.fee_override_service import get_effective_deadline_amount
                    effective_amount = get_effective_deadline_amount(student, deadline)
                    if effective_amount <= 0:
                        continue
                    # ✅ FIX: display_label handles 'registration' deadlines
                    # ("Registration Fee") correctly — get_month_name(None)
                    # would otherwise show "All Months" for them.
                    month_name = deadline.display_label
                    pending_months_list.append(f"{month_name} - {float(effective_amount)} Birr")
                    total_due += float(effective_amount)
                    pending_deadlines.append(deadline)
            
            if not pending_months_list:
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': parent_email,
                    'success': False,
                    'message': 'No pending payments found'
                })
                continue
            
            pending_months_text = ', '.join(pending_months_list)
            
            # Generate payment link
            payment_link = None
            if pending_deadlines:
                first_deadline = pending_deadlines[0]

                from payments.tokens import generate_payment_token
                from payments.models import Payment as PaymentModel
                from ..services.fee_override_service import get_effective_deadline_amount
                first_deadline_amount = get_effective_deadline_amount(student, first_deadline)

                payment_obj, created = PaymentModel.objects.get_or_create(
                    student=student,
                    deadline=first_deadline,
                    defaults={
                        'amount': first_deadline_amount,
                        'payment_method': 'chapa',
                        'paid_by': student.full_name,
                        'paid_by_phone': student.parent_phone,
                        'status': 'pending'
                        }
                )
                if not created and payment_obj.status == 'pending' and payment_obj.amount != first_deadline_amount:
                    payment_obj.amount = first_deadline_amount
                    payment_obj.save(update_fields=['amount'])

                token, record = generate_payment_token(payment_obj, student.parent_phone, channel="email")
                payment_link = f"https://felege-selam-payment-system.vercel.app/pay/{token}"
            
            # ✅ NEW: Use SchoolEmailService instead of global send_mail
            try:
                from common.email_service import SchoolEmailService
                
                # Build HTML content matching your existing template
                html_content = f"""
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #F59E0B;">Payment Reminder</h2>
                    <p>Dear Parent,</p>
                    <p>This is a friendly reminder that your child <strong>{student.full_name}</strong> has pending payment(s).</p>
                    
                    <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F59E0B;">
                        <p style="margin: 0;"><strong>Pending Months:</strong> {pending_months_text}</p>
                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold; color: #D97706;">Total Due: {total_due:,.2f} Birr</p>
                    </div>
                    
                    {f'<a href="{payment_link}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">Pay Now</a>' if payment_link else ''}
                    
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; font-size: 12px;">This is an automated message from {school.name}. Please do not reply.</p>
                </body>
                </html>
                """
                
                text_content = f"Payment Reminder\n\nStudent: {student.full_name}\nPending: {pending_months_text}\nTotal Due: {total_due:,.2f} Birr\n\n{payment_link or ''}\n\n---\nAutomated message from {school.name}"
                
                email_service = SchoolEmailService(int(school_id))
                result = email_service.send_email(
                    recipient_email=parent_email,
                    subject=f"Payment Reminder - {student.full_name}",
                    html_content=html_content,
                    text_content=text_content
                )
                
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': parent_email,
                    'success': True,
                    'message': 'Sent successfully'
                })
                
            except Exception as e:
                results.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'email': parent_email,
                    'success': False,
                    'message': f'Failed: {str(e)[:100]}'
                })
        
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })
    
    def get_month_name(self, month_num):
        """Convert month number to Amharic name"""
        months = [
            'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
            'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
        ]
        try:
            if month_num is None:
                return "All Months"
            return months[int(month_num) - 1]
        except:
            return f"ወር {month_num}"


# ✅ Helper functions
@api_view(['POST'])
@permission_classes([IsAuthenticated, CanManagePayments])
def send_reminders(request):
    """
    Legacy function for sending reminders

    ✅ SECURITY FIX: this was AllowAny — anyone on the internet, no login
    at all, could POST a custom `message` and school_id and have the
    system send THEIR text through the school's real, trusted SMS/email
    sender to real parents (not a lookalike message — the actual sender).
    Combined with real tokenized payment links going out to real phone
    numbers on the attacker's command, this was the most direct path to
    real financial/social-engineering harm in the whole system. Now
    requires a logged-in staff member who can manage payments, and the
    school is resolved from their real account, not a header.
    """
    school_id = get_verified_school_id(request)

    if not school_id:
        return Response({'error': 'No school associated with this account'}, status=400)
    
    service = ReminderService()
    student_ids = request.data.get('student_ids', [])
    month = request.data.get('month')
    custom_message = request.data.get('message', '')
    academic_year = request.data.get('academic_year')
    
    results = service.send_reminders(
        student_ids, 
        month, 
        custom_message, 
        academic_year=academic_year,
        school_id=school_id
    )
    
    return Response({
        'successful': len([r for r in results if r['success']]),
        'failed': len([r for r in results if not r['success']]),
        'total_processed': len(results),
        'results': results
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, CanManagePayments])
def send_payment_confirmation(request, payment_id):
    """
    Send payment confirmation SMS

    ✅ SECURITY FIX: was AllowAny — anyone could trigger a confirmation
    send for any payment_id with no login, spamming a real parent's phone
    and enumerating valid payment IDs by response code. Now requires a
    logged-in staff member who can manage payments.
    """
    from .sms_views import send_payment_confirmation as sms_confirmation
    return sms_confirmation(request, payment_id)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_reminders_filtered(request):
    """
    Get pending reminders filtered by academic year - with school filtering and GRADE-SPECIFIC deadlines

    ✅ SECURITY FIX: was AllowAny and trusted the raw X-School-ID header —
    anyone, no login, could pull student names, parent phone numbers, and
    payment status for any school. Now requires login and resolves the
    school from the caller's real account.
    """
    school_id = get_verified_school_id(request)
    year_id = request.query_params.get('academic_year_id')
    month = request.query_params.get('month')
    grade = request.query_params.get('grade')
    student_search = request.query_params.get('student_search')

    if not school_id:
        return Response({'error': 'No school associated with this account'}, status=400)
    
    if not year_id:
        return Response({'error': 'academic_year_id required'}, status=400)
    
    try:
        academic_year = AcademicYear.objects.get(id=int(year_id), school_id=int(school_id))
        print(f"📱 Academic year: {academic_year.name}")
        
        # Get students in this academic year AND this school
        students = Student.objects.filter(
            status='active',
            academic_year=academic_year.name,
            school_id=int(school_id)
        )
        
        # Filter by grade if provided
        if grade and grade != 'all' and grade != 'None':
            try:
                students = students.filter(grade=int(grade))
                print(f"📱 Filtered to grade: {grade}")
            except (ValueError, TypeError):
                pass
        
        # Filter by student search if provided
        if student_search and student_search != '':
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
            print(f"📱 Filtered by search: {student_search}")
        
        print(f"📱 Students found: {students.count()}")
        
        # ✅ Get base deadlines for this academic year AND this school
        base_deadlines = PaymentDeadline.objects.filter(
            academic_year=academic_year.name,
            is_active=True,
            school_id=int(school_id)
        )
        
        # Filter by month if provided
        if month and month != 'all' and month != 'None':
            try:
                base_deadlines = base_deadlines.filter(month=int(month))
                print(f"📱 Filtered to month: {month}")
            except (ValueError, TypeError):
                pass
        
        # Get verified payments
        verified_payments = Payment.objects.filter(
            status='verified',
            student__academic_year=academic_year.name,
            student__school_id=int(school_id)
        ).values_list('student_id', 'deadline_id')
        
        paid_set = set()
        for student_id, deadline_id in verified_payments:
            paid_set.add((student_id, deadline_id))
        
        pending_students = []
        
        for student in students:
            student_pending = []
            
            # ✅ CRITICAL FIX: Filter deadlines by student's grade
            student_deadlines = base_deadlines.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            print(f"📱 Student {student.student_id} (Grade {student.grade}) has {student_deadlines.count()} applicable deadlines")
            
            for deadline in student_deadlines:
                if (student.id, deadline.id) not in paid_set:
                    # ✅ Fee exceptions (Jimma request #1)
                    from ..services.fee_override_service import get_effective_deadline_amount
                    effective_amount = get_effective_deadline_amount(student, deadline)
                    if effective_amount <= 0:
                        continue
                    student_pending.append({
                        'month': deadline.month,
                        'month_name': deadline.get_month_display(),
                        'amount': float(effective_amount),
                        'due_date': deadline.due_date,
                        'deadline_id': deadline.id,
                        'days_overdue': (date.today() - deadline.due_date).days if deadline.due_date and deadline.due_date < date.today() else 0
                    })
            
            if student_pending:
                parent_email = getattr(student, 'parent_email', None)
                if not parent_email:
                    parent_email = getattr(student, 'guardian_email', None)
                
                pending_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'parent_phone': student.parent_phone,
                    'parent_name': student.parent_full_name,
                    'parent_email': parent_email,
                    'pending_months': student_pending,
                    'total_due': sum(p['amount'] for p in student_pending),
                    'academic_year': student.academic_year
                })
        
        return Response({
            'total_pending': len(pending_students),
            'total_pending_months': sum(len(p['pending_months']) for p in pending_students),
            'students': pending_students,
            'academic_year': academic_year.name
        })
        
    except AcademicYear.DoesNotExist:
        return Response({'error': 'Academic year not found'}, status=404)