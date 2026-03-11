# backend/payments/services/reminder_service.py
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from datetime import datetime
from collections import defaultdict

class ReminderService:
    """Service to handle payment reminders"""
    
    def __init__(self):
        self.results = {
            'total_pending': 0,
            'total_pending_months': 0,
            'by_month': {},
            'by_grade': {},
            'students': []
        }
    
    def get_pending_students(self, month=None, grade=None):
        """
        Get all students with pending payments
        If month specified, get pending for that month only
        If grade specified, filter by grade
        """
        # Get current academic year
        try:
            current_year = AcademicYear.objects.filter(is_current=True).first()
        except:
            current_year = None
            
        if not current_year:
            return {'error': 'No current academic year set', 'students': []}
        
        # Get all active deadlines for current year
        try:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=current_year.name,
                is_active=True
            )
        except:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=current_year.name
            )
        
        if month:
            deadlines = deadlines.filter(month=month)
        
        # Get all verified payments
        verified_payments = Payment.objects.filter(
            status='verified'
        ).values_list('student_id', 'deadline_id')
        
        # Create a set of (student_id, deadline_id) that are paid
        paid_set = set()
        for student_id, deadline_id in verified_payments:
            paid_set.add((student_id, deadline_id))
        
        # Get all active students
        students = Student.objects.filter(status='active')
        if grade:
            students = students.filter(grade=grade)
        
        # Find pending payments
        pending_by_month = defaultdict(list)
        pending_by_grade = defaultdict(list)
        pending_students = []
        
        for student in students:
            student_pending = []
            
            for deadline in deadlines:
                # Check if this student paid this deadline
                if (student.id, deadline.id) not in paid_set:
                    # This is a pending payment
                    pending_info = {
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'grade': student.grade,
                        'section': student.section,
                        'parent_phone': student.parent_phone,
                        'parent_name': student.parent_full_name,
                        'month': deadline.month,
                        'month_name': self.get_month_name(deadline.month),
                        'academic_year': deadline.academic_year,
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date.strftime('%Y-%m-%d') if deadline.due_date else '',
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
                    'parent_name': student.parent_full_name,
                    'pending_months': student_pending,
                    'total_due': sum(p['amount'] for p in student_pending)
                })
        
        # Format results
        by_month_formatted = {}
        for month_num, items in pending_by_month.items():
            month_name = self.get_month_name(month_num)
            by_month_formatted[month_num] = {
                'month_name': month_name,
                'count': len(items),
                'total_amount': sum(p['amount'] for p in items),
                'students': items
            }
        
        by_grade_formatted = {}
        for grade_num, items in pending_by_grade.items():
            by_grade_formatted[grade_num] = {
                'count': len(items),
                'total_amount': sum(p['amount'] for p in items),
                'students': items
            }
        
        self.results = {
            'total_pending': len(pending_students),
            'total_pending_months': sum(len(p['pending_months']) for p in pending_students),
            'by_month': by_month_formatted,
            'by_grade': by_grade_formatted,
            'students': pending_students
        }
        
        return self.results
    
    def get_month_name(self, month_num):
        """Convert month number to name"""
        months = [
            'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
            'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
        ]
        try:
            return months[month_num - 1]
        except:
            return f"Month {month_num}"
    
    def send_reminders(self, student_ids, month=None, message=None):
        """Send SMS reminders to selected students"""
        # For now, just return success (SMS will be implemented later)
        results = []
        
        for student_id in student_ids:
            try:
                student = Student.objects.get(student_id=student_id)
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