# backend/common/views.py
from django.contrib.auth.models import User
from django.http import JsonResponse
from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AuditLog
from .serializers import AuditLogSerializer
from .utils import get_verified_school_id, is_super_admin


def health_check(request):
    """Lightweight endpoint for Render port scanning and uptime monitoring"""
    return JsonResponse({'status': 'healthy', 'service': 'felege-selam-payment-system'}, status=200)


class AuditLogListView(generics.ListAPIView):
    """
    GET /api/audit-log/  — powers the School Settings > Activity Log page.
    Scoped to the requesting admin's own school (same rule as everywhere
    else): non-super-admins never see another school's activity, super
    admins can switch via X-School-ID.
    Optional ?action=STAFF_CREATE style filter, matching AuditLog.ACTION_CHOICES.
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related('user').all()
        user = self.request.user
        school_id = get_verified_school_id(self.request)

        if is_super_admin(user) and not school_id:
            # Super admin viewing without a school filter -> everything.
            pass
        else:
            if not school_id:
                return AuditLog.objects.none()
            school_user_ids = set(
                User.objects.filter(profile__school_id=school_id).values_list('id', flat=True)
            ) | set(
                User.objects.filter(
                    school_profile__school_id=school_id, school_profile__is_active=True
                ).values_list('id', flat=True)
            )
            queryset = queryset.filter(user_id__in=school_user_ids)

        action = self.request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)

        return queryset[:200]


class SchoolFilteredViewSet(viewsets.ModelViewSet):
    """
    ⚠️ NOT CURRENTLY USED ANYWHERE — confirmed nothing in the codebase
    inherits from this class. Left in place only because deleting a
    class that something might reference elsewhere is riskier than
    fixing it. Fixed anyway rather than just left alone, because this
    was a live landmine: it filtered strictly by the raw, client-sent
    X-School-ID header with NO check against the authenticated user's
    own school — so any future view that inherited from this (an easy,
    natural-looking thing to do) would have silently reintroduced a
    cross-tenant READ vulnerability (any authenticated user could read
    any school's data just by setting the header). Now uses
    get_verified_school_id(), same as every other ViewSet in this
    codebase — safe to inherit from if it's ever used.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        school_id = get_verified_school_id(self.request)

        if school_id:
            try:
                # Filter by school_id field (works for Student, PaymentDeadline, etc.)
                queryset = queryset.filter(school_id=int(school_id))
            except Exception:
                # If model doesn't have school_id, try student__school_id (for Payment)
                try:
                    queryset = queryset.filter(student__school_id=int(school_id))
                except Exception:
                    pass
        return queryset