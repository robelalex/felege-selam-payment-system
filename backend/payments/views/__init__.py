# backend/payments/views/__init__.py
from .views import PaymentViewSet, PaymentDeadlineViewSet, payments_filtered_by_year
from .reminder_views import ReminderViewSet, send_reminders, send_payment_confirmation
# ✅ REMOVED old sms_views import (file deleted)
# ✅ ADD new sms_views_v2 imports
from .sms_views_v2 import (
    MultiSchoolSMSBalanceView,
    MultiSchoolSendTestSMSView,
    MultiSchoolSendPaymentReminderView,
    MultiSchoolSendBulkRemindersView,
    MultiSchoolSMSPendingRemindersView
)
from .report_views import monthly_report, student_report, annual_summary
from .slip_views import upload_slip, pending_slips, verify_slip, ai_stats
from .chapa_views import (
    initiate_chapa_payment, chapa_webhook, 
    verify_chapa_payment, get_chapa_banks
)

__all__ = [
    'PaymentViewSet',
    'PaymentDeadlineViewSet',
    'ReminderViewSet',
    'payments_filtered_by_year',
    'send_reminders',
    'send_payment_confirmation',
    # ✅ NEW SMS exports
    'MultiSchoolSMSBalanceView',
    'MultiSchoolSendTestSMSView',
    'MultiSchoolSendPaymentReminderView',
    'MultiSchoolSendBulkRemindersView',
    'MultiSchoolSMSPendingRemindersView',
    'monthly_report',
    'student_report',
    'annual_summary',
    'upload_slip',
    'pending_slips',
    'verify_slip',
    'ai_stats',
    'initiate_chapa_payment',
    'chapa_webhook',
    'verify_chapa_payment',
    'get_chapa_banks',
]