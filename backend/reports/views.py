# backend/reports/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from django.db.models import Sum, Count, Q
from datetime import date
from collections import defaultdict


@api_view(['GET'])
@permission_classes([AllowAny])
def dashboard_stats(request):
    """Get dashboard statistics for the current school"""

    school_id = request.headers.get('X-School-ID')
    year_id = request.query_params.get('academic_year_id')

    print(f"📊 dashboard_stats - X-School-ID: {school_id}")
    print(f"📊 dashboard_stats - year_id: {year_id}")

    if not school_id:
        return Response({'error': 'School ID required'}, status=400)

    try:
        school_id = int(school_id)
    except ValueError:
        return Response({'error': 'Invalid school ID'}, status=400)

    # Resolve academic year object
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass

    if not academic_year:
        academic_year = AcademicYear.objects.filter(
            school_id=school_id, is_current=True
        ).first()

    print(f"📊 Academic year: {academic_year.name if academic_year else None}")

    # Students — still uses CharField on Student model, so use name string here
    students = Student.objects.filter(school_id=school_id)
    total_students = students.count()
    active_students = students.filter(status='active').count()

    # ✅ FIX: filter payments via deadline__academic_year FK object, not string
    payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    if academic_year:
        payments = payments.filter(deadline__academic_year=academic_year)

    total_collected = payments.aggregate(total=Sum('amount'))['total'] or 0

    # Pending verifications (unrelated to year)
    pending_verifications = Payment.objects.filter(
        student__school_id=school_id,
        status='pending'
    ).count()

    # ✅ FIX: filter deadlines via FK object, not string
    today = date.today()
    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        is_active=True
    )
    if academic_year:
        deadlines = deadlines.filter(academic_year=academic_year)

    # Verified payment set for overdue checking
    verified_qs = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    if academic_year:
        verified_qs = verified_qs.filter(deadline__academic_year=academic_year)

    paid_set = set(verified_qs.values_list('student_id', 'deadline_id'))

    pending_students_count = 0
    for deadline in deadlines:
        if deadline.due_date and deadline.due_date < today:
            for student in students.filter(status='active'):
                if (student.id, deadline.id) not in paid_set:
                    pending_students_count += 1
                    break

    # Students paid = distinct students with at least one verified payment
    students_paid = payments.values('student').distinct().count()

    # Collection rate
    active_count = students.filter(status='active').count()
    collection_rate = round((students_paid / active_count * 100) if active_count > 0 else 0, 1)

    return Response({
        'success': True,
        'total_students': total_students,
        'active_students': active_students,
        'students_paid': students_paid,
        'total_collected': float(total_collected),
        'collection_rate': collection_rate,
        'pending_verifications': pending_verifications,
        'pending_students': pending_students_count,
        'academic_year': academic_year.name if academic_year else None,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def grade_overview(request):
    """Get grade overview statistics for the current school"""

    school_id = request.headers.get('X-School-ID')
    year_id = request.query_params.get('academic_year_id')

    print(f"📊 grade_overview - X-School-ID: {school_id}")
    print(f"📊 grade_overview - year_id: {year_id}")

    if not school_id:
        return Response([], status=200)

    try:
        school_id = int(school_id)
    except ValueError:
        return Response([], status=200)

    # Resolve academic year object
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass

    if not academic_year:
        academic_year = AcademicYear.objects.filter(
            school_id=school_id, is_current=True
        ).first()

    # Students — Student.academic_year is still a CharField, filter by name
    students = Student.objects.filter(school_id=school_id, status='active')
    if academic_year:
        students = students.filter(academic_year=academic_year.name)

    # ✅ FIX: payments filtered via deadline FK object
    payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    if academic_year:
        payments = payments.filter(deadline__academic_year=academic_year)

    grade_stats = []
    for grade in range(1, 9):
        grade_students = students.filter(grade=grade)
        grade_count = grade_students.count()

        paid_students = payments.filter(
            student__grade=grade
        ).values('student').distinct().count()

        grade_stats.append({
            'grade': grade,
            'total': grade_count,
            'total_students': grade_count,
            'paid': paid_students,
            'paid_students': paid_students,
            'pending': max(grade_count - paid_students, 0),
            'pending_students': max(grade_count - paid_students, 0),
            'collection_rate': round(
                (paid_students / grade_count * 100) if grade_count > 0 else 0, 1
            ),
        })

    return Response(grade_stats)


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_payments_report(request):
    """Get pending payments report for the current school"""

    school_id = request.headers.get('X-School-ID')
    period = request.query_params.get('period', 'year')
    year_id = request.query_params.get('academic_year_id')

    print(f"📊 pending_payments_report - X-School-ID: {school_id}")
    print(f"📊 pending_payments_report - period: {period}, year_id: {year_id}")

    if not school_id:
        return Response([], status=200)

    try:
        school_id = int(school_id)
    except ValueError:
        return Response([], status=200)

    # Resolve academic year object
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass

    if not academic_year:
        academic_year = AcademicYear.objects.filter(
            school_id=school_id, is_current=True
        ).first()

    if not academic_year:
        return Response([], status=200)

    today = date.today()

    # Students — CharField filter is fine here
    students = Student.objects.filter(
        school_id=school_id,
        status='active',
        academic_year=academic_year.name
    )

    # ✅ FIX: deadlines filtered via FK object
    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        academic_year=academic_year,
        is_active=True
    )

    # ✅ FIX: verified payments filtered via FK object
    verified_qs = Payment.objects.filter(
        student__school_id=school_id,
        status='verified',
        deadline__academic_year=academic_year
    ).values_list('student_id', 'deadline_id')

    paid_set = set(verified_qs)

    months = [
        'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
        'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ]

    pending_data = []
    for student in students:
        student_pending = []
        for deadline in deadlines:
            is_overdue = deadline.due_date and deadline.due_date < today
            is_unpaid = (student.id, deadline.id) not in paid_set

            if is_overdue and is_unpaid:
                student_pending.append({
                    'month': deadline.month,
                    'month_name': (
                        months[deadline.month - 1]
                        if deadline.month <= len(months)
                        else f"Month {deadline.month}"
                    ),
                    'amount': float(deadline.amount),
                    'due_date': (
                        deadline.due_date.strftime('%Y-%m-%d')
                        if deadline.due_date else None
                    ),
                })

        if student_pending:
            pending_data.append({
                'student_id': student.student_id,
                'student_name': f"{student.first_name} {student.last_name}",
                'grade': student.grade,
                'section': student.section,
                'parent_phone': student.parent_phone,
                'pending_months': student_pending,
                'total_due': sum(p['amount'] for p in student_pending),
            })

    return Response(pending_data)