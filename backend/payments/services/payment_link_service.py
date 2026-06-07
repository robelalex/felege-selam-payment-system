# backend/payments/services/payment_link_service.py
from urllib.parse import urlencode
from django.conf import settings

class PaymentLinkService:
    """Generate payment links for parent portal"""
    
    # Your frontend URL
    FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')
    
    @classmethod
    def generate_payment_link(cls, student_id, deadline_id, amount, student_name=None):
        """
        Generate payment link for parent portal
        
        Args:
            student_id: Student's ID (string or int)
            deadline_id: Payment deadline ID
            amount: Amount to pay
            student_name: Optional student name for display
        
        Returns:
            Full URL string
        """
        base_url = f"{cls.FRONTEND_URL}/parent-pay"
        
        params = {
            'student': str(student_id),
            'deadline': str(deadline_id),
            'amount': str(amount),
        }
        
        # Add student name as query param (optional, for display)
        if student_name:
            params['name'] = student_name
        
        query_string = urlencode(params)
        return f"{base_url}?{query_string}"
    
    @classmethod
    def generate_bulk_payment_link(cls, student_id, academic_year=None):
        """
        Generate link for bulk payments (multiple deadlines)
        
        Args:
            student_id: Student's ID
            academic_year: Optional academic year filter
        
        Returns:
            Full URL string
        """
        base_url = f"{cls.FRONTEND_URL}/parent-dashboard"
        
        params = {'student': str(student_id)}
        if academic_year:
            params['year'] = academic_year
        
        query_string = urlencode(params)
        return f"{base_url}?{query_string}"