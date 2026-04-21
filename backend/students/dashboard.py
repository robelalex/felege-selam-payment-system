# students/dashboard.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import datetime, timedelta, date
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear


def get_date_range_for_period(period, academic_year=None):
    """Get date range for different periods"""
    today = date.today()
    
    if period == 'today':
        return today, today
    
    elif period == 'week':
        # Monday to Sunday
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end
    
    elif period == 'month':
        # Current calendar month
        start = date(today.year, today.month, 1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return start, end
    
    elif period == 'year':
        # Use academic year dates
        if academic_year and academic_year.start_date and academic_year.end_date:
            return academic_year.start_date, academic_year.end_date
        else:
            start = date(today.year, 1, 1)
            end = date(today.year, 12, 31)
            return start, end
    
    return None, None


@api_view(['GET'])
@permission_classes([AllowAny])
def dashboard_stats(request):
    """Get dashboard statistics"""
    print("=" * 50)
    print("📊 dashboard_stats called")
    
    # ✅ Filter by school from header
    school_id = request.headers.get('X-School-ID')
    print(f"📊 X-School-ID header: {school_id}")
    
    # Get query parameters
    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')
    
    print(f"📊 year_id: {year_id}")
    print(f"📊 period: {period}")
    
    # Determine academic year
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=year_id)
            print(f"📊 Found academic year: {academic_year.name}")
        except AcademicYear.DoesNotExist:
            academic_year = AcademicYear.objects.filter(is_current=True).first()
    else:
        academic_year = AcademicYear.objects.filter(is_current=True).first()
    
    if not academic_year:
        return Response({'error': 'No academic year found'}, status=400)
    
    # ✅ Filter students by school AND academic year
    all_students = Student.objects.filter(
        status='active',
        academic_year=academic_year.name
    )
    
    if school_id:
        try:
            all_students = all_students.filter(school_id=int(school_id))
            print(f"📊 Filtered by school ID: {school_id}")
        except ValueError:
            print(f"📊 Invalid school ID: {school_id}")
    
    total_students = all_students.count()
    print(f"👥 Total active students: {total_students}")
    
    # Determine date range for payment filtering
    if start_date_param and end_date_param:
        start = start_date_param
        end = end_date_param
    else:
        start_date, end_date = get_date_range_for_period(period, academic_year)
        if start_date and end_date:
            start = start_date.isoformat()
            end = end_date.isoformat()
        else:
            start = None
            end = None
    
    print(f"📅 Payment period: {start} to {end}")
    
    # Get student IDs
    student_ids = all_students.values_list('id', flat=True)
    
    # Calculate paid students based on period
    if start and end:
        payments_in_period = Payment.objects.filter(
            student_id__in=student_ids,
            created_at__date__gte=start,
            created_at__date__lte=end,
            status='verified'
        )
        students_with_payments = payments_in_period.values('student').distinct().count()
        total_collected = payments_in_period.aggregate(total=Sum('amount'))['total'] or 0
        collection_rate = (students_with_payments / total_students * 100) if total_students > 0 else 0
        pending_students = total_students - students_with_payments
    else:
        students_with_payments = 0
        total_collected = 0
        collection_rate = 0
        pending_students = total_students
    
    print(f"💳 Students with payments: {students_with_payments}")
    print(f"💰 Total collected: {total_collected}")
    
    return Response({
        'total_students': total_students,
        'students_paid': students_with_payments,
        'total_collected': float(total_collected),
        'collection_rate': round(collection_rate, 2),
        'pending_students': pending_students,
        'academic_year': academic_year.name,
        'period': period
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def grade_overview(request):
    """Get overview by grade - ALWAYS shows total students per grade"""
    print("=" * 50)
    print("📊 grade_overview called")
    
    # ✅ Filter by school from header
    school_id = request.headers.get('X-School-ID')
    print(f"📊 X-School-ID header: {school_id}")
    
    # Get query parameters
    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')
    
    print(f"📊 year_id: {year_id}")
    print(f"📊 period: {period}")
    
    if not school_id:
        return Response([])
    
    # Determine academic year (filtered by school)
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=year_id, school_id=int(school_id))
        except AcademicYear.DoesNotExist:
            academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
    else:
        academic_year = AcademicYear.objects.filter(school_id=int(school_id), is_current=True).first()
    
    if not academic_year:
        return Response([])
    
    # ✅ Filter students by school AND academic year
    all_students_in_year = Student.objects.filter(
        status='active',
        academic_year=academic_year.name,
        school_id=int(school_id)
    )
    
    print(f"📊 Filtered by school ID: {school_id}")
    
    # Determine date range for payment filtering
    if start_date_param and end_date_param:
        start = start_date_param
        end = end_date_param
    else:
        start_date, end_date = get_date_range_for_period(period, academic_year)
        if start_date and end_date:
            start = start_date.isoformat()
            end = end_date.isoformat()
        else:
            start = None
            end = None
    
    print(f"📅 Payment period: {start} to {end}")
    
    # Get all grades 1-8
    all_grades = range(1, 9)
    grade_data = []
    
    for grade in all_grades:
        # TOTAL students in this grade
        students_in_grade = all_students_in_year.filter(grade=grade)
        total_students = students_in_grade.count()
        
        if total_students == 0:
            grade_data.append({
                'grade': grade,
                'total': 0,
                'paid': 0,
                'pending': 0,
                'collection_rate': 0
            })
            continue
        
        # Calculate paid students based on period
        if start and end:
            student_ids = students_in_grade.values_list('id', flat=True)
            paid_students = Payment.objects.filter(
                student_id__in=student_ids,
                created_at__date__gte=start,
                created_at__date__lte=end,
                status='verified'
            ).values('student').distinct().count()
        else:
            paid_students = 0
        
        collection_rate = (paid_students / total_students * 100) if total_students > 0 else 0
        
        grade_data.append({
            'grade': grade,
            'total': total_students,
            'paid': paid_students,
            'pending': total_students - paid_students,
            'collection_rate': round(collection_rate, 2)
        })
        
        print(f"📊 Grade {grade}: {total_students} total students, {paid_students} paid in {period}")
    
    return Response(grade_data)

@api_view(['GET'])
@permission_classes([AllowAny])
def pending_payments(request):
    """Get students with pending payments for the selected period"""
    print("=" * 50)
    print("📊 pending_payments called")
    
    # ✅ Filter by school from header
    school_id = request.headers.get('X-School-ID')
    print(f"📊 X-School-ID header: {school_id}")
    
    # Get query parameters
    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')
    
    # Determine academic year
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=year_id)
        except AcademicYear.DoesNotExist:
            academic_year = AcademicYear.objects.filter(is_current=True).first()
    else:
        academic_year = AcademicYear.objects.filter(is_current=True).first()
    
    if not academic_year:
        return Response([])
    
    # Determine date range for payments
    if start_date_param and end_date_param:
        start = start_date_param
        end = end_date_param
    else:
        start_date, end_date = get_date_range_for_period(period, academic_year)
        if start_date and end_date:
            start = start_date.isoformat()
            end = end_date.isoformat()
        else:
            start = None
            end = None
    
    # ✅ Filter students by school AND academic year
    students = Student.objects.filter(
        status='active',
        academic_year=academic_year.name
    )
    
    if school_id:
        try:
            students = students.filter(school_id=int(school_id))
            print(f"📊 Filtered by school ID: {school_id}")
        except ValueError:
            print(f"📊 Invalid school ID: {school_id}")
    
    student_ids = students.values_list('id', flat=True)
    
    # Get students who HAVE paid in this period
    if start and end:
        students_who_paid = Payment.objects.filter(
            student_id__in=student_ids,
            created_at__date__gte=start,
            created_at__date__lte=end,
            status='verified'
        ).values_list('student_id', flat=True).distinct()
        
        pending_students = students.exclude(id__in=students_who_paid)
    else:
        pending_students = students
    
    print(f"📊 Total students: {students.count()}, Pending: {pending_students.count()}")
    
    # Return pending students data
    pending_data = []
    for student in pending_students[:20]:
        pending_data.append({
            'id': student.id,
            'full_name': student.full_name,
            'student_id': student.student_id,
            'grade': student.grade,
            'section': student.section,
            'monthly_fee': str(student.monthly_fee) if student.monthly_fee else '0.00',
            'parent_phone': student.parent_phone,
            'parent_email': getattr(student, 'parent_email', '')
        })
    
    return Response(pending_data)


