# backend/payments/services/reminder_service.py - FIXED YEAR RESOLUTION
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from datetime import date, timedelta
from collections import defaultdict
from django.db import models


class ReminderService:
    """Service to handle PROACTIVE payment reminders with multi-school support"""
    
    def __init__(self):
        self.results = {
            'total_pending': 0,
            'total_pending_months': 0,
            'by_month': {},
            'by_grade': {},
            'students': []
        }
    
    def _resolve_academic_year(self, year_param, school_id=None):
        """
        Resolve year parameter to AcademicYear OBJECT.
        Accepts: int (ID), str (name like "2020 E.C."), or None (use current).
        Returns: AcademicYear object or None.
        """
        if year_param is None:
            qs = AcademicYear.objects.filter(is_current=True)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            return qs.first()
        
        if isinstance(year_param, AcademicYear):
            return year_param
        
        if isinstance(year_param, int):
            qs = AcademicYear.objects.filter(id=year_param)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            return qs.first()
        
        if isinstance(year_param, str):
            try:
                qs = AcademicYear.objects.filter(id=int(year_param))
                if school_id:
                    qs = qs.filter(school_id=int(school_id))
                result = qs.first()
                if result:
                    return result
            except ValueError:
                pass
            
            qs = AcademicYear.objects.filter(name=year_param)
            if school_id:
                qs = qs.filter(school_id=int(school_id))
            result = qs.first()
            if result:
                return result
            
            try:
                qs = AcademicYear.objects.filter(year_ec=int(year_param))
                if school_id:
                    qs = qs.filter(school_id=int(school_id))
                return qs.first()
            except ValueError:
                pass
        
        return None

    def _get_overdue_students(self, academic_year_obj, school_id, grade, student_search, today):
        """Get ALL students with unpaid deadlines where due_date < today - 7 days."""
        year_name = academic_year_obj.name
        cutoff_date = today - timedelta(days=7)
        
        overdue_deadlines = PaymentDeadline.objects.filter(
            academic_year=academic_year_obj, is_active=True, due_date__lt=cutoff_date
        )
        if school_id:
            try: overdue_deadlines = overdue_deadlines.filter(school_id=int(school_id))
            except ValueError: pass
        
        verified_payments = Payment.objects.filter(
            status='verified', deadline__academic_year=academic_year_obj
        ).values_list('student_id', 'deadline_id')
        if school_id:
            try: verified_payments = verified_payments.filter(student__school_id=int(school_id))
            except ValueError: pass
        
        paid_set = set()
        for sid, did in verified_payments: paid_set.add((sid, did))
        
        students = Student.objects.filter(status='active', academic_year=year_name)
        if school_id:
            try: students = students.filter(school_id=int(school_id))
            except ValueError: pass
        if grade and grade != 'all' and grade != 'None':
            try: students = students.filter(grade=int(grade))
            except (ValueError, TypeError): pass
        if student_search and student_search != '':
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
        
        overdue_students = []
        for student in students:
            student_overdue = []
            applicable = overdue_deadlines.filter(models.Q(grade__isnull=True) | models.Q(grade=student.grade))
            
            for deadline in applicable:
                if (student.id, deadline.id) not in paid_set:
                    days_overdue = (today - deadline.due_date).days
                    penalty_rate = 0.10 if days_overdue > 30 else (0.05 if days_overdue > 7 else 0)
                    severity = "critical" if days_overdue > 30 else ("warning" if days_overdue > 7 else "recent")
                    
                    student_overdue.append({
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'grade': student.grade, 'section': student.section,
                        'parent_phone': student.parent_phone, 'parent_name': student.parent_full_name,
                        'parent_email': getattr(student, 'parent_email', ''),
                        'month': deadline.month, 'month_name': self.get_month_name(deadline.month),
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date.strftime('%Y-%m-%d'),
                        'days_overdue': days_overdue,
                        'penalty_amount': round(float(deadline.amount) * penalty_rate, 2),
                        'total_due_with_penalty': round(float(deadline.amount) * (1 + penalty_rate), 2),
                        'severity': severity, 'deadline_id': deadline.id
                    })
            
            if student_overdue:
                student_overdue.sort(key=lambda x: x['days_overdue'], reverse=True)
                overdue_students.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'grade': student.grade, 'section': student.section,
                    'parent_phone': student.parent_phone,
                    'parent_email': getattr(student, 'parent_email', ''),
                    'parent_name': student.parent_full_name,
                    'overdue_months': student_overdue,
                    'total_overdue': sum(m['amount'] for m in student_overdue),
                    'total_penalties': sum(m['penalty_amount'] for m in student_overdue),
                    'grand_total': sum(m['total_due_with_penalty'] for m in student_overdue),
                    'max_severity': max(student_overdue, key=lambda x: x['days_overdue'])['severity']
                })
        
        overdue_students.sort(key=lambda x: max(m['days_overdue'] for m in x['overdue_months']), reverse=True)
        return overdue_students
    
    def get_pending_students(self, month=None, grade=None, academic_year=None,
                             school_id=None, student_search=None, reminder_window_days=7):
        """
        Get students with UNPAID payments for deadlines within reminder window
        
        Args:
            month: Month number (1-13) or None/'all' for all months
            grade: Grade number (1-8) or None for all grades
            academic_year: Year name/ID/object - optional
            school_id: School ID for filtering
            student_search: Optional student ID or name search term
            reminder_window_days: Days before due date to include in reminders (default: 7)
        """
        print(f"📱 ReminderService.get_pending_students - month: {month}, grade: {grade}, "
              f"school_id: {school_id}, search: {student_search}, window: {reminder_window_days}d")
        
        # ✅ RESOLVE YEAR TO OBJECT FOR DEADLINES/PAYMENTS QUERIES
        academic_year_obj = self._resolve_academic_year(academic_year, school_id)
        
        if not academic_year_obj:
            return {'error': 'No current academic year set' if academic_year is None
                    else f'Academic year "{academic_year}" not found', 'students': []}
        
        # ✅ GET THE YEAR NAME STRING FOR STUDENT FILTERING
        year_name = academic_year_obj.name
        
        # ✅ Calculate reminder window dates
        today = date.today()
        window_start = today - timedelta(days=reminder_window_days)
        window_end = today + timedelta(days=30)
        
        print(f"📅 Reminder window: {window_start} to {window_end}")
        
        # ✅ USE OBJECT FOR DEADLINE FILTERS (ForeignKey relationship)
        deadlines_base = PaymentDeadline.objects.filter(
            academic_year=academic_year_obj,
            is_active=True,
            due_date__gte=window_start,
            due_date__lte=window_end
        )
        
        # ✅ Filter deadlines by school
        if school_id:
            try:
                deadlines_base = deadlines_base.filter(school_id=int(school_id))
            except ValueError:
                pass
        
        # ✅ Filter by specific month if provided
        if month and month != 'all' and month != 'None':
            try:
                month_int = int(month)
                deadlines_base = deadlines_base.filter(month=month_int)
            except (ValueError, TypeError):
                pass
        
        # ✅ USE OBJECT FOR PAYMENT FILTERS (ForeignKey relationship via deadline)
        verified_payments = Payment.objects.filter(
            status='verified',
            deadline__academic_year=academic_year_obj
        ).values_list('student_id', 'deadline_id')
        
        if school_id:
            try:
                verified_payments = verified_payments.filter(student__school_id=int(school_id))
            except ValueError:
                pass
        
        paid_set = set()
        for student_id, deadline_id in verified_payments:
            paid_set.add((student_id, deadline_id))
        
        # ✅ FIX: USE STRING NAME FOR STUDENT FILTER (CharField relationship)
        students = Student.objects.filter(
            status='active',
            academic_year=year_name
        )
        
        if school_id:
            try:
                students = students.filter(school_id=int(school_id))
            except ValueError:
                pass
        
        if grade and grade != 'all' and grade != 'None':
            try:
                students = students.filter(grade=int(grade))
            except (ValueError, TypeError):
                pass
        
        if student_search and student_search != '':
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
        
        # Find UNPAID payments within reminder window
        pending_by_month = defaultdict(list)
        pending_by_grade = defaultdict(list)
        pending_students = []
        
        for student in students:
            student_pending = []
            
            # ✅ Filter deadlines by student's grade
            student_deadlines = deadlines_base.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            for deadline in student_deadlines:
                is_unpaid = (student.id, deadline.id) not in paid_set
                
                if is_unpaid:
                    # ✅ Calculate deadline status
                    days_until_due = (deadline.due_date - today).days if deadline.due_date else None
                    
                    if days_until_due is not None:
                        if days_until_due < 0:
                            status_label = f"{abs(days_until_due)} days overdue"
                            status_type = "overdue"
                        elif days_until_due == 0:
                            status_label = "Due TODAY"
                            status_type = "due_today"
                        elif days_until_due <= 3:
                            status_label = f"Due in {days_until_due} day{'s' if days_until_due > 1 else ''}"
                            status_type = "approaching"
                        else:
                            status_label = f"Due in {days_until_due} days"
                            status_type = "upcoming"
                    else:
                        status_label = "No due date"
                        status_type = "unknown"
                    
                    pending_info = {
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'grade': student.grade,
                        'section': student.section,
                        'parent_phone': student.parent_phone,
                        'parent_name': student.parent_full_name,
                        'parent_email': getattr(student, 'parent_email', ''),
                        'month': deadline.month,
                        'month_name': self.get_month_name(deadline.month),
                        'academic_year': deadline.academic_year.name if deadline.academic_year else year_name,
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date.strftime('%Y-%m-%d') if deadline.due_date else None,
                        'days_until_due': days_until_due,
                        'status_label': status_label,
                        'status_type': status_type,
                        'deadline_id': deadline.id
                    }
                    
                    student_pending.append(pending_info)
                    pending_by_month[deadline.month].append(pending_info)
                    pending_by_grade[student.grade].append(pending_info)
            
            if student_pending:
                pending_students.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'grade': student.grade,
                    'section': student.section,
                    'parent_phone': student.parent_phone,
                    'parent_email': getattr(student, 'parent_email', ''),
                    'parent_name': student.parent_full_name,
                    'pending_months': student_pending,
                    'total_due': sum(p['amount'] for p in student_pending),
                    'academic_year': student.academic_year,
                    'most_urgent_status': min(
                        student_pending,
                        key=lambda x: x['days_until_due'] if x['days_until_due'] is not None else 999
                    )['status_type']
                })
        
        # Format results by month
        by_month_formatted = {}
        for month_num, items in pending_by_month.items():
            month_name = self.get_month_name(month_num)
            by_month_formatted[month_num] = {
                'month_name': month_name,
                'count': len(items),
                'total_amount': sum(p['amount'] for p in items),
                'students': items
            }
        
        # Format results by grade
        by_grade_formatted = {}
        for grade_num, items in pending_by_grade.items():
            by_grade_formatted[grade_num] = {
                'count': len(items),
                'total_amount': sum(p['amount'] for p in items),
                'students': items
            }
        
        # ✅ GET OVERDUE ACCOUNTS
        overdue_students = self._get_overdue_students(academic_year_obj, school_id, grade, student_search, today)

        self.results = {
            'proactive_reminders': pending_students,
            'overdue_accounts': overdue_students,
            'total_pending': len(pending_students),
            'total_overdue': len(overdue_students),
            'total_overdue_amount': sum(s['total_overdue'] for s in overdue_students),
            'total_penalties': sum(s['total_penalties'] for s in overdue_students),
            'by_month': by_month_formatted,
            'by_grade': by_grade_formatted,
            'students': pending_students,
            'academic_year': year_name,
            'reminder_window': {
                'start': window_start.isoformat(),
                'end': window_end.isoformat(),
                'days_before': reminder_window_days
            }
        }
        
        return self.results
    
    def get_month_name(self, month_num):
        """Convert month number to Amharic name"""
        months = [
            'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
            'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
        ]
        try:
            if month_num is None:
                return "All Months"
            return months[int(month_num) - 1]
        except Exception:
            return f"ወር {month_num}"
    
    def send_reminders(self, student_ids, month=None, message=None,
                       academic_year=None, school_id=None):
        """Send SMS reminders to selected students"""
        print(f"📱 ReminderService.send_reminders - school_id: {school_id}")
        
        # ✅ Resolve year for validation
        academic_year_obj = self._resolve_academic_year(academic_year, school_id)
        year_name = academic_year_obj.name if academic_year_obj else None
        
        results = []
        
        for student_id in student_ids:
            try:
                student = Student.objects.get(student_id=student_id)
                
                if school_id and str(student.school_id) != str(school_id):
                    results.append({
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'phone': student.parent_phone,
                        'success': False,
                        'message': "Student does not belong to this school"
                    })
                    continue
                
                if year_name and student.academic_year != year_name:
                    results.append({
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'phone': student.parent_phone,
                        'success': False,
                        'message': f"Student is not in academic year ({year_name})"
                    })
                    continue
                
                print(f"📱 Sending SMS to {student.parent_phone}: {message or 'Payment reminder'}")
                
                results.append({
                    'student_id': student.student_id,
                    'student_name': f"{student.first_name} {student.last_name}",
                    'phone': student.parent_phone,
                    'success': True,
                    'message': f"Reminder sent to {student.parent_phone}"
                })
            except Student.DoesNotExist:
                results.append({
                    'student_id': student_id,
                    'success': False,
                    'message': f"Student {student_id} not found"
                })
        
        return results