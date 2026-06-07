# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import SchoolSMSConfigView, SchoolSMSTestView

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)

urlpatterns = [
    # ✅ FIXED: Use a path that doesn't conflict with router
    # The router handles /schools/ and /schools/<id>/
    # So use /sms-config/ instead of /schools/sms-config/
    path('sms-config/', SchoolSMSConfigView.as_view(), name='school-sms-config'),
    path('sms-test/', SchoolSMSTestView.as_view(), name='school-sms-test'),
    
    # Router for standard CRUD operations
    path('', include(router.urls)),
]