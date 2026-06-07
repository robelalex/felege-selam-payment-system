# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import SchoolSMSConfigView, SchoolSMSTestView

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)

urlpatterns = [
    # ✅ CUSTOM URLs MUST COME FIRST (before the router)
    # Note: No 'api/' prefix because core/urls.py already has it
    path('schools/sms-config/', SchoolSMSConfigView.as_view(), name='school-sms-config'),
    path('schools/sms-test/', SchoolSMSTestView.as_view(), name='school-sms-test'),
    
    # Router for standard CRUD operations
    path('', include(router.urls)),
]