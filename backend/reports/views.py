# backend/reports/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from django.db.models import Sum, Count, Q
from datetime import date
from collections import defaultdict
from authentication.permissions import CanViewReports
from common.utils import get_verified_school_id
from payments.services.fee_override_service import get_effective_deadline_amount

# ✅ SECURITY FIX: all three endpoints below were AllowAny and resolved the
# school from the client-supplied X-School-ID header — anyone on the
# internet, no login, could pull another school's dashboard stats,
# grade-level collection rates, and pending-payment lists (including
# parent phone numbers). Now requires login + report access, and the
# school is resolved from the caller's real account.


@api_view(['GET'])
@permission_classes([IsAuthenticated, CanViewReports])
def dashboard_stats(request):
    """Get dashboard statistics for the current school"""

    school_id = get_verified_school_id(request)
    year_id = request.query_params.get('academic_year_id')

    if not school_id:
        return Response({'error': 'No school associated with this account'}, status=400)

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

    students = Student.objects.filter(school_id=school_id)
    total_students = students.count()
    active_students = students.filter(status='active').count()

    payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    if academic_year:
        payments = payments.filter(deadline__academic_year=academic_year)

    total_collected = payments.aggregate(total=Sum('amount'))['total'] or 0

    pending_verifications = Payment.objects.filter(
        student__school_id=school_id,
        status='pending'
    ).count()

    today = date.today()
    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        is_active=True
    )
    if academic_year:
        deadlines = deadlines.filter(academic_year=academic_year)

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

    students_paid = payments.values('student').distinct().count()

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
@permission_classes([IsAuthenticated, CanViewReports])
def grade_overview(request):
    """Get grade overview statistics for the current school"""

    school_id = get_verified_school_id(request)
    year_id = request.query_params.get('academic_year_id')

    if not school_id:
        return Response([], status=200)

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

    students = Student.objects.filter(school_id=school_id, status='active')
    if academic_year:
        students = students.filter(academic_year=academic_year.name)

    payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    if academic_year:
        payments = payments.filter(deadline__academic_year=academic_year)

    grade_stats = []
    # ✅ FIXED: 1-12 instead of 1-8
    for grade in range(1, 13):
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
@permission_classes([IsAuthenticated, CanViewReports])
def pending_payments_report(request):
    """Get pending payments report for the current school"""

    school_id = get_verified_school_id(request)
    period = request.query_params.get('period', 'year')
    year_id = request.query_params.get('academic_year_id')

    if not school_id:
        return Response([], status=200)

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

    students = Student.objects.filter(
        school_id=school_id,
        status='active',
        academic_year=academic_year.name
    )

    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        academic_year=academic_year,
        is_active=True
    )

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
                # ✅ Fee exceptions (Jimma request #1)
                effective_amount = get_effective_deadline_amount(student, deadline)
                if effective_amount <= 0:
                    continue
                student_pending.append({
                    'month': deadline.month,
                    'month_name': (
                        months[deadline.month - 1]
                        if deadline.month <= len(months)
                        else f"Month {deadline.month}"
                    ),
                    'amount': float(effective_amount),
                    'due_date': (
                        deadline.due_date.strftime('%Y-%m-%d')
                        if deadline.due_date else None
                    ),
                })

        if student_pending:
            pending_data.append({
                'student_id': student.student_id,
                'student_name': f"{student.formatted_name}",
                'grade': student.grade,
                'section': student.section,
                'parent_phone': student.parent_phone,
                'pending_months': student_pending,
                'total_due': sum(p['amount'] for p in student_pending),
            })

    return Response(pending_data)