# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from common.views import health_check, AuditLogListView
from students.views import StudentViewSet, SectionViewSet
from academics.views import AcademicYearViewSet
from payments.views import PaymentViewSet, PaymentDeadlineViewSet, payments_filtered_by_year
from students.dashboard import dashboard_stats, grade_overview, pending_payments
from payments.views.reminder_views import pending_reminders_filtered
from students.dashboard import monthly_report_filtered
from users.views import CurrentUserView
from schools.approval_views import pending_approvals, approve_school, reject_school
from schools.platform_admin_views import (
    platform_stats, schools_list, update_school_subscription,
    school_admins_list, toggle_school_admin_active, resend_verification_email,
)
from reports.views import dashboard_stats as reports_dashboard_stats, pending_payments_report
from authentication.views import change_password
from authentication import views as auth_views
from rest_framework_simplejwt.views import TokenRefreshView
from academics.views import AcademicYearViewSet, SubjectViewSet, HomeroomAssignmentViewSet
from exams.views import (
    TermViewSet, SemesterViewSet, AssessmentTypeViewSet, MarkViewSet, DailyAttendanceViewSet, SubjectAttendanceViewSet,
    StudentTermResultViewSet, StudentSemesterResultViewSet,
)
from report_cards.views import ReportCardViewSet

# ✅ SchoolViewSet is REMOVED from this router — it lives in schools/urls.py now
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'sections', SectionViewSet, basename='section')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'homeroom-assignments', HomeroomAssignmentViewSet, basename='homeroom-assignment')
router.register(r'assessment-types', AssessmentTypeViewSet, basename='assessment-type')
router.register(r'terms', TermViewSet, basename='term')
router.register(r'semesters', SemesterViewSet, basename='semester')
router.register(r'marks', MarkViewSet, basename='mark')
router.register(r'attendance', DailyAttendanceViewSet, basename='attendance')
router.register(r'subject-attendance', SubjectAttendanceViewSet, basename='subject-attendance')
router.register(r'results', StudentTermResultViewSet, basename='student-term-result')
router.register(r'semester-results', StudentSemesterResultViewSet, basename='student-semester-result')
router.register(r'report-cards', ReportCardViewSet, basename='report-card')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('api/audit-log/', AuditLogListView.as_view(), name='audit-log'),
    # ✅ CUSTOM ACADEMIC YEAR ACTIONS - Must come BEFORE the router
    path('api/academic-years/current/', AcademicYearViewSet.as_view({'get': 'current'}), name='academic-year-current'),
    path('api/academic-years/archived/', AcademicYearViewSet.as_view({'get': 'get_archived'}), name='academic-year-archived'),
    path('api/academic-years/create_next_year/', AcademicYearViewSet.as_view({'post': 'create_next_year'}), name='academic-year-create-next'),
    path('api/academic-years/<int:pk>/promote_students/', AcademicYearViewSet.as_view({'post': 'promote_students'}), name='academic-year-promote'),
    path('api/academic-years/<int:pk>/set_current/', AcademicYearViewSet.as_view({'post': 'set_current'}), name='academic-year-set-current'),
    path('api/academic-years/<int:pk>/archive/', AcademicYearViewSet.as_view({'patch': 'archive_year'}), name='academic-year-archive'),
    path('api/academic-years/<int:pk>/restore/', AcademicYearViewSet.as_view({'patch': 'restore_year'}), name='academic-year-restore'),

    # ✅ schools.urls FIRST — contains custom chapa/sms/verify-et paths + its own router
    path('api/', include('schools.urls')),

    # ✅ Staff module (teacher/staff HR records + class assignments)
    path('api/', include('staff.urls')),

    # ✅ Main router AFTER schools — students, sections, academic-years
    path('api/', include(router.urls)),

    path('api-auth/', include('rest_framework.urls')),
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

    # Reports endpoints
    path('api/reports/stats-filtered/', reports_dashboard_stats, name='reports-stats-filtered'),
    path('api/reports/pending-filtered/', pending_payments_report, name='reports-pending-filtered'),

    # Super Admin Approval endpoints
    path('api/admin/pending-approvals/', pending_approvals, name='pending-approvals'),
    path('api/admin/approve/<int:user_id>/', approve_school, name='approve-school'),
    path('api/admin/reject/<int:user_id>/', reject_school, name='reject-school'),

    # ✅ NEW — Item 8 platform-admin endpoints (schools/platform_admin_views.py).
    # Business-level only: no student/payment/bank data. See that file's
    # module docstring for the scope decision.
    path('api/admin/platform-stats/', platform_stats, name='platform-stats'),
    path('api/admin/schools-list/', schools_list, name='platform-schools-list'),
    path('api/admin/schools-list/<int:school_id>/subscription/', update_school_subscription, name='platform-school-subscription'),
    path('api/admin/school-admins/', school_admins_list, name='platform-school-admins'),
    path('api/admin/school-admins/<int:user_id>/toggle-active/', toggle_school_admin_active, name='platform-school-admin-toggle'),
    path('api/admin/school-admins/<int:user_id>/resend-verification/', resend_verification_email, name='platform-resend-verification'),

    # ⚠️ RETIRED & REMOVED 2026-08-19 — the old Django-template super-admin
    # panel (admin_dashboard app + backend/templates/admin_dashboard/) is
    # deleted. Replaced entirely by the React /superadmin/* surface above.
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