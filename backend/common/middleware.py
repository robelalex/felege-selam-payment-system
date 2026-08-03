# backend/common/middleware.py
from django.http import JsonResponse
from django.utils import timezone
from .utils import get_user_school, is_super_admin
from .models import AuditLog


class SchoolMiddleware:
    """
    Per-request school context + subscription enforcement.

    Runs on every request, before any view. Three things happen:
      1. request.current_school is set (None for super admins, a School
         object for everyone else with a school association).
      2. Schools in 'rejected' or 'suspended' status are blocked at the
         door — their requests never reach a view.
      3. Schools whose subscription_expiry date has passed are automatically
         suspended and blocked. Previously the expiry field existed but was
         never enforced, so a school's access never actually expired.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated and not is_super_admin(request.user):
            request.current_school = get_user_school(request.user)
        else:
            request.current_school = None

        if request.current_school:
            school = request.current_school

            # ── Auto-expire schools whose subscription_expiry has passed ──
            # Only suspend if they were previously 'approved' — don't touch
            # 'pending' or 'rejected' schools, those have their own flow.
            if (
                school.subscription_status == 'approved'
                and school.subscription_expiry is not None
                and school.subscription_expiry < timezone.now().date()
            ):
                school.subscription_status = 'suspended'
                school.subscription_active = False
                school.save(update_fields=['subscription_status', 'subscription_active'])

            if school.subscription_status in ('rejected', 'suspended'):
                return JsonResponse(
                    {
                        'error': 'This school\'s access has been suspended. Contact the platform administrator.',
                        'code': 'school_suspended',
                    },
                    status=403,
                )

        response = self.get_response(request)
        return response


class AuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        pass
