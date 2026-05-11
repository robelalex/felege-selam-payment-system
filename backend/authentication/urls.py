# backend/authentication/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Registration (no 'admin/' prefix because main urls.py already has it)
    path('register/', views.register, name='admin-register'),
    
    # Admin Login with 2FA
    path('login/', views.admin_login_step1, name='admin-login-step1'),
    path('verify/', views.admin_login_step2, name='admin-login-step2'),
    
    # Parent Login with OTP
    path('parent/send-otp/', views.parent_login_step1, name='parent-send-otp'),
    path('parent/verify/', views.parent_login_step2, name='parent-verify-otp'),
    
    # Password management
    path('forgot-password/', views.forgot_password, name='forgot-password'),
    path('reset-password/', views.reset_password, name='reset-password'),
    path('change-password/', views.change_password, name='change-password'),
    path('logout/', views.logout, name='admin-logout'),
    
    # Email verification
    path('verify-email/<uuid:token>/', views.verify_email, name='verify-email'),
    
    # User info
    path('me/', views.get_current_user, name='current-user'),
    
    # CSRF token
    path('csrf/', views.get_csrf_token, name='csrf-token'),

        # ✅ NEW: Staff Management endpoints
    path('staff/', views.get_school_staff, name='get-school-staff'),
    path('staff/create/', views.create_staff, name='create-staff'),
    path('staff/delete/<int:user_id>/', views.delete_staff, name='delete-staff'),
]