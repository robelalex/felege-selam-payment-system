# staff/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StaffMemberViewSet, TeacherClassAssignmentViewSet, my_assignments,
    StaffDocumentViewSet,
)

router = DefaultRouter()
# ✅ NOTE: intentionally "staff-members", NOT "staff" — the authentication
# app already owns /api/staff/, /api/staff/create/, /api/staff/delete/<id>/
# for a pre-existing (separate) login-account system. Using "staff" here
# would collide with and silently shadow those routes, since this router
# gets included first in core/urls.py.
router.register(r'staff-members', StaffMemberViewSet, basename='staff-member')
router.register(r'class-assignments', TeacherClassAssignmentViewSet, basename='class-assignment')
# ✅ Jimma item 5 — HR documents. 'staff-documents', not 'documents', to
# stay unambiguous next to other unrelated "document" concepts elsewhere
# in the codebase (e.g. bank slip uploads).
router.register(r'staff-documents', StaffDocumentViewSet, basename='staff-document')

urlpatterns = [
    path('', include(router.urls)),
    path('teacher/my-assignments/', my_assignments, name='teacher-my-assignments'),
]
