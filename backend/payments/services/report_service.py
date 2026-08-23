# backend/payments/services/report_service.py - FIXED year resolution
from students.models import Student
from payments.models import Payment, PaymentDeadline, StudentFeeOverride
from academics.models import AcademicYear
from collections import defaultdict
from datetime import datetime
import calendar
from django.db import models
from payments.services.fee_override_service import get_effective_deadline_amount


class ReportService:
    """Service to generate financial reports with multi-school support"""
    
    def __init__(self):
        self.results = {}
    
    def _resolve_academic_year(self, year, school_id=None):
        """
        ✅ NEW: Resolve year parameter to AcademicYear object.
        Accepts: int (ID), str (name like "2020 E.C."), or AcademicYear object.
        Returns: AcademicYear object or None.
        """
        if year is None:
            # No year provided → find current
            qs = AcademicYear.objects.filter(is_current=True)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            return qs.first()
        
        if isinstance(year, AcademicYear):
            return year
        
        if isinstance(year, int):
            qs = AcademicYear.objects.filter(id=year)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            return qs.first()
        
        if isinstance(year, str):
            # Try as integer ID first
            try:
                qs = AcademicYear.objects.filter(id=int(year))
                if school_id:
                    qs = qs.filter(school_id=int(school_id))
                result = qs.first()
                if result:
                    return result
            except ValueError:
                pass
            
            # Try as name (e.g., "2020 E.C.")
            qs = AcademicYear.objects.filter(name=year)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            result = qs.first()
            if result:
                return result
            
            # Try as year_ec
            try:
                qs = AcademicYear.objects.filter(year_ec=int(year))
                if school_id:
                    qs = qs.filter(school_id=int(school_id))
                return qs.first()
            except ValueError:
                pass
        
        return None
    
    def get_monthly_report(self, year=None, month=None, school_id=None):
        """
        Generate monthly collection report for a specific school
        ✅ Added school_id parameter for multi-school filtering
        """
        print(f"📊 get_monthly_report - school_id: {school_id}")
        
        # ✅ FIX: Resolve year to AcademicYear object BEFORE using in queries
        academic_year_obj = self._resolve_academic_year(year, school_id)
        
        if not academic_year_obj:
            return {'error': 'No current academic year set' if year is None else f'Academic year "{year}" not found'}
        
        # Use the resolved object's name for display, object for queries
        year_display = academic_year_obj.name
        
        # ✅ Get all students for this school
        students = Student.objects.filter(status='active')
        if school_id:
            try:
                students = students.filter(school_id=int(school_id))
                print(f"📊 Students filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        # ✅ FIX: Use AcademicYear OBJECT instead of string
        # ✅ FIX: Registration is a one-time charge with its own dedicated
        # report (get_registration_report) — before this filter, a
        # verified registration payment (deadline.month=None) was counted
        # into this "monthly" report's totals/by_grade/monthly_breakdown,
        # silently inflating collection numbers with money that was never
        # a monthly tuition payment.
        payments = Payment.objects.filter(
            deadline__academic_year=academic_year_obj,
            deadline__deadline_type='monthly',
            status='verified'
        )
        if school_id:
            try:
                payments = payments.filter(student__school_id=int(school_id))
                print(f"📊 Payments filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        if month:
            payments = payments.filter(deadline__month=month)
            # ✅ FIX: Use AcademicYear OBJECT
            deadlines = PaymentDeadline.objects.filter(
                academic_year=academic_year_obj,
                deadline_type='monthly',
                month=month,
                is_active=True
            )
        else:
            # ✅ FIX: Use AcademicYear OBJECT
            deadlines = PaymentDeadline.objects.filter(
                academic_year=academic_year_obj,
                deadline_type='monthly',
                is_active=True
            )
        
        # ✅ Filter deadlines by school
        if school_id:
            try:
                deadlines = deadlines.filter(school_id=int(school_id))
            except ValueError:
                pass
        
        # Calculate by grade
        by_grade = {}
        total_students = 0
        total_paid = 0
        total_collected = 0
        
        for grade in range(1, 13):
            grade_students = students.filter(grade=grade)
            grade_count = grade_students.count()
            total_students += grade_count
            
            # Count unique students who paid
            paid_students = set()
            grade_payments = payments.filter(student__grade=grade)
            for payment in grade_payments:
                paid_students.add(payment.student_id)
            
            grade_paid = len(paid_students)
            grade_collected = sum(p.amount for p in grade_payments)
            
            total_paid += grade_paid
            total_collected += grade_collected
            
            by_grade[grade] = {
                'total': grade_count,
                'paid': grade_paid,
                'pending': grade_count - grade_paid,
                'collected': float(grade_collected),
                'collection_rate': round((grade_paid / grade_count * 100) if grade_count > 0 else 0, 1)
            }
        
        # Monthly breakdown
        monthly_data = {}
        months = ['መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
                'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ']
        
        for month_num, month_name in enumerate(months, 1):
            month_payments = payments.filter(deadline__month=month_num)
            monthly_data[month_num] = {
                'month': month_name,
                'count': month_payments.count(),
                'total': float(sum(p.amount for p in month_payments))
            }

        # ✅ NEW: per-student detail — "who paid what", same shape as
        # get_registration_report's students list, so the admin can see
        # exactly who's covered and who isn't instead of only aggregates.
        # When `month` is given this is that month's students; otherwise
        # it's every verified monthly payment for the whole year (can be
        # a long list for a big school — matches the existing behavior of
        # get_registration_report, which also lists every student rather
        # than paginating).
        detailed_payments = payments.select_related('student', 'deadline').order_by(
            'student__grade', 'student__first_name', 'deadline__month'
        )
        students_detail = [
            {
                'student_id': p.student.student_id,
                'student_name': f"{p.student.formatted_name}",
                'grade': p.student.grade,
                'section': p.student.section,
                'month_name': p.deadline.get_month_display(),
                'amount': float(p.amount),
                'payment_method': p.payment_method,
                'payment_date': p.created_at.strftime('%Y-%m-%d') if p.created_at else None,
                'transaction_reference': p.transaction_reference,
            }
            for p in detailed_payments
        ]
        
        return {
            'year': year_display,
            'month': month,
            'summary': {
                'total_students': total_students,
                'total_paid': total_paid,
                'total_pending': total_students - total_paid,
                'total_collected': float(total_collected),
                'total_rejected': Payment.objects.filter(
                    deadline__academic_year=academic_year_obj, deadline__deadline_type='monthly', status='rejected',
                    **({'student__school_id': int(school_id)} if school_id else {})
                ).count(),
                'collection_rate': round((total_paid / total_students * 100) if total_students > 0 else 0, 1)
             },
            'by_grade': by_grade,
            'monthly_breakdown': monthly_data,
            'students': students_detail,
        }
    
    def get_student_report(self, student_id, school_id=None):
        """Generate report for a single student with school verification"""
        try:
            student = Student.objects.get(student_id=student_id)
            
            # ✅ Verify student belongs to this school
            if school_id and str(student.school_id) != str(school_id):
                return {'error': 'Access denied - Student does not belong to your school'}
                
        except Student.DoesNotExist:
            return {'error': 'Student not found'}
        
        # ✅ FIX: Resolve student's academic_year string to object
        student_year_obj = self._resolve_academic_year(student.academic_year, student.school_id)
        
        # ✅ FIX: Scope payments to the student's CURRENT academic year only.
        # Before, this pulled every payment ever made by this student across
        # ALL years (student=student, no year filter). That's invisible for a
        # normal promotion because the grade also changes, but for a REPEATER
        # (same grade, new year) the old year's payments/report would still
        # show up mixed in with the new year's — same bug class already fixed
        # on payment_history()/PaymentViewSet, just missed here.
        deadline_filter = {
            'school': student.school,
            'is_active': True
        }
        if student_year_obj:
            deadline_filter['academic_year'] = student_year_obj
        else:
            deadline_filter['academic_year__name'] = student.academic_year

        payments = Payment.objects.filter(student=student)
        if student_year_obj:
            payments = payments.filter(deadline__academic_year=student_year_obj)
        else:
            payments = payments.filter(deadline__academic_year__name=student.academic_year)
        # ✅ FIX: Registration is a separate one-time charge, not a month —
        # it has its own dedicated report now (get_registration_report).
        # Before this filter, a verified/pending registration payment (with
        # deadline.month=None) leaked into this "monthly" payment history
        # and pending list as a blank/garbled month row.
        payments = payments.filter(deadline__deadline_type='monthly')
        payments = payments.order_by('-created_at')
        
        # Get deadlines for this student's specific GRADE only
        # ✅ FIX: Use resolved AcademicYear object
        
        deadlines = PaymentDeadline.objects.filter(**deadline_filter).filter(
            deadline_type='monthly'
        ).filter(
            models.Q(grade=student.grade) | models.Q(grade__isnull=True)
        ).order_by('month')
        
        payment_history = []
        total_paid = 0
        
        for payment in payments:
            if payment.status == 'verified':
                total_paid += payment.amount
                payment_history.append({
                    'month': payment.deadline.get_month_display(),
                    'amount': float(payment.amount),
                    'date': payment.created_at.strftime('%Y-%m-%d'),
                    'method': payment.payment_method,
                    'reference': payment.transaction_reference
                })
        
        # Calculate pending
        # ✅ Fee exceptions (Jimma request #1): a student with an active
        # StudentFeeOverride for this academic year owes the override
        # amount, not deadline.amount — see fee_override_service.py for
        # the 'waiver' (one-time, first month only) vs 'partial' (every
        # month) rules. get_effective_deadline_amount() falls back to
        # deadline.amount untouched when there's no override, so this is
        # a no-op for every student without one.
        paid_months = set(p.deadline_id for p in payments if p.status == 'verified')
        pending = []
        for deadline in deadlines:
            if deadline.id not in paid_months:
                effective_amount = get_effective_deadline_amount(student, deadline)
                if effective_amount <= 0:
                    # 'waiver' students: every month except the one the
                    # one-time amount is charged against is already $0
                    # due — don't list it as pending.
                    continue
                pending.append({
                    'month': deadline.get_month_display(),
                    'amount': float(effective_amount),
                    'due_date': deadline.due_date.strftime('%Y-%m-%d')
                })
        
        from payments.services.fee_override_service import describe_override_for_student
        fee_override = describe_override_for_student(student, student_year_obj)

        return {
            'student': {
                'id': student.student_id,
                'name': f"{student.formatted_name}",
                'grade': student.grade,
                'section': student.section,
                'parent_phone': student.parent_phone,
                'monthly_fee': float(student.monthly_fee),
                'school_id': student.school_id,
                'fee_override': fee_override,
            },
            'summary': {
                'total_paid': float(total_paid),
                'pending_count': len(pending),
                'pending_amount': sum(p['amount'] for p in pending)
            },
            'payment_history': payment_history,
            'pending': pending
        }
    
    def get_registration_report(self, year=None, school_id=None):
        """
        ✅ NEW — Registration Fee Report (separate from monthly/annual
        tuition on purpose, see the Reports.js "Registration" tab
        docstring for why). Reports on the ONE-TIME per-academic-year
        registration deadline only: who's paid, who hasn't, broken down
        by New / Continuing / Transferred — never mixed with monthly
        collection figures.

        Deliberately does NOT reuse get_monthly_report's by_grade logic:
        registration isn't grade-specific (the deadline itself has
        grade=None, enforced in PaymentDeadline.clean()), so the
        meaningful breakdown here is by registration_type, not by grade.
        """
        from payments.models import RegistrationFeeConfig
        from payments.services.registration_fee_service import get_registration_type

        academic_year_obj = self._resolve_academic_year(year, school_id)
        if not academic_year_obj:
            return {'error': 'No current academic year set' if year is None else f'Academic year "{year}" not found'}

        try:
            deadline = PaymentDeadline.objects.get(
                school_id=school_id,
                academic_year=academic_year_obj,
                deadline_type='registration',
            )
        except PaymentDeadline.DoesNotExist:
            return {
                'academic_year': academic_year_obj.name,
                'configured': False,
                'message': 'No registration fee has been configured for this academic year yet.',
                'summary': {'total_students': 0, 'total_paid': 0, 'total_pending': 0, 'total_collected': 0.0},
                'by_type': {},
                'students': [],
            }

        config = RegistrationFeeConfig.objects.filter(
            school_id=school_id, academic_year=academic_year_obj
        ).first()

        students = Student.objects.filter(school_id=school_id, status='active')

        verified_payments = Payment.objects.filter(
            deadline=deadline, status='verified'
        ).select_related('student')
        payment_by_student = {p.student_id: p for p in verified_payments}

        by_type = {
            'new': {'label': 'New Student', 'total': 0, 'paid': 0, 'collected': 0.0, 'configured_amount': float(config.new_student_amount) if config else None},
            'continuing': {'label': 'Continuing/Senior', 'total': 0, 'paid': 0, 'collected': 0.0, 'configured_amount': float(config.continuing_student_amount) if config else None},
            'transferred': {'label': 'Transferred', 'total': 0, 'paid': 0, 'collected': 0.0, 'configured_amount': float(config.transferred_student_amount) if (config and config.transferred_student_amount is not None) else None},
        }

        detailed_students = []
        total_collected = 0.0
        paid_count = 0

        for student in students:
            reg_type_obj = get_registration_type(student, academic_year_obj)
            reg_type = reg_type_obj.registration_type if reg_type_obj else 'new'
            if reg_type not in by_type:
                # Defensive — shouldn't happen given the model's choices,
                # but a report should never crash on unexpected data.
                reg_type = 'new'

            by_type[reg_type]['total'] += 1

            payment = payment_by_student.get(student.id)
            if payment:
                by_type[reg_type]['paid'] += 1
                by_type[reg_type]['collected'] += float(payment.amount)
                total_collected += float(payment.amount)
                paid_count += 1
                detailed_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'registration_type': reg_type,
                    'is_manual_override': reg_type_obj.is_manual_override if reg_type_obj else False,
                    'status': 'paid',
                    'amount': float(payment.amount),
                    'payment_method': payment.payment_method,
                    'payment_date': payment.created_at.strftime('%Y-%m-%d') if payment.created_at else None,
                    'transaction_reference': payment.transaction_reference,
                })
            else:
                owed = get_effective_deadline_amount(student, deadline)
                detailed_students.append({
                    'student_id': student.student_id,
                    'student_name': student.full_name,
                    'grade': student.grade,
                    'section': student.section,
                    'registration_type': reg_type,
                    'is_manual_override': reg_type_obj.is_manual_override if reg_type_obj else False,
                    'status': 'pending',
                    'amount': float(owed),
                    'payment_method': None,
                    'payment_date': None,
                    'transaction_reference': None,
                })

        detailed_students.sort(key=lambda x: (x['grade'] or 0, x['student_name'] or ''))
        total_students = students.count()

        return {
            'academic_year': academic_year_obj.name,
            'configured': True,
            'due_date': deadline.due_date.strftime('%Y-%m-%d') if deadline.due_date else None,
            'summary': {
                'total_students': total_students,
                'total_paid': paid_count,
                'total_pending': total_students - paid_count,
                'total_collected': total_collected,
                'collection_rate': round((paid_count / total_students * 100) if total_students > 0 else 0, 1),
            },
            'by_type': by_type,
            'students': detailed_students,
        }

    def get_fee_exceptions_report(self, year=None, school_id=None):
        """
        ✅ NEW — Fee Exceptions (Waivers/Partial) Report. Separate from
        every collections report on purpose — this is an AUDIT view, not
        a money-collected view. The question it answers isn't "how much
        did we collect" but "who has an active exception, why, who
        approved it, and is the supporting document actually on file" —
        the kind of thing a director or auditor checks, not a finance
        officer doing daily collections.

        Lists every StudentFeeOverride active for the given academic
        year (waiver AND partial), regardless of payment status — an
        override with zero payments yet is still something the school
        needs visibility into (e.g. to confirm documentation is on file
        before the deadline for it passes).
        """
        academic_year_obj = self._resolve_academic_year(year, school_id)
        if not academic_year_obj:
            return {'error': 'No current academic year set' if year is None else f'Academic year "{year}" not found'}

        overrides = StudentFeeOverride.objects.filter(
            academic_year=academic_year_obj, is_active=True
        ).select_related('student', 'created_by')
        if school_id:
            try:
                overrides = overrides.filter(student__school_id=int(school_id))
            except ValueError:
                pass
        overrides = overrides.order_by('student__grade', 'student__first_name')

        waiver_count = 0
        partial_count = 0
        detailed = []
        for o in overrides:
            if o.override_type == 'waiver':
                waiver_count += 1
            else:
                partial_count += 1
            detailed.append({
                'student_id': o.student.student_id,
                'student_name': f"{o.student.formatted_name}",
                'grade': o.student.grade,
                'section': o.student.section,
                'override_type': o.override_type,
                'override_type_display': o.get_override_type_display(),
                'amount': float(o.amount),
                'reason': o.reason,
                'has_supporting_document': bool(o.supporting_document),
                'created_by': o.created_by.username if o.created_by else None,
                'created_at': o.created_at.strftime('%Y-%m-%d') if o.created_at else None,
            })

        return {
            'academic_year': academic_year_obj.name,
            'summary': {
                'total_exceptions': len(detailed),
                'waiver_count': waiver_count,
                'partial_count': partial_count,
                'missing_documents': sum(1 for d in detailed if not d['has_supporting_document']),
            },
            'exceptions': detailed,
        }

    def get_annual_summary(self, year=None, school_id=None):
        """Get annual summary report for a specific school"""
        print(f"📊 get_annual_summary - school_id: {school_id}")
        
        # ✅ FIX: Resolve year to object ONCE, then pass object to get_monthly_report
        academic_year_obj = self._resolve_academic_year(year, school_id)
        
        if not academic_year_obj:
            return {'error': 'No current academic year set' if year is None else f'Academic year "{year}" not found'}
        
        monthly_data = []
        total_year = 0
        
        for month in range(1, 14):
            # ✅ FIX: Pass AcademicYear OBJECT, not string
            report = self.get_monthly_report(academic_year_obj, month, school_id)
            if 'error' not in report:
                monthly_data.append({
                    'month': report['monthly_breakdown'][month]['month'],
                    'collected': report['monthly_breakdown'][month]['total'],
                    'paid_count': report['monthly_breakdown'][month]['count']
                })
                total_year += report['monthly_breakdown'][month]['total']

        # ✅ NEW: per-student yearly rollup — "who paid what across the
        # whole year", not just monthly totals summed. Excludes
        # registration for the same reason get_monthly_report does — it's
        # a one-time charge, not a recurring monthly one, and has its own
        # report (get_registration_report).
        year_payments = Payment.objects.filter(
            deadline__academic_year=academic_year_obj,
            deadline__deadline_type='monthly',
            status='verified'
        ).select_related('student')
        if school_id:
            try:
                year_payments = year_payments.filter(student__school_id=int(school_id))
            except ValueError:
                pass

        per_student = {}
        for p in year_payments:
            key = p.student_id
            if key not in per_student:
                per_student[key] = {
                    'student_id': p.student.student_id,
                    'student_name': f"{p.student.formatted_name}",
                    'grade': p.student.grade,
                    'section': p.student.section,
                    'months_paid': 0,
                    'total_collected': 0.0,
                    'last_payment_date': None,
                }
            per_student[key]['months_paid'] += 1
            per_student[key]['total_collected'] += float(p.amount)
            payment_date = p.created_at.strftime('%Y-%m-%d') if p.created_at else None
            if payment_date and (per_student[key]['last_payment_date'] is None or payment_date > per_student[key]['last_payment_date']):
                per_student[key]['last_payment_date'] = payment_date

        students_yearly = sorted(per_student.values(), key=lambda x: (x['grade'] or 0, x['student_name'] or ''))
        
        return {
            'year': academic_year_obj.name,
            'total_collected': float(total_year),
            'monthly_data': monthly_data,
            'students': students_yearly,
        }
    
    def get_school_summary(self, school_id):
        """Get complete summary for a school"""
        print(f"📊 get_school_summary - school_id: {school_id}")
        
        # Get current academic year
        current_year = AcademicYear.objects.filter(
            school_id=int(school_id),
            is_current=True
        ).first()
        
        if not current_year:
            return {'error': 'No current academic year set for this school'}
        
        # ✅ FIX: Pass AcademicYear OBJECT to both methods
        monthly = self.get_monthly_report(
            year=current_year,
            school_id=school_id
        )
        
        annual = self.get_annual_summary(
            year=current_year,
            school_id=school_id
        )
        
        return {
            'school_id': school_id,
            'academic_year': current_year.name,
            'current_month': monthly,
            'year_to_date': annual
        }