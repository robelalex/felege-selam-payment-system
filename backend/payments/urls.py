# backend/payments/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PaymentViewSet, PaymentDeadlineViewSet, ReminderViewSet
from .views import send_reminders, send_payment_confirmation
from .views.report_views import monthly_report, student_report, annual_summary

router = DefaultRouter()
router.register(r'payments', PaymentViewSet)
router.register(r'deadlines', PaymentDeadlineViewSet)
router.register(r'reminders', ReminderViewSet, basename='reminder')

urlpatterns = [
    path('', include(router.urls)),
    path('send-reminders/', send_reminders, name='send-reminders'),
    path('payment-confirmation/<int:payment_id>/', send_payment_confirmation, name='payment-confirmation'),

]
urlpatterns += [
    path('reports/monthly/', monthly_report, name='monthly-report'),
    path('reports/student/<str:student_id>/', student_report, name='student-report'),
    path('reports/annual/', annual_summary, name='annual-summary'),
]