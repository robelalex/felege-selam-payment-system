# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import SchoolSMSConfigView, SchoolSMSTestView, fix_missing_profiles, sms_config_preflight

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
    
    path('', include(router.urls)),
]