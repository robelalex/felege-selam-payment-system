# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import SchoolSMSConfigView, SchoolSMSTestView, fix_missing_profiles

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)

urlpatterns = [
    # TEMPORARY - Remove after running
    path('fix-missing-profiles/', fix_missing_profiles, name='fix-missing-profiles'),
    
    # SMS endpoints
    path('sms-config/', SchoolSMSConfigView.as_view(), name='school-sms-config'),
    path('sms-test/', SchoolSMSTestView.as_view(), name='school-sms-test'),
    
    path('', include(router.urls)),
]