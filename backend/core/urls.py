# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from students.views import StudentViewSet
from academics.views import AcademicYearViewSet
from payments.views import PaymentViewSet, PaymentDeadlineViewSet, payments_filtered_by_year
from schools.views import SchoolViewSet
from students.dashboard import dashboard_stats, grade_overview, pending_payments
from payments.views.reminder_views import pending_reminders_filtered
from students.dashboard import monthly_report_filtered
from users.views import CurrentUserView
from schools.approval_views import pending_approvals, approve_school, reject_school
from reports.views import dashboard_stats as reports_dashboard_stats, pending_payments_report
from authentication.views import change_password
from authentication import views as auth_views
from rest_framework_simplejwt.views import TokenRefreshView

# Import the specific action methods
from academics.views import AcademicYearViewSet

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'schools', SchoolViewSet, basename='school')

urlpatterns = [
    # ✅ CUSTOM ACADEMIC YEAR ACTIONS - Must come BEFORE the router
    path('api/academic-years/current/', AcademicYearViewSet.as_view({'get': 'current'}), name='academic-year-current'),
    path('api/academic-years/archived/', AcademicYearViewSet.as_view({'get': 'get_archived'}), name='academic-year-archived'),
    path('api/academic-years/create_next_year/', AcademicYearViewSet.as_view({'post': 'create_next_year'}), name='academic-year-create-next'),
    path('api/academic-years/<int:pk>/promote_students/', AcademicYearViewSet.as_view({'post': 'promote_students'}), name='academic-year-promote'),
    path('api/academic-years/<int:pk>/set_current/', AcademicYearViewSet.as_view({'post': 'set_current'}), name='academic-year-set-current'),
    path('api/academic-years/<int:pk>/archive/', AcademicYearViewSet.as_view({'patch': 'archive_year'}), name='academic-year-archive'),
    path('api/academic-years/<int:pk>/restore/', AcademicYearViewSet.as_view({'patch': 'restore_year'}), name='academic-year-restore'),
    
    # API routes
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('api/', include('schools.urls')),
    path('api/auth/change-password/', change_password, name='change-password'),
    path('api/admin/', include('authentication.urls')),
    path('api/', include('authentication.urls')), 
    path('api/', include('payments.urls')),
    path('api/users/me/', CurrentUserView.as_view(), name='current_user'),
    path('api/me/', auth_views.get_current_user, name='current-user'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Payment endpoints
    path('api/payments-filtered/', payments_filtered_by_year, name='payments-filtered'),
    path('api/reminders-filtered/', pending_reminders_filtered, name='reminders-filtered'),
    path('api/reports/monthly-filtered/', monthly_report_filtered, name='monthly-report-filtered'),
    
    # Dashboard endpoints
    path('api/reports/stats/', dashboard_stats, name='dashboard-stats'),
    path('api/reports/grades/', grade_overview, name='grade-overview'),
    path('api/reports/pending/', pending_payments, name='pending-payments'),
    
    # Reports endpoints with school filtering
    path('api/reports/stats-filtered/', reports_dashboard_stats, name='reports-stats-filtered'),
    path('api/reports/pending-filtered/', pending_payments_report, name='reports-pending-filtered'),
    
    # Super Admin Approval endpoints
    path('api/admin/pending-approvals/', pending_approvals, name='pending-approvals'),
    path('api/admin/approve/<int:user_id>/', approve_school, name='approve-school'),
    path('api/admin/reject/<int:user_id>/', reject_school, name='reject-school'),
    
    # CUSTOM ADMIN DASHBOARD
    path('admin-dashboard/', include('admin_dashboard.urls')),
]

# Serve static files
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve React app for all other routes (must be LAST)
urlpatterns += [
    path('', TemplateView.as_view(template_name='index.html')),
    path('admin-login/', TemplateView.as_view(template_name='index.html')),
    path('parent-login/', TemplateView.as_view(template_name='index.html')),
    path('parent-dashboard/', TemplateView.as_view(template_name='index.html')),
]