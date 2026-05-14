# backend/admin_dashboard/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.custom_login, name='custom-login'),
    path('auto-login/', views.auto_login_and_redirect, name='auto-login'),
    path('dashboard/', views.dashboard, name='admin-dashboard-home'),
    path('', views.dashboard, name='admin-dashboard'),
    
    # Schools
    path('schools/', views.schools_list, name='admin-schools'),
    path('schools/create/', views.school_create, name='admin-school-create'),
    path('schools/edit/<int:school_id>/', views.school_edit, name='admin-school-edit'),
    path('schools/delete/<int:school_id>/', views.school_delete, name='admin-school-delete'),
    
    # Users
    path('users/', views.users_list, name='admin-users'),
    path('users/edit/<int:user_id>/', views.user_edit, name='admin-user-edit'),
    path('users/delete/<int:user_id>/', views.user_delete, name='admin-user-delete'),
]