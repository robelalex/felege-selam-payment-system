# backend/payments/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PaymentViewSet, PaymentDeadlineViewSet, ReminderViewSet
from .views import send_reminders, send_payment_confirmation
from .views.report_views import monthly_report, student_report, annual_summary
from .views.slip_views import (
    upload_slip, pending_slips, verify_slip, ai_stats,
    delete_slip, bulk_delete_slips
)
from .views.sms_views import (
    sms_balance, send_test_sms, sms_history,
    send_payment_reminder, send_bulk_reminders
)
from .views.chapa_views import (
    initiate_chapa_payment, chapa_webhook,
    verify_chapa_payment, get_chapa_banks, payment_status
)

# test_payment is the same as initiate_chapa_payment
test_payment = initiate_chapa_payment
from .views.reminder_views import pending_reminders_filtered

router = DefaultRouter()
router.register(r'deadlines', PaymentDeadlineViewSet)
router.register(r'reminders', ReminderViewSet, basename='reminder')

# ✅ DON'T register payments with router - use direct paths instead
payment_viewset = PaymentViewSet.as_view({
    'get': 'list',
    'post': 'create',
    'put': 'update',
    'delete': 'destroy'
})

urlpatterns = [
    # ✅ Payments endpoints - direct paths
    path('payments/', payment_viewset, name='payments'),
    path('payments/initiate-payment/', PaymentViewSet.as_view({'post': 'initiate_payment'}), name='initiate-payment'),
    path('payments/verify-payment/<int:pk>/', PaymentViewSet.as_view({'post': 'verify_payment'}), name='verify-payment'),
    path('payments/pending-verifications/', PaymentViewSet.as_view({'get': 'pending_verifications'}), name='pending-verifications'),
    path('payments/delete-payment/<int:pk>/', PaymentViewSet.as_view({'delete': 'delete_payment'}), name='delete-payment'),
    path('payments/bulk-delete/', PaymentViewSet.as_view({'post': 'bulk_delete'}), name='bulk-delete'),
    
    # Archive/History endpoints
    path('payments/<int:pk>/archive_payment/', PaymentViewSet.as_view({'post': 'archive_payment'}), name='archive-payment'),
    path('payments/bulk_archive/', PaymentViewSet.as_view({'post': 'bulk_archive'}), name='bulk-archive'),
    path('payments/history/', PaymentViewSet.as_view({'get': 'history'}), name='payment-history'),
    
    # Deadlines and reminders (via router)
    path('', include(router.urls)),
    
    path('send-reminders/', send_reminders, name='send-reminders'),
    path('payment-confirmation/<int:payment_id>/', send_payment_confirmation, name='payment-confirmation'),
]

# SMS API URLs
urlpatterns += [
    path('sms/balance/', sms_balance, name='sms-balance'),
    path('sms/send-test/', send_test_sms, name='send-test-sms'),
    path('sms/history/', sms_history, name='sms-history'),
    path('sms/send-reminder/', send_payment_reminder, name='send-payment-reminder'),
    path('sms/send-bulk/', send_bulk_reminders, name='send-bulk-reminders'),
]

# Report URLs
urlpatterns += [
    path('reports/monthly/', monthly_report, name='monthly-report'),
    path('reports/student/<str:student_id>/', student_report, name='student-report'),
    path('reports/annual/', annual_summary, name='annual-summary'),
]

# Slip API URLs
urlpatterns += [
    path('slips/upload/', upload_slip, name='upload-slip'),
    path('slips/pending/', pending_slips, name='pending-slips'),
    path('slips/<int:slip_id>/verify/', verify_slip, name='verify-slip'),
    path('slips/<int:slip_id>/delete/', delete_slip, name='delete-slip'),
    path('slips/bulk-delete/', bulk_delete_slips, name='bulk-delete-slips'),
    path('slips/ai-stats/', ai_stats, name='ai-stats'),
]

# Chapa API URLs
urlpatterns += [
    path('chapa/initiate/', initiate_chapa_payment, name='chapa-initiate'),
    path('chapa/webhook/', chapa_webhook, name='chapa-webhook'),
    path('chapa/verify/', verify_chapa_payment, name='chapa-verify'),
    path('chapa/banks/', get_chapa_banks, name='chapa-banks'),
    path('chapa/test-payment/', test_payment, name='test-payment'),
    path('payments/status/<str:tx_ref>/', payment_status, name='payment-status'),  # ← ONLY NEW LINE
]

urlpatterns += [
    path('reminders-filtered/', pending_reminders_filtered, name='reminders-filtered'),
]