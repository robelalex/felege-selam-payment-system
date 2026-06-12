# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    SchoolSMSConfigView, 
    SchoolSMSTestView, 
    fix_missing_profiles, 
    sms_config_preflight,
    verify_et_settings,           # NEW
    test_verify_et_connection     # NEW
)

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)

urlpatterns = [
    # DEBUG endpoint - Find the problem
    path('sms-config-preflight/', sms_config_preflight, name='sms-preflight'),
    
    # TEMPORARY - Remove after running
    path('fix-missing-profiles/', fix_missing_profiles, name='fix-missing-profiles'),
    
    # SMS endpoints
    path('sms-config/', SchoolSMSConfigView.as_view(), name='school-sms-config'),
    path('sms-test/', SchoolSMSTestView.as_view(), name='school-sms-test'),
    
    # ========== NEW: Verify.ET Endpoints ==========
    # Each school configures their own Verify.ET credentials
    path('verify-et-settings/', verify_et_settings, name='verify-et-settings'),
    path('verify-et-test/', test_verify_et_connection, name='verify-et-test'),
    
    path('', include(router.urls)),
]