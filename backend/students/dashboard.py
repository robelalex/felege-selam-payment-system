# students/dashboard.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import datetime, timedelta, date
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from authentication.permissions import CanViewReports
from common.utils import get_verified_school_id

# ✅ SECURITY FIX: all 4 endpoints below were AllowAny and resolved the
# school from the client-supplied X-School-ID header — anyone on the
# internet, no login, could pull another school's dashboard/financial
# stats. Now requires login + report access, school resolved from the
# caller's real account.


def get_date_range_for_period(period, academic_year=None):
    """Get date range for different periods"""
    today = date.today()

    if period == 'today':
        return today, today

    elif period == 'week':
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end

    elif period == 'month':
        start = date(today.year, today.month, 1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return start, end

    elif period == 'year':
        if academic_year and academic_year.start_date and academic_year.end_date:
            return academic_year.start_date, academic_year.end_date
        else:
            start = date(today.year, 1, 1)
            end = date(today.year, 12, 31)
            return start, end

    return None, None


@api_view(['GET'])
@permission_classes([IsAuthenticated, CanViewReports])
def dashboard_stats(request):
    """Get dashboard statistics"""
    school_id = get_verified_school_id(request)

    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')

    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=year_id)
        except AcademicYear.DoesNotExist:
            academic_year = AcademicYear.objects.filter(is_current=True).first()
    else:
        academic_year = AcademicYear.objects.filter(is_current=True).first()

    if not academic_year:
        return Response({'error': 'No academic year found'}, status=400)

    all_students = Student.objects.filter(
        status='active',
        academic_year=academic_year.name
    )

    if school_id:
        try:
            all_students = all_students.filter(school_id=int(school_id))
        except ValueError:
            pass

    total_students = all_students.count()

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

    student_ids = all_students.values_list('id', flat=True)

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
@permission_classes([IsAuthenticated, CanViewReports])
def grade_overview(request):
    """Get overview by grade - ALWAYS shows total students per grade"""
    school_id = get_verified_school_id(request)

    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')

    if not school_id:
        return Response([])

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

    all_students_in_year = Student.objects.filter(
        status='active',
        academic_year=academic_year.name,
        school_id=int(school_id)
    )

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

    # ✅ FIXED: 1-12 instead of 1-8
    all_grades = range(1, 13)
    grade_data = []

    for grade in all_grades:
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

    return Response(grade_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, CanViewReports])
def pending_payments(request):
    """Get students with pending payments for the selected period"""
    school_id = get_verified_school_id(request)

    year_id = request.GET.get('academic_year_id')
    period = request.GET.get('period', 'year')
    start_date_param = request.GET.get('start_date')
    end_date_param = request.GET.get('end_date')

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

    students = Student.objects.filter(
        status='active',
        academic_year=academic_year.name
    )

    if school_id:
        try:
            students = students.filter(school_id=int(school_id))
        except ValueError:
            pass

    student_ids = students.values_list('id', flat=True)

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
@permission_classes([IsAuthenticated, CanViewReports])
def monthly_report_filtered(request):
    """Get monthly report filtered by academic year AND school"""
    from django.db.models import Sum

    year_id = request.query_params.get('academic_year_id')
    month = request.query_params.get('month')
    school_id = get_verified_school_id(request)

    if not year_id:
        return Response({'error': 'academic_year_id required'}, status=400)

    if not school_id:
        return Response({'error': 'No school associated with this account'}, status=400)

    try:
        school_id = int(school_id)
        academic_year = AcademicYear.objects.get(id=year_id, school_id=school_id)

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
        # ✅ FIXED: 1-12 instead of 1-8
        for grade in range(1, 13):
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