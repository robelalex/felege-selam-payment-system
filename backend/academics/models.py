from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from datetime import date
from schools.models import School  # ✅ Add this import

class AcademicYear(models.Model):
    """Academic Year Management"""
    
    # ✅ Add school relationship
    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='academic_years',
        null=True,
        blank=True,
        help_text="School this academic year belongs to"
    )
    
    # Year identification
    year_ec = models.IntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(2100)],
        help_text="Ethiopian Calendar year (e.g., 2016)"
    )
    
    # Display name
    name = models.CharField(
        max_length=50,
        help_text="e.g., 2016 E.C."
    )
    
    # Dates
    start_date = models.DateField(
        help_text="When the academic year starts"
    )
    end_date = models.DateField(
        help_text="When the academic year ends"
    )
    
    # Status flags
    is_current = models.BooleanField(
        default=False,
        help_text="Is this the current academic year?"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Is this year active in the system?"
    )
    
    # Statistics (auto-updated)
    total_students = models.IntegerField(default=0)
    total_payments = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-year_ec']
        verbose_name = "Academic Year"
        verbose_name_plural = "Academic Years"
        unique_together = ['school', 'year_ec']
    
    def __str__(self):
        school_name = f"{self.school.name} - " if self.school else ""
        return f"{school_name}{self.name} {'(Current)' if self.is_current else ''}"
    
    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"{self.year_ec} E.C."
        
        if self.is_current and self.school:
            AcademicYear.objects.filter(school=self.school, is_current=True).update(is_current=False)
        
        super().save(*args, **kwargs)
    
    def promote_students(self):
        """Promote all students to next grade"""
        from students.models import Student
        
        students = Student.objects.filter(status='active')
        promoted_count = 0
        
        for student in students:
            if student.grade < 8:
                student.grade += 1
                student.save()
                promoted_count += 1
            else:
                student.status = 'graduated'
                student.save()
        
        return promoted_count
    
    def archive_year(self):
        """Archive this academic year"""
        self.is_active = False
        self.is_current = False
        self.save()
    
    def get_statistics(self):
        """Get statistics for this academic year"""
        from students.models import Student
        from payments.models import Payment
        
        return {
            'total_students': Student.objects.filter(
                enrollment_date__gte=self.start_date,
                enrollment_date__lte=self.end_date
            ).count(),
            'total_payments': Payment.objects.filter(
                created_at__gte=self.start_date,
                created_at__lte=self.end_date
            ).aggregate(total=models.Sum('amount'))['total'] or 0,
            'verified_payments': Payment.objects.filter(
                status='verified',
                created_at__gte=self.start_date,
                created_at__lte=self.end_date
            ).count()
        }


class YearPromotionLog(models.Model):
    """Log of student promotions between years"""
    
    from_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='promotions_from'
    )
    to_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='promotions_to'
    )
    
    students_promoted = models.IntegerField(default=0)
    students_graduated = models.IntegerField(default=0)
    
    promoted_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Promotion: {self.from_year} → {self.to_year}"