@api_view(['GET'])
@permission_classes([AllowAny])
def monthly_report_filtered(request):
    """Get monthly report filtered by academic year AND school"""
    from django.db.models import Sum
    
    year_id = request.query_params.get('academic_year_id')
    month = request.query_params.get('month')
    school_id = request.headers.get('X-School-ID')  # ✅ ADD SCHOOL FILTERING
    
    print(f"📊 ===== MONTHLY REPORT FILTERED =====")
    print(f"📊 year_id: {year_id}")
    print(f"📊 month: {month}")
    print(f"📊 school_id: {school_id}")  # ✅ ADD DEBUG
    
    if not year_id:
        return Response({'error': 'academic_year_id required'}, status=400)
    
    if not school_id:
        return Response({'error': 'School ID required'}, status=400)
    
    try:
        school_id = int(school_id)
        academic_year = AcademicYear.objects.get(id=year_id, school_id=school_id)
        print(f"📊 Academic year: {academic_year.name}")
        
        # ✅ Filter students by school AND academic year
        students = Student.objects.filter(
            status='active',
            academic_year=academic_year.name,
            school_id=school_id
        )
        
        total_students = students.count()
        student_ids = students.values_list('id', flat=True)
        
        payments = Payment.objects.filter(
            student_id__in=student_ids,
            deadline__month=month,
            status='verified'
        )
        
        total_collected = payments.aggregate(total=Sum('amount'))['total'] or 0
        students_paid = payments.values('student').distinct().count()
        
        by_grade = {}
        for grade in range(1, 9):
            grade_students = students.filter(grade=grade)
            grade_total = grade_students.count()
            
            grade_payments = Payment.objects.filter(
                student_id__in=grade_students.values_list('id', flat=True),
                deadline__month=month,
                status='verified'
            )
            
            grade_paid = grade_payments.values('student').distinct().count()
            grade_collected = grade_payments.aggregate(total=Sum('amount'))['total'] or 0
            
            by_grade[grade] = {
                'total': grade_total,
                'paid': grade_paid,
                'pending': grade_total - grade_paid,
                'collected': float(grade_collected),
                'collection_rate': round((grade_paid / grade_total * 100), 1) if grade_total > 0 else 0
            }
        
        return Response({
            'summary': {
                'total_students': total_students,
                'total_paid': students_paid,
                'total_pending': total_students - students_paid,
                'total_collected': float(total_collected),
                'collection_rate': round((students_paid / total_students * 100), 1) if total_students > 0 else 0
            },
            'by_grade': by_grade,
            'year': academic_year.name,
            'month': month
        })
        
    except AcademicYear.DoesNotExist:
        return Response({'error': 'Academic year not found for this school'}, status=404)
    except ValueError:
        return Response({'error': 'Invalid school ID'}, status=400)