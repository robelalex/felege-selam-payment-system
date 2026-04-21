# backend/payments/views/report_views.py - UPDATED with School Filtering
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from ..services.report_service import ReportService
from academics.models import AcademicYear
from students.models import Student


@api_view(['GET'])
@permission_classes([AllowAny])
def monthly_report(request):
    """Get monthly collection report for the current school"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    year = request.query_params.get('year')
    month = request.query_params.get('month')
    
    print(f"📊 monthly_report - X-School-ID: {school_id}")
    print(f"📊 monthly_report - year: {year}, month: {month}")
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    service = ReportService()
    report = service.get_monthly_report(year, month, school_id=int(school_id))
    
    return Response(report)


@api_view(['GET'])
@permission_classes([AllowAny])
def student_report(request, student_id):
    """Get report for a specific student - verify school access"""
    
    # ✅ Verify student belongs to the school from header
    school_id = request.headers.get('X-School-ID')
    
    if school_id:
        try:
            from students.models import Student
            student = Student.objects.get(student_id=student_id)
            if str(student.school_id) != school_id:
                return Response({'error': 'Access denied - Student does not belong to your school'}, status=403)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=404)
    
    service = ReportService()
    report = service.get_student_report(student_id)
    
    return Response(report)


@api_view(['GET'])
@permission_classes([AllowAny])
def annual_summary(request):
    """Get annual summary report for the current school"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    year = request.query_params.get('year')
    
    print(f"📊 annual_summary - X-School-ID: {school_id}")
    print(f"📊 annual_summary - year: {year}")
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    service = ReportService()
    report = service.get_annual_summary(year, school_id=int(school_id))
    
    return Response(report)


@api_view(['GET'])
@permission_classes([AllowAny])
def collection_summary(request):
    """Get collection summary for dashboard"""
    
    # ✅ Get school from header
    school_id = request.headers.get('X-School-ID')
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    try:
        from ..models import Payment
        from students.models import Student
        from datetime import datetime
        
        school_id_int = int(school_id)
        
        # Get current academic year
        current_year = AcademicYear.objects.filter(is_current=True).first()
        year_name = current_year.name if current_year else None
        
        # Get students for this school
        students = Student.objects.filter(school_id=school_id_int)
        total_students = students.count()
        
        # Get payments for this school
        payments = Payment.objects.filter(student__school_id=school_id_int, status='verified')
        total_collected = payments.aggregate(total=models.Sum('amount'))['total'] or 0
        
        # Monthly breakdown
        monthly_data = {}
        for payment in payments:
            month_key = payment.created_at.strftime('%Y-%m')
            monthly_data[month_key] = monthly_data.get(month_key, 0) + float(payment.amount)
        
        return Response({
            'total_students': total_students,
            'total_collected': float(total_collected),
            'monthly_breakdown': monthly_data,
            'academic_year': year_name
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)