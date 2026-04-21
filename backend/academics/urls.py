# backend/academics/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Register with empty prefix because core/urls.py already has 'academic-years/'
router = DefaultRouter()
router.register(r'', views.AcademicYearViewSet, basename='academic-year')

urlpatterns = [
    path('', include(router.urls)),
]