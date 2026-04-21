# backend/students/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Register with empty prefix because core/urls.py already has 'students/'
router = DefaultRouter()
router.register(r'', views.StudentViewSet, basename='student')

urlpatterns = [
    path('', include(router.urls)),
]