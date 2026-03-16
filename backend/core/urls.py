# core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from authentication import views as auth_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('schools.urls')),
    path('api/', include('students.urls')),
    path('api/', include('payments.urls')),
    path('api/', include('academics.urls')),
    path('api-auth/', include('rest_framework.urls')),
    path('api/admin/login/', auth_views.admin_login),
    path('api/admin/logout/', auth_views.admin_logout),
    path('api/admin/', include('authentication.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)