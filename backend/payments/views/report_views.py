# backend/payments/views/report_views.py
from rest_framework.decorators import api_view, permission_classes
# from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from ..services.report_service import ReportService
from rest_framework.permissions import IsAuthenticated, AllowAny

@api_view(['GET'])
@permission_classes([AllowAny])
# @permission_classes([IsAuthenticated, IsAdminUser])
def monthly_report(request):
    """Get monthly collection report"""
    year = request.query_params.get('year')
    month = request.query_params.get('month')
    
    service = ReportService()
    report = service.get_monthly_report(year, month)
    
    return Response(report)

@api_view(['GET'])
@permission_classes([AllowAny])
# @permission_classes([IsAuthenticated, IsAdminUser])
def student_report(request, student_id):
    """Get report for a specific student"""
    service = ReportService()
    report = service.get_student_report(student_id)
    
    return Response(report)

@api_view(['GET'])
@permission_classes([AllowAny])
# @permission_classes([IsAuthenticated, IsAdminUser])
def annual_summary(request):
    """Get annual summary report"""
    year = request.query_params.get('year')
    
    service = ReportService()
    report = service.get_annual_summary(year)
    
    return Response(report)