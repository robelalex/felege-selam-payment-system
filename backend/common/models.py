# backend/common/models.py
from django.db import models
from django.contrib.auth.models import User

class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('LOGIN', 'Login'),
        ('LOGOUT', 'Logout'),
        ('PAYMENT_VERIFY', 'Payment Verification'),
        ('STUDENT_CREATE', 'Student Created'),
        ('STUDENT_EDIT', 'Student Edited'),
        ('STUDENT_DELETE', 'Student Deleted'),
        ('DEADLINE_CREATE', 'Deadline Created'),
        ('DEADLINE_EDIT', 'Deadline Edited'),
        ('DEADLINE_DELETE', 'Deadline Deleted'),
        ('SLIP_VERIFY', 'Slip Verified'),
        ('SLIP_REJECT', 'Slip Rejected'),
        ('SCHOOL_APPROVE', 'School Approved'),
        ('SCHOOL_REJECT', 'School Rejected'),
        ('SETTINGS_CHANGE', 'Settings Changed'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    details = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action']),
            models.Index(fields=['timestamp']),
        ]
    
    def __str__(self):
        return f"{self.user} - {self.action} - {self.timestamp}"