# backend/payments/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PaymentViewSet, PaymentDeadlineViewSet, ReminderViewSet
from .views import send_reminders, send_payment_confirmation

router = DefaultRouter()
router.register(r'payments', PaymentViewSet)
router.register(r'deadlines', PaymentDeadlineViewSet)
router.register(r'reminders', ReminderViewSet, basename='reminder')

urlpatterns = [
    path('', include(router.urls)),
    path('send-reminders/', send_reminders, name='send-reminders'),
    path('payment-confirmation/<int:payment_id>/', send_payment_confirmation, name='payment-confirmation'),
]