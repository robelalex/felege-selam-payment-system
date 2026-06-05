# backend/payments/services/report_service.py - UPDATED with School Filtering
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from collections import defaultdict
from datetime import datetime
import calendar
from django.db import models

class ReportService:
    """Service to generate financial reports with multi-school support"""
    
    def __init__(self):
        self.results = {}
    
    def get_monthly_report(self, year=None, month=None, school_id=None):
        """
        Generate monthly collection report for a specific school
        ✅ Added school_id parameter for multi-school filtering
        """
        print(f"📊 get_monthly_report - school_id: {school_id}")
        
        # Get academic year
        if not year:
            if school_id:
                current = AcademicYear.objects.filter(
                    school_id=int(school_id),
                    is_current=True
                ).first()
            else:
                current = AcademicYear.objects.filter(is_current=True).first()
            
            if not current:
                return {'error': 'No current academic year set'}
            year = current.name
        
        # ✅ Get all students for this school
        students = Student.objects.filter(status='active')
        if school_id:
            try:
                students = students.filter(school_id=int(school_id))
                print(f"📊 Students filtered by school ID: {school_id}")
            except ValueError:
                pass
        
        # ✅ Get all payments for this school
        payments = Payment.objects.filter(
            deadline__academic_year=year,
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
            deadlines = PaymentDeadline.objects.filter(
                academic_year=year,
                month=month,
                is_active=True
            )
        else:
            deadlines = PaymentDeadline.objects.filter(
                academic_year=year,
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
        
        for grade in range(1, 9):
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
        # months = [
        #     'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
        #     'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
        # ]
        months = ['መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
                'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ']
        
        for month_num, month_name in enumerate(months, 1):
            month_payments = payments.filter(deadline__month=month_num)
            monthly_data[month_num] = {
                'month': month_name,
                'count': month_payments.count(),
                'total': float(sum(p.amount for p in month_payments))
            }
        
        return {
            'year': year,
            'month': month,
            'summary': {
                'total_students': total_students,
                'total_paid': total_paid,
                'total_pending': total_students - total_paid,
                'total_collected': float(total_collected),
                'collection_rate': round((total_paid / total_students * 100) if total_students > 0 else 0, 1)
            },
            'by_grade': by_grade,
            'monthly_breakdown': monthly_data
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
        
        # Get all payments for this student
        payments = Payment.objects.filter(
            student=student
        ).order_by('-created_at')
        
        # Get deadlines for this student's specific GRADE only
        deadlines = PaymentDeadline.objects.filter(
        school=student.school,
        academic_year=student.academic_year,
        is_active=True
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
        paid_months = set(p.deadline_id for p in payments if p.status == 'verified')
        pending = []
        for deadline in deadlines:
            if deadline.id not in paid_months:
                pending.append({
                    'month': deadline.get_month_display(),
                    'amount': float(deadline.amount),
                    'due_date': deadline.due_date.strftime('%Y-%m-%d')
                })
        
        return {
            'student': {
                'id': student.student_id,
                'name': f"{student.first_name} {student.last_name}",
                'grade': student.grade,
                'section': student.section,
                'parent_phone': student.parent_phone,
                'monthly_fee': float(student.monthly_fee),
                'school_id': student.school_id
            },
            'summary': {
                'total_paid': float(total_paid),
                'pending_count': len(pending),
                'pending_amount': sum(p['amount'] for p in pending)
            },
            'payment_history': payment_history,
            'pending': pending
        }
    
    def get_annual_summary(self, year=None, school_id=None):
        """Get annual summary report for a specific school"""
        print(f"📊 get_annual_summary - school_id: {school_id}")
        
        if not year:
            if school_id:
                current = AcademicYear.objects.filter(
                    school_id=int(school_id),
                    is_current=True
                ).first()
            else:
                current = AcademicYear.objects.filter(is_current=True).first()
            
            if not current:
                return {'error': 'No current academic year set'}
            year = current.name
        
        monthly_data = []
        total_year = 0
        
        for month in range(1, 14):
            report = self.get_monthly_report(year, month, school_id)
            if 'error' not in report:
                monthly_data.append({
                    'month': report['monthly_breakdown'][month]['month'],
                    'collected': report['monthly_breakdown'][month]['total'],
                    'paid_count': report['monthly_breakdown'][month]['count']
                })
                total_year += report['monthly_breakdown'][month]['total']
        
        return {
            'year': year,
            'total_collected': float(total_year),
            'monthly_data': monthly_data
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
        
        # Get monthly report
        monthly = self.get_monthly_report(
            year=current_year.name,
            school_id=school_id
        )
        
        # Get annual summary
        annual = self.get_annual_summary(
            year=current_year.name,
            school_id=school_id
        )
        
        return {
            'school_id': school_id,
            'academic_year': current_year.name,
            'current_month': monthly,
            'year_to_date': annual
        }