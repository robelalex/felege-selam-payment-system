# backend/authentication/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='admin-register'),
    path('verify-email/<uuid:token>/', views.verify_email, name='verify-email'),
    path('login/', views.login, name='admin-login'),
    path('logout/', views.logout, name='admin-logout'),
    path('forgot-password/', views.forgot_password, name='forgot-password'),
    path('reset-password/', views.reset_password, name='reset-password'),
    path('csrf/', views.get_csrf_token, name='csrf-token'),
    path('me/', views.get_current_user, name='current-user'),
]