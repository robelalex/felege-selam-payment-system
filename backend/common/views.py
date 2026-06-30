# backend/common/views.py
from django.http import JsonResponse
from rest_framework import viewsets
from rest_framework.response import Response


def health_check(request):
    """Lightweight endpoint for Render port scanning and uptime monitoring"""
    return JsonResponse({'status': 'healthy', 'service': 'felege-selam-payment-system'}, status=200)


class SchoolFilteredViewSet(viewsets.ModelViewSet):
    """Base ViewSet that automatically filters by school from header"""
    
    def get_queryset(self):
        queryset = super().get_queryset()
        school_id = self.request.headers.get('X-School-ID')
        
        if school_id:
            try:
                # Filter by school_id field (works for Student, PaymentDeadline, etc.)
                queryset = queryset.filter(school_id=int(school_id))
            except Exception:
                # If model doesn't have school_id, try student__school_id (for Payment)
                try:
                    queryset = queryset.filter(student__school_id=int(school_id))
                except Exception:
                    pass
        return queryset