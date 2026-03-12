# backend/payments/services/report_service.py
from students.models import Student
from payments.models import Payment, PaymentDeadline
from academics.models import AcademicYear
from collections import defaultdict
from datetime import datetime
import calendar

class ReportService:
    """Service to generate financial reports"""
    
    def __init__(self):
        self.results = {}
    
    def get_monthly_report(self, year=None, month=None):
        """
        Generate monthly collection report
        If no year/month provided, use current
        """
        # Get academic year
        if not year:
            current = AcademicYear.objects.filter(is_current=True).first()
            if not current:
                return {'error': 'No current academic year set'}
            year = current.name
        
        # Get all students
        students = Student.objects.filter(status='active')
        
        # Get all payments for this year
        payments = Payment.objects.filter(
            deadline__academic_year=year,
            status='verified'
        )
        
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
        months = [
            'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
            'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
        ]
        
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
    
    def get_student_report(self, student_id):
        """Generate report for a single student"""
        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return {'error': 'Student not found'}
        
        # Get all payments for this student
        payments = Payment.objects.filter(
            student=student
        ).order_by('-created_at')
        
        # Get all deadlines
        deadlines = PaymentDeadline.objects.filter(
            academic_year=student.academic_year,
            is_active=True
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
                'monthly_fee': float(student.monthly_fee)
            },
            'summary': {
                'total_paid': float(total_paid),
                'pending_count': len(pending),
                'pending_amount': sum(p['amount'] for p in pending)
            },
            'payment_history': payment_history,
            'pending': pending
        }
    
    def get_annual_summary(self, year=None):
        """Get annual summary report"""
        if not year:
            current = AcademicYear.objects.filter(is_current=True).first()
            if not current:
                return {'error': 'No current academic year set'}
            year = current.name
        
        monthly_data = []
        total_year = 0
        
        for month in range(1, 14):
            report = self.get_monthly_report(year, month)
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