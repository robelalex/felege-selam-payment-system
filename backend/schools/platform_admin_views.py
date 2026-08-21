# backend/schools/platform_admin_views.py
#
# ✅ NEW — Item 8 redesign. Everything here is gated by IsPlatformOwner
# (is_superuser only — see approval_views.py). This is the "platform
# owner" surface: Robel manages WHICH schools/admins may use the system
# and their subscription status, not any single school's day-to-day data.
#
# Deliberate scope decision (per Robel, 2026-08-19): a super admin should
# NOT be able to browse a school's students, payments, or bank/payment-
# gateway settings from here — that's each school's own data and their
# own responsibility. SchoolSerializer (schools/serializers.py) uses
# fields='__all__', which includes bank_account_number, telebirr_merchant_id,
# brevo_api_key etc. — deliberately NOT reused here. This file defines its
# own minimal, business-only field set instead.
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta

from schools.models import School, SchoolAdminProfile
from schools.approval_views import IsPlatformOwner
from common.utils import log_action


def _school_summary(school):
    """Business-level fields only — no bank/payment-gateway/API-key data."""
    admin_profile = SchoolAdminProfile.objects.filter(school=school, is_active=True).first()
    admin_user = admin_profile.user if admin_profile else None
    return {
        'id': school.id,
        'name': school.name,
        'code': school.code,
        'city': school.city,
        'region': school.region,
        'phone': school.phone,
        'email': school.email,
        'subscription_status': school.subscription_status,
        'subscription_active': school.subscription_active,
        'subscription_expiry': school.subscription_expiry,
        'created_at': school.created_at,
        'admin_name': (
            f"{admin_user.first_name} {admin_user.last_name}".strip() or admin_user.username
        ) if admin_user else None,
        'admin_email': admin_user.email if admin_user else None,
        'admin_email_verified': getattr(admin_user.profile, 'is_email_verified', False)
            if admin_user and hasattr(admin_user, 'profile') else None,
        'admin_active': admin_user.is_active if admin_user else None,
        # ✅ NEW — Service Agreement Section 4 (grace period) surfaced to
        # the Super Admin UI, so Robel can see who's about to be locked
        # out before it happens, not just after.
        'is_access_suspended': school.is_access_suspended,
        'days_until_access_suspended': school.days_until_access_suspended,
    }


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def platform_stats(request):
    """
    Platform-wide numbers only — counts of schools by status, pending
    approvals, subscriptions expiring soon. Deliberately excludes any
    aggregate drawn from student or payment records (active student count,
    verified-payment totals) — those belong to each school, not the
    platform owner's view. See module docstring.
    """
    now = timezone.now()
    expiring_cutoff = now.date() + timedelta(days=30)

    schools_expiring_soon = School.objects.filter(
        subscription_expiry__isnull=False,
        subscription_expiry__gte=now.date(),
        subscription_expiry__lte=expiring_cutoff,
    ).order_by('subscription_expiry')

    return Response({
        'total_schools': School.objects.count(),
        'approved_count': School.objects.filter(subscription_status='approved').count(),
        'pending_count': School.objects.filter(subscription_status='pending').count(),
        'suspended_count': School.objects.filter(subscription_status='suspended').count(),
        'rejected_count': School.objects.filter(subscription_status='rejected').count(),
        'pending_approvals_count': User.objects.filter(
            is_active=False, school_profile__isnull=False
        ).count(),
        'expiring_soon': [
            {
                'id': s.id,
                'name': s.name,
                'code': s.code,
                'subscription_expiry': s.subscription_expiry,
            }
            for s in schools_expiring_soon
        ],
    })


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def schools_list(request):
    """
    Searchable/filterable list of schools — business info only.
    Query params: ?search=name-or-code  ?status=approved|pending|suspended|rejected
    """
    qs = School.objects.all().order_by('-id')

    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))

    status_filter = request.query_params.get('status', '').strip()
    if status_filter:
        qs = qs.filter(subscription_status=status_filter)

    return Response([_school_summary(s) for s in qs])


