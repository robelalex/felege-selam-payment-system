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
    
@api_view(['GET'])
@permission_classes([AllowAny])
def monthly_detailed_report(request):
    """Get detailed monthly report with student-level data for a specific month"""
    
    school_id = request.headers.get('X-School-ID')
    year = request.query_params.get('year')
    month = request.query_params.get('month')
    grade = request.query_params.get('grade')  # Optional grade filter
    student_search = request.query_params.get('student_search')  # Optional student search
    
    print(f"📊 monthly_detailed_report - X-School-ID: {school_id}")
    print(f"📊 monthly_detailed_report - year: {year}, month: {month}, grade: {grade}")
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    if not year or not month:
        return Response({'error': 'year and month are required'}, status=400)
    
    try:
        school_id_int = int(school_id)
        month_int = int(month)
        
        # Get all active students for this school
        students = Student.objects.filter(school_id=school_id_int, status='active')
        
        # Filter by grade if provided
        if grade and grade != 'all':
            students = students.filter(grade=int(grade))
        
        # Filter by student search if provided
        if student_search:
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
        
        # Get payments for this specific month and year
        payments = Payment.objects.filter(
            student__school_id=school_id_int,
            deadline__academic_year=year,
            deadline__month=month_int,
            status='verified'
        )
        
        # Create a map of student_id -> payment
        payment_map = {}
        for payment in payments:
            payment_map[payment.student_id] = {
                'amount': float(payment.amount),
                'payment_method': payment.payment_method,
                'payment_date': payment.created_at.strftime('%Y-%m-%d %H:%M'),
                'transaction_reference': payment.transaction_reference,
                'verified_at': payment.verified_at.strftime('%Y-%m-%d') if payment.verified_at else None
            }
        
        # Build detailed student list
        detailed_students = []
        total_collected = 0
        paid_count = 0
        
        for student in students:
            payment_info = payment_map.get(student.id)
            if payment_info:
                paid_count += 1
                total_collected += payment_info['amount']
                detailed_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'parent_phone': student.parent_phone,
                    'paid_amount': payment_info['amount'],
                    'payment_method': payment_info['payment_method'],
                    'payment_date': payment_info['payment_date'],
                    'transaction_reference': payment_info['transaction_reference'],
                    'status': 'paid'
                })
            else:
                detailed_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'parent_phone': student.parent_phone,
                    'paid_amount': 0,
                    'payment_method': None,
                    'payment_date': None,
                    'transaction_reference': None,
                    'status': 'pending'
                })
        
        # Sort by grade then name
        detailed_students.sort(key=lambda x: (x['grade'], x['student_name']))
        
        # Get month name
        months = ['መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
                  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ']
        month_name = months[month_int - 1] if 1 <= month_int <= 13 else str(month_int)
        
        return Response({
            'success': True,
            'year': year,
            'month': month_int,
            'month_name': month_name,
            'summary': {
                'total_students': students.count(),
                'paid_count': paid_count,
                'pending_count': students.count() - paid_count,
                'total_collected': total_collected,
                'collection_rate': round((paid_count / students.count() * 100) if students.count() > 0 else 0, 1)
            },
            'students': detailed_students
        })
        
    except ValueError:
        return Response({'error': 'Invalid month or year format'}, status=400)
    except Exception as e:
        print(f"Error in monthly_detailed_report: {e}")
        return Response({'error': str(e)}, status=500)