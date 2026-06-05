# backend/payments/services/reminder_service.py - UPDATED with Grade-Specific Deadline Filtering
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from datetime import date
from collections import defaultdict
from django.db import models  # ✅ ADDED for Q objects

class ReminderService:
    """Service to handle payment reminders with multi-school support"""
    
    def __init__(self):
        self.results = {
            'total_pending': 0,
            'total_pending_months': 0,
            'by_month': {},
            'by_grade': {},
            'students': []
        }
    
    def get_pending_students(self, month=None, grade=None, academic_year=None, school_id=None, student_search=None):
        """
        Get students with UNPAID payments for a specific month (not just overdue)
        
        Args:
            month: Month number (1-13) or None/'all' for all months
            grade: Grade number (1-8) or None for all grades
            academic_year: Year name (e.g., '2017') - optional
            school_id: School ID for filtering
            student_search: Optional student ID or name search term
        """
        print(f"📱 ReminderService.get_pending_students - month: {month}, grade: {grade}, school_id: {school_id}, search: {student_search}")
        
        # ✅ Get the CURRENT academic year for this school
        if school_id:
            try:
                current_year = AcademicYear.objects.filter(
                    school_id=int(school_id),
                    is_current=True
                ).first()
                print(f"📱 Filtered academic year by school ID: {school_id}")
            except ValueError:
                current_year = AcademicYear.objects.filter(is_current=True).first()
        else:
            current_year = AcademicYear.objects.filter(is_current=True).first()
        
        if not current_year:
            print("❌ No current academic year set!")
            return {'error': 'No current academic year set', 'students': []}
        
        print(f"📱 CURRENT ACADEMIC YEAR: {current_year.name}")
        year_name = academic_year if academic_year else current_year.name
        
        # ✅ Get all active deadlines for the academic year (base query)
        deadlines_base = PaymentDeadline.objects.filter(
            academic_year=year_name,
            is_active=True
        )
        
        # ✅ Filter deadlines by school
        if school_id:
            try:
                deadlines_base = deadlines_base.filter(school_id=int(school_id))
                print(f"📱 Deadlines filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        # ✅ Filter by specific month if provided (and not 'all')
        if month and month != 'all' and month != 'None':
            try:
                month_int = int(month)
                deadlines_base = deadlines_base.filter(month=month_int)
                print(f"📱 Filtered to month: {month_int}")
            except (ValueError, TypeError):
                pass
        
        # ✅ Get today's date
        today = date.today()
        print(f"📅 Today's date: {today}")
        
        # ✅ Get all verified payments
        verified_payments = Payment.objects.filter(
            status='verified',
            student__academic_year=year_name
        ).values_list('student_id', 'deadline_id')
        
        # ✅ Filter verified payments by school if needed
        if school_id:
            try:
                verified_payments = verified_payments.filter(student__school_id=int(school_id))
                print(f"📱 Verified payments filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        paid_set = set()
        for student_id, deadline_id in verified_payments:
            paid_set.add((student_id, deadline_id))
        
        # ✅ Get all active students for the academic year
        students = Student.objects.filter(
            status='active',
            academic_year=year_name
        )
        
        # ✅ Filter students by school
        if school_id:
            try:
                students = students.filter(school_id=int(school_id))
                print(f"📱 Students filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        # ✅ Filter by grade if provided
        if grade and grade != 'all' and grade != 'None':
            try:
                students = students.filter(grade=int(grade))
                print(f"📱 Filtered to grade: {grade}")
            except (ValueError, TypeError):
                pass
        
        # ✅ Filter by student ID or name search if provided
        if student_search and student_search != '':
            students = students.filter(
                models.Q(student_id__icontains=student_search) |
                models.Q(first_name__icontains=student_search) |
                models.Q(last_name__icontains=student_search)
            )
            print(f"📱 Filtered by search: {student_search}")
        
        print(f"📱 Found {students.count()} active students for {year_name}")
        
        # Find UNPAID payments (not just overdue)
        pending_by_month = defaultdict(list)
        pending_by_grade = defaultdict(list)
        pending_students = []
        
        for student in students:
            student_pending = []
            
            # ✅ CRITICAL FIX: Filter deadlines by student's grade
            # Get deadlines that apply to this student's grade:
            # - deadlines with grade = NULL (applies to all grades)
            # - deadlines with grade = student.grade
            student_deadlines = deadlines_base.filter(
                models.Q(grade__isnull=True) | models.Q(grade=student.grade)
            )
            
            print(f"📱 Student {student.student_id} (Grade {student.grade}) has {student_deadlines.count()} applicable deadlines")
            
            for deadline in student_deadlines:
                # ✅ Check if student hasn't paid this deadline (regardless of due date)
                is_unpaid = (student.id, deadline.id) not in paid_set
                
                # ✅ Include if UNPAID (no overdue check)
                if is_unpaid:
                    # Calculate days overdue if due date is past
                    days_overdue = None
                    if deadline.due_date and deadline.due_date < today:
                        days_overdue = (today - deadline.due_date).days
                    
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
                        'academic_year': deadline.academic_year,
                        'amount': float(deadline.amount),
                        'due_date': deadline.due_date.strftime('%Y-%m-%d') if deadline.due_date else None,
                        'days_overdue': days_overdue,
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
                    'academic_year': student.academic_year
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
        
        self.results = {
            'total_pending': len(pending_students),
            'total_pending_months': sum(len(p['pending_months']) for p in pending_students),
            'by_month': by_month_formatted,
            'by_grade': by_grade_formatted,
            'students': pending_students,
            'academic_year': year_name
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
        except:
            return f"ወር {month_num}"
    
    def send_reminders(self, student_ids, month=None, message=None, academic_year=None, school_id=None):
        """
        Send SMS reminders to selected students
        
        ✅ NEW: Added school_id parameter for multi-school filtering
        """
        print(f"📱 ReminderService.send_reminders - school_id: {school_id}")
        
        # ✅ Get current academic year for this school
        if school_id:
            try:
                current_year = AcademicYear.objects.filter(
                    school_id=int(school_id),
                    is_current=True
                ).first()
                print(f"📱 Academic year filtered by school ID: {school_id}")
            except ValueError:
                current_year = AcademicYear.objects.filter(is_current=True).first()
        else:
            current_year = AcademicYear.objects.filter(is_current=True).first()
        
        year_name = academic_year if academic_year else (current_year.name if current_year else None)
        
        results = []
        
        for student_id in student_ids:
            try:
                student = Student.objects.get(student_id=student_id)
                
                # ✅ Verify student belongs to this school
                if school_id:
                    try:
                        if str(student.school_id) != str(school_id):
                            results.append({
                                'student_id': student.student_id,
                                'student_name': f"{student.first_name} {student.last_name}",
                                'phone': student.parent_phone,
                                'success': False,
                                'message': f"Student does not belong to this school"
                            })
                            continue
                    except:
                        pass
                
                if student.academic_year != year_name:
                    results.append({
                        'student_id': student.student_id,
                        'student_name': f"{student.first_name} {student.last_name}",
                        'phone': student.parent_phone,
                        'success': False,
                        'message': f"Student is not in academic year ({year_name})"
                    })
                    continue
                
                # TODO: Integrate actual SMS gateway here (e.g., Africa's Talking, Twilio, etc.)
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