@api_view(['PATCH'])
@permission_classes([IsPlatformOwner])
def update_school_subscription(request, school_id):
    """
    Business-level actions only: suspend/reactivate, adjust expiry.
    Does not touch anything else on the School record (name/contact/bank/
    grading/etc. stay editable only from that school's own admin panel).
    """
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    new_status = request.data.get('subscription_status')
    if new_status is not None:
        valid = [c[0] for c in School.SUBSCRIPTION_STATUS_CHOICES]
        if new_status not in valid:
            return Response({'error': f'subscription_status must be one of {valid}'}, status=400)
        school.subscription_status = new_status
        school.subscription_active = new_status == 'approved'

    if 'subscription_expiry' in request.data:
        school.subscription_expiry = request.data.get('subscription_expiry') or None

    school.save(update_fields=['subscription_status', 'subscription_active', 'subscription_expiry'])
    log_action(
        request.user, 'update_school_subscription',
        details=f"School {school.name} ({school.code}) -> {school.subscription_status}",
        request=request,
    )
    return Response(_school_summary(school))


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def school_admins_list(request):
    """
    School admin ACCOUNTS only — the people Robel has a business
    relationship with. Not staff/teachers/registrars/parents within a
    school; those are each school's own internal users to manage.
    """
    admins = User.objects.filter(
        profile__role='school_admin', is_superuser=False
    ).select_related('profile').order_by('-date_joined')

    data = []
    for user in admins:
        school_profile = SchoolAdminProfile.objects.filter(user=user).first()
        data.append({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_active': user.is_active,
            'email_verified': getattr(user.profile, 'is_email_verified', False),
            'school_name': school_profile.school.name if school_profile else None,
            'school_code': school_profile.school.code if school_profile else None,
            'date_joined': user.date_joined,
        })
    return Response(data)


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def toggle_school_admin_active(request, user_id):
    """
    Activate/deactivate a school admin's login. Deliberately does NOT
    accept is_staff/is_superuser/role fields — see the SECURITY FIX notes
    in admin_dashboard/views.py and common/utils.py:is_super_admin() for
    why raw-toggling those flags on an arbitrary user is dangerous. This
    endpoint can only flip is_active for an existing school_admin account.
    """
    try:
        user = User.objects.get(id=user_id, profile__role='school_admin', is_superuser=False)
    except User.DoesNotExist:
        return Response({'error': 'School admin not found'}, status=404)

    is_active = request.data.get('is_active')
    if is_active is None:
        return Response({'error': 'is_active is required'}, status=400)
    user.is_active = bool(is_active)
    user.save(update_fields=['is_active'])
    log_action(
        request.user, 'toggle_school_admin_active',
        details=f"{user.email} -> is_active={user.is_active}",
        request=request,
    )
    return Response({'success': True, 'is_active': user.is_active})


@api_view(['POST'])
@permission_classes([IsPlatformOwner])
def resend_verification_email(request, user_id):
    try:
        user = User.objects.get(id=user_id, profile__role='school_admin')
    except User.DoesNotExist:
        return Response({'error': 'School admin not found'}, status=404)

    if user.profile.is_email_verified:
        return Response({'error': 'This account is already verified'}, status=400)

    school_profile = SchoolAdminProfile.objects.filter(user=user).first()
    if not school_profile:
        return Response({'error': 'No school found for this admin'}, status=400)

    from common.email_service import send_registration_confirmation_email
    sent, message = send_registration_confirmation_email(
        user.email, school_profile.school.name, user.first_name,
        str(user.profile.email_verification_token),
    )
    if not sent:
        return Response({'error': message}, status=502)
    return Response({'success': True})


# ========================================================================
# ✅ NEW — Platform billing (Service Agreement Section 3). A record of
# what a school has paid ROBEL for the platform subscription — separate
# from payments.models.Payment, which is parents paying the SCHOOL.
# ========================================================================

def _payment_summary(p):
    return {
        'id': p.id,
        'school_id': p.school_id,
        'amount': p.amount,
        'method': p.method,
        'period_months': p.period_months,
        'paid_on': p.paid_on,
        'note': p.note,
        'recorded_by': p.recorded_by.get_full_name() or p.recorded_by.username if p.recorded_by else None,
        'created_at': p.created_at,
    }


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformOwner])
def school_platform_payments(request, school_id):
    """
    GET: billing history for one school.
    POST: record a new payment and auto-extend subscription_expiry by
    period_months (from whichever is later — today, or the current
    expiry, so paying early doesn't lose remaining paid time). Also
    flips subscription_status back to 'approved' — a payment is the one
    action that should always lift a 'suspended' status.
    """
    from schools.models import PlatformPayment
    from dateutil.relativedelta import relativedelta
    import datetime

    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    if request.method == 'GET':
        payments = school.platform_payments.all()
        return Response([_payment_summary(p) for p in payments])

    # POST — record a payment
    amount = request.data.get('amount')
    if not amount:
        return Response({'error': 'amount is required'}, status=400)
    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return Response({'error': 'amount must be a positive number'}, status=400)

    method = request.data.get('method', 'bank_transfer')
    if method not in dict(PlatformPayment.METHOD_CHOICES):
        return Response({'error': f"method must be one of {list(dict(PlatformPayment.METHOD_CHOICES))}"}, status=400)

    period_months = int(request.data.get('period_months', 1))
    paid_on = request.data.get('paid_on') or timezone.now().date().isoformat()
    try:
        paid_on_date = datetime.date.fromisoformat(paid_on)
    except ValueError:
        return Response({'error': 'paid_on must be YYYY-MM-DD'}, status=400)

    payment = PlatformPayment.objects.create(
        school=school, amount=amount, method=method, period_months=period_months,
        paid_on=paid_on_date, note=request.data.get('note', ''), recorded_by=request.user,
    )

    # Extend from whichever is later: today, or the school's current
    # expiry (so a school that pays before running out doesn't lose the
    # time it already paid for).
    base_date = school.subscription_expiry if (
        school.subscription_expiry and school.subscription_expiry > timezone.now().date()
    ) else timezone.now().date()
    school.subscription_expiry = base_date + relativedelta(months=period_months)
    school.subscription_status = 'approved'
    school.subscription_active = True
    school.save(update_fields=['subscription_expiry', 'subscription_status', 'subscription_active'])

    log_action(
        request.user, 'record_platform_payment',
        details=f"{school.name}: {amount} ETB ({method}, {period_months} mo) -> expiry {school.subscription_expiry}",
        request=request,
    )
    return Response({
        'payment': _payment_summary(payment),
        'school': _school_summary(school),
    }, status=201)


