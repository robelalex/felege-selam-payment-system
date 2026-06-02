# backend/academics/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# No router needed here since core/urls.py already registers AcademicYearViewSet
# Only add custom actions that are not covered by the router

urlpatterns = [
    # Custom actions that need explicit paths
    path('academic-years/current/', views.AcademicYearViewSet.as_view({'get': 'current'}), name='academic-year-current'),
    path('academic-years/archived/', views.AcademicYearViewSet.as_view({'get': 'get_archived'}), name='academic-year-archived'),
    path('academic-years/<int:pk>/promote_students/', views.AcademicYearViewSet.as_view({'post': 'promote_students'}), name='academic-year-promote'),
    path('academic-years/<int:pk>/set_current/', views.AcademicYearViewSet.as_view({'post': 'set_current'}), name='academic-year-set-current'),
    path('academic-years/<int:pk>/archive/', views.AcademicYearViewSet.as_view({'patch': 'archive_year'}), name='academic-year-archive'),
    path('academic-years/<int:pk>/restore/', views.AcademicYearViewSet.as_view({'patch': 'restore_year'}), name='academic-year-restore'),
    path('academic-years/create_next_year/', views.AcademicYearViewSet.as_view({'post': 'create_next_year'}), name='academic-year-create-next'),
]