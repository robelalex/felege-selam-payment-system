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