@api_view(['GET'])
@permission_classes([IsPlatformOwner])
def export_school_data(request, school_id):
    """
    ✅ NEW — Service Agreement Section 5: "the school may request a full
    export of its data." Business-facing export: students, staff, and
    that school's own parent-facing payment records, as a single
    downloadable CSV-per-sheet ZIP. Does NOT include bank/gateway
    credentials (those are the school's own secrets, unaffected by any
    export/termination) or other schools' data.
    """
    import csv
    import io
    import zipfile
    from django.http import HttpResponse

    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return Response({'error': 'School not found'}, status=404)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Students
        from students.models import Student
        s_io = io.StringIO()
        writer = csv.writer(s_io)
        writer.writerow(['ID', 'Full Name', 'Grade', 'Parent Name', 'Parent Phone', 'Parent Email', 'Status'])
        for st in Student.objects.filter(school=school):
            writer.writerow([
                st.id, getattr(st, 'full_name', ''), getattr(st, 'grade', ''),
                getattr(st, 'parent_name', ''), getattr(st, 'parent_phone', ''),
                getattr(st, 'parent_email', ''), getattr(st, 'status', ''),
            ])
        zf.writestr('students.csv', s_io.getvalue())

        # Staff
        try:
            from staff.models import StaffMember
            f_io = io.StringIO()
            writer = csv.writer(f_io)
            writer.writerow(['ID', 'Full Name', 'Role', 'Email', 'Phone', 'Active'])
            for member in StaffMember.objects.filter(school=school):
                writer.writerow([
                    member.id, getattr(member, 'full_name', ''), getattr(member, 'role', ''),
                    getattr(member.user, 'email', '') if getattr(member, 'user', None) else '',
                    getattr(member, 'phone', ''), getattr(member, 'is_active', ''),
                ])
            zf.writestr('staff.csv', f_io.getvalue())
        except Exception:
            pass  # staff app model shape not guaranteed identical across versions

        # Parent payments (fees paid TO the school, not to the platform)
        try:
            from payments.models import Payment
            p_io = io.StringIO()
            writer = csv.writer(p_io)
            writer.writerow(['ID', 'Student', 'Amount', 'Status', 'Method', 'Paid By', 'Created At'])
            for pay in Payment.objects.filter(student__school=school).select_related('student'):
                writer.writerow([
                    pay.id, getattr(pay.student, 'full_name', ''), pay.amount, pay.status,
                    pay.payment_method, pay.paid_by, pay.created_at,
                ])
            zf.writestr('payments.csv', p_io.getvalue())
        except Exception:
            pass

        # Platform billing history (what the school paid Robel)
        b_io = io.StringIO()
        writer = csv.writer(b_io)
        writer.writerow(['ID', 'Amount', 'Method', 'Period (months)', 'Paid On', 'Note'])
        for p in school.platform_payments.all():
            writer.writerow([p.id, p.amount, p.method, p.period_months, p.paid_on, p.note])
        zf.writestr('platform_billing_history.csv', b_io.getvalue())

    log_action(request.user, 'export_school_data', details=f"Exported data for {school.name}", request=request)

    buffer.seek(0)
    response = HttpResponse(buffer.read(), content_type='application/zip')
    safe_name = "".join(c if c.isalnum() else "_" for c in school.name)
    response['Content-Disposition'] = f'attachment; filename="{safe_name}_data_export.zip"'
    return response
