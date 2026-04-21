# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from students.views import StudentViewSet
from academics.views import AcademicYearViewSet
from payments.views import PaymentViewSet, PaymentDeadlineViewSet, payments_filtered_by_year  # ✅ ADD HERE
from schools.views import SchoolViewSet
from students.dashboard import dashboard_stats, grade_overview, pending_payments
from payments.views.reminder_views import pending_reminders_filtered
from students.dashboard import monthly_report_filtered
from users.views import CurrentUserView
from schools.approval_views import pending_approvals, approve_school, reject_school
# ✅ FIX: Rename the import from reports to avoid conflict
from reports.views import dashboard_stats as reports_dashboard_stats, pending_payments_report

urlpatterns = [
    # ... your existing URLs ...
    path('api/reminders-filtered/', pending_reminders_filtered, name='reminders-filtered'),
    path('api/users/me/', CurrentUserView.as_view(), name='current_user'),
]

# Create a main router
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'deadlines', PaymentDeadlineViewSet, basename='deadline')
router.register(r'schools', SchoolViewSet, basename='school')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('api/admin/', include('authentication.urls')),
    path('api/', include('payments.urls')),
    
    # ✅ ADD THIS LINE
    path('api/payments-filtered/', payments_filtered_by_year, name='payments-filtered'),
    path('api/reminders-filtered/', pending_reminders_filtered, name='reminders-filtered'),
    path('api/reports/monthly-filtered/', monthly_report_filtered, name='monthly-report-filtered'),
    
    # Dashboard endpoints (using students.dashboard)
    path('api/reports/stats/', dashboard_stats, name='dashboard-stats'),
    path('api/reports/grades/', grade_overview, name='grade-overview'),
    path('api/reports/pending/', pending_payments, name='pending-payments'),
    
    # ✅ NEW: Reports endpoints with school filtering (using reports.views)
    path('api/reports/stats-filtered/', reports_dashboard_stats, name='reports-stats-filtered'),
    path('api/reports/pending-filtered/', pending_payments_report, name='reports-pending-filtered'),
]

urlpatterns += [
    path('api/admin/pending-approvals/', pending_approvals, name='pending-approvals'),
    path('api/admin/approve/<int:user_id>/', approve_school, name='approve-school'),
    path('api/admin/reject/<int:user_id>/', reject_school, name='reject-school'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)