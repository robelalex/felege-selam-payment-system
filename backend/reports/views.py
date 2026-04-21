# backend/reports/views.py - COMPLETE with all dashboard endpoints
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
    
    # Get academic year for this school
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass
    
    if not academic_year:
        academic_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
    
    year_name = academic_year.name if academic_year else None
    print(f"📊 Academic year: {year_name}")
    
    # Get students for this school
    students = Student.objects.filter(school_id=school_id)
    total_students = students.count()
    active_students = students.filter(status='active').count()
    
    # Get payments for this school
    payments = Payment.objects.filter(student__school_id=school_id, status='verified')
    
    if year_name:
        payments = payments.filter(deadline__academic_year=year_name)
    
    total_collected = payments.aggregate(total=Sum('amount'))['total'] or 0
    
    # Get pending verifications
    pending_verifications = Payment.objects.filter(
        student__school_id=school_id,
        status='pending'
    ).count()
    
    # Get pending payments (overdue)
    today = date.today()
    
    # Get active deadlines for this school and academic year
    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        is_active=True
    )
    
    if year_name:
        deadlines = deadlines.filter(academic_year=year_name)
    
    # Get verified payments set
    verified_payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    ).values_list('student_id', 'deadline_id')
    
    paid_set = set()
    for student_id, deadline_id in verified_payments:
        paid_set.add((student_id, deadline_id))
    
    # Count students with pending payments
    pending_students_count = 0
    for deadline in deadlines:
        if deadline.due_date and deadline.due_date < today:
            for student in students.filter(status='active'):
                if (student.id, deadline.id) not in paid_set:
                    pending_students_count += 1
                    break
    
    return Response({
        'success': True,
        'total_students': total_students,
        'active_students': active_students,
        'total_collected': float(total_collected),
        'pending_verifications': pending_verifications,
        'pending_payments': pending_students_count,
        'academic_year': year_name
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
    
    # Get academic year for this school
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass
    
    if not academic_year:
        academic_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
    
    year_name = academic_year.name if academic_year else None
    
    # Get students for this school
    students = Student.objects.filter(school_id=school_id, status='active')
    
    if year_name:
        students = students.filter(academic_year=year_name)
    
    # Get payments for this school
    payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified'
    )
    
    if year_name:
        payments = payments.filter(deadline__academic_year=year_name)
    
    # Calculate by grade
    grade_stats = []
    for grade in range(1, 9):
        grade_students = students.filter(grade=grade)
        grade_count = grade_students.count()
        
        # Get paid students for this grade
        paid_students = payments.filter(student__grade=grade).values('student').distinct().count()
        
        grade_stats.append({
            'grade': grade,
            'total_students': grade_count,
            'paid_students': paid_students,
            'pending_students': grade_count - paid_students,
            'collection_rate': round((paid_students / grade_count * 100) if grade_count > 0 else 0, 1)
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
    
    # Get academic year for this school
    academic_year = None
    if year_id:
        try:
            academic_year = AcademicYear.objects.get(id=int(year_id), school_id=school_id)
        except (ValueError, AcademicYear.DoesNotExist):
            pass
    
    if not academic_year:
        academic_year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
    
    if not academic_year:
        return Response([], status=200)
    
    year_name = academic_year.name
    today = date.today()
    
    # Get students for this school
    students = Student.objects.filter(
        school_id=school_id,
        status='active',
        academic_year=year_name
    )
    
    # Get deadlines for this school
    deadlines = PaymentDeadline.objects.filter(
        school_id=school_id,
        academic_year=year_name,
        is_active=True
    )
    
    # Get verified payments
    verified_payments = Payment.objects.filter(
        student__school_id=school_id,
        status='verified',
        deadline__academic_year=year_name
    ).values_list('student_id', 'deadline_id')
    
    paid_set = set()
    for student_id, deadline_id in verified_payments:
        paid_set.add((student_id, deadline_id))
    
    # Build pending list
    pending_data = []
    months = [
        'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
        'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
    ]
    
    for student in students:
        student_pending = []
        for deadline in deadlines:
            # Check if deadline is overdue and unpaid
            is_overdue = deadline.due_date and deadline.due_date < today
            is_unpaid = (student.id, deadline.id) not in paid_set
            
            if is_overdue and is_unpaid:
                student_pending.append({
                    'month': deadline.month,
                    'month_name': months[deadline.month - 1] if deadline.month <= len(months) else f"Month {deadline.month}",
                    'amount': float(deadline.amount),
                    'due_date': deadline.due_date.strftime('%Y-%m-%d') if deadline.due_date else None
                })
        
        if student_pending:
            pending_data.append({
                'student_id': student.student_id,
                'student_name': f"{student.first_name} {student.last_name}",
                'grade': student.grade,
                'section': student.section,
                'parent_phone': student.parent_phone,
                'pending_months': student_pending,
                'total_due': sum(p['amount'] for p in student_pending)
            })
    
    return Response(pending_data)