# backend/payments/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views.views import PaymentViewSet, PaymentDeadlineViewSet
from .views import ReminderViewSet, send_reminders, send_payment_confirmation
from .views.report_views import monthly_report, student_report, annual_summary, monthly_detailed_report
from .views import PaymentLandingView, OtpVerifyView, PaymentInitiateView
from .views.receipt_views import get_receipt
from .views.slip_views import (
    upload_slip, pending_slips, verify_slip, ai_stats, slip_status,
    delete_slip, bulk_delete_slips,
    update_transaction_reference,
    extract_slip_data,
    check_receipt_with_verify_et,  
    verify_slip_from_api 
)

# ✅ ONLY import from sms_views_v2 (old sms_views is deleted)
from .views.sms_views_v2 import (
    MultiSchoolSMSBalanceView,
    MultiSchoolSendTestSMSView,
    MultiSchoolSendPaymentReminderView,
    MultiSchoolSendBulkRemindersView,
    MultiSchoolSMSPendingRemindersView
)

from .views.chapa_views import (
    initiate_chapa_payment, chapa_webhook,
    verify_chapa_payment, get_chapa_banks, payment_status, mobile_redirect
)

# test_payment is the same as initiate_chapa_payment
test_payment = initiate_chapa_payment
from .views.reminder_views import pending_reminders_filtered

router = DefaultRouter()
router.register(r'deadlines', PaymentDeadlineViewSet)
router.register(r'reminders', ReminderViewSet, basename='reminder')

# DON'T register payments with router - use direct paths instead
payment_viewset = PaymentViewSet.as_view({
    'get': 'list',
    'post': 'create',
    'put': 'update',
    'delete': 'destroy'
})

urlpatterns = [
    # Payments endpoints - direct paths
    path('payments/', payment_viewset, name='payments'),
    path('payments/initiate-payment/', PaymentViewSet.as_view({'post': 'initiate_payment'}), name='initiate-payment'),
    path('payments/verify-payment/<int:pk>/', PaymentViewSet.as_view({'post': 'verify_payment'}), name='verify-payment'),
    # ✅ FIX: this app doesn't use DRF's router for PaymentViewSet (see the
    # comment above router.register — every @action needs its own path()
    # here, it isn't automatic). AdminPayments.js's new Verify/Re-check
    # buttons call these exact URLs — without these two lines they 404,
    # which is exactly the "Not Found: /api/payments/115/recheck_chapa/"
    # you just saw. The old dash-style '/verify-payment/<pk>/' above is a
    # DIFFERENT URL and nothing in the frontend calls it, so it's left
    # alone rather than removed.
    path('payments/<int:pk>/verify_payment/', PaymentViewSet.as_view({'post': 'verify_payment'}), name='verify-payment-action'),
    path('payments/<int:pk>/recheck_chapa/', PaymentViewSet.as_view({'post': 'recheck_chapa'}), name='recheck-chapa'),
    path('payments/pending-verifications/', PaymentViewSet.as_view({'get': 'pending_verifications'}), name='pending-verifications'),
    path('payments/delete-payment/<int:pk>/', PaymentViewSet.as_view({'delete': 'delete_pending'}), name='delete-payment'),
    path('payments/bulk-delete/', PaymentViewSet.as_view({'post': 'bulk_delete_pending'}), name='bulk-delete'),
    path('payments/<int:pk>/parent_delete/', PaymentViewSet.as_view({'delete': 'delete_pending'}), name='parent-delete'),
    path('payments/<int:pk>/reject_payment/', PaymentViewSet.as_view({'post': 'reject_payment'}), name='reject-payment'),
    path('payments/<int:pk>/delete_pending/', PaymentViewSet.as_view({'delete': 'delete_pending'}), name='delete-pending'),
    path('payments/bulk_reject/', PaymentViewSet.as_view({'post': 'bulk_reject'}), name='bulk-reject'),
    path('payments/bulk_delete_pending/', PaymentViewSet.as_view({'post': 'bulk_delete_pending'}), name='bulk-delete-pending'),
    
    # Archive/History endpoints
    path('payments/<int:pk>/archive_payment/', PaymentViewSet.as_view({'post': 'archive_payment'}), name='archive-payment'),
    path('payments/bulk_archive/', PaymentViewSet.as_view({'post': 'bulk_archive'}), name='bulk-archive'),
    path('payments/history/', PaymentViewSet.as_view({'get': 'history'}), name='payment-history'),
    path('payments/export/', PaymentViewSet.as_view({'get': 'export_payments'}), name='export-payments'),
    
    # Deadlines and reminders (via router)
    path('', include(router.urls)),
    
    # Reminder endpoints (legacy and new)
    path('send-reminders/', send_reminders, name='send-reminders'),
    path('payment-confirmation/<int:payment_id>/', send_payment_confirmation, name='payment-confirmation'),
    
    # Email reminders endpoint (via ReminderViewSet)
    path('reminders/send_email_reminders/', ReminderViewSet.as_view({'post': 'send_email_reminders'}), name='send-email-reminders'),
]

# ✅ SMS API URLs - ONLY multi-school endpoints (old ones removed)
urlpatterns += [
    path('sms/multi-school/balance/', MultiSchoolSMSBalanceView.as_view(), name='multi-school-sms-balance'),
    path('sms/multi-school/test/', MultiSchoolSendTestSMSView.as_view(), name='multi-school-sms-test'),
    path('sms/multi-school/reminder/', MultiSchoolSendPaymentReminderView.as_view(), name='multi-school-sms-reminder'),
    path('sms/multi-school/bulk-reminders/', MultiSchoolSendBulkRemindersView.as_view(), name='multi-school-bulk-reminders'),
    path('sms/multi-school/deadline/<int:deadline_id>/pending/', MultiSchoolSMSPendingRemindersView.as_view(), name='multi-school-pending-reminders'),
]

# Report URLs
urlpatterns += [
    path('reports/monthly/', monthly_report, name='monthly-report'),
    path('reports/monthly-detailed/', monthly_detailed_report, name='monthly-detailed-report'),
    path('reports/student/<str:student_id>/', student_report, name='student-report'),
    path('reports/annual/', annual_summary, name='annual-summary'),
]

# Slip API URLs
urlpatterns += [
    path('slips/upload/', upload_slip, name='upload-slip'),
    path('slips/<int:slip_id>/status/', slip_status, name='slip-status'),
    path('slips/pending/', pending_slips, name='pending-slips'),
    path('slips/<int:slip_id>/verify/', verify_slip, name='verify-slip'),
    path('slips/<int:slip_id>/delete/', delete_slip, name='delete-slip'),
    path('slips/bulk-delete/', bulk_delete_slips, name='bulk-delete-slips'),
    path('slips/ai-stats/', ai_stats, name='ai-stats'),
    path('slips/extract-data/', extract_slip_data, name='extract-slip-data'),
    path('slips/<int:slip_id>/update-transaction-ref/', update_transaction_reference, name='update-transaction-reference'),
    path('slips/<int:slip_id>/check-receipt/', check_receipt_with_verify_et, name='check-receipt-verify-et'),
    path('slips/<int:slip_id>/verify-from-api/', verify_slip_from_api, name='verify-slip-from-api'),
]

# Chapa API URLs
urlpatterns += [
    path('chapa/initiate/', initiate_chapa_payment, name='chapa-initiate'),
    path('chapa/webhook/', chapa_webhook, name='chapa-webhook'),
    path('chapa/verify/', verify_chapa_payment, name='chapa-verify'),
    path('chapa/banks/', get_chapa_banks, name='chapa-banks'),
    path('chapa/test-payment/', test_payment, name='test-payment'),
    path('chapa/mobile-redirect/', mobile_redirect, name='mobile-redirect'),
    path('payments/status/<str:tx_ref>/', payment_status, name='payment-status'),
]

# Filtered reminders endpoint (used by SMSDashboard)
urlpatterns += [
    path('reminders-filtered/', pending_reminders_filtered, name='reminders-filtered'),
]

# Anti-Spoofing Payment Link URLs (Public endpoints protected by signed tokens)
urlpatterns += [
    path('pay/<str:token>/', PaymentLandingView.as_view(), name='payment-landing'),
    path('pay/<str:token>/verify-otp/', OtpVerifyView.as_view(), name='payment-verify-otp'),
    path('pay/<str:token>/initiate/', PaymentInitiateView.as_view(), name='payment-initiate'),
]
urlpatterns += [
    path('receipt/<str:token>/', get_receipt, name='payment-receipt'),
]