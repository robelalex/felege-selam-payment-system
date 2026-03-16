# backend/authentication/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.admin_login, name='admin-login'),
    path('logout/', views.admin_logout, name='admin-logout'),
    path('csrf/', views.get_csrf_token, name='csrf-token'),
]