from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from datetime import date
from schools.models import School

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
    is_archived = models.BooleanField(
        default=False,
        help_text="Soft delete flag"
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
        """Promote all students to next grade (1-7) and graduate grade 8 students"""
        from students.models import Student
        
        students = Student.objects.filter(
            school=self.school,
            status='active'
        )
        promoted_count = 0
        graduated_count = 0
        
        for student in students:
            if student.grade < 8:
                student.grade += 1
                # Keep student_id unchanged
                # Update fee for new grade
                new_fee = self.get_default_fee_for_grade(student.grade, self.school.id)
                if new_fee:
                    student.monthly_fee = new_fee
                student.save()
                promoted_count += 1
            elif student.grade == 8:
                student.status = 'graduated'
                student.save()
                graduated_count += 1
        
        return promoted_count, graduated_count
    
    def get_default_fee_for_grade(self, grade, school_id):
        """Get default monthly fee for a grade from active deadlines"""
        from payments.models import PaymentDeadline
        
        # Try to get a deadline for this specific grade
        deadline = PaymentDeadline.objects.filter(
            school_id=school_id,
            grade=grade,
            is_active=True
        ).first()
        
        if deadline:
            return deadline.amount
        
        # Fallback to a deadline that applies to all grades
        deadline = PaymentDeadline.objects.filter(
            school_id=school_id,
            grade__isnull=True,
            is_active=True
        ).first()
        
        if deadline:
            return deadline.amount
        
        # Default fallback amounts
        DEFAULT_FEES = {
            1: 500, 2: 550, 3: 600, 4: 650,
            5: 700, 6: 750, 7: 800, 8: 850
        }
        return DEFAULT_FEES.get(grade, 500)
    
    def archive_year(self):
        """Archive this academic year"""
        self.is_active = False
        self.is_current = False
        self.is_archived = True
        self.save()
    
    def restore_year(self):
        """Restore an archived academic year"""
        self.is_active = True
        self.is_archived = False
        self.save()
    
    def get_statistics(self):
        """Get statistics for this academic year"""
        from students.models import Student
        from payments.models import Payment
        from django.db import models
        
        return {
            'total_students': Student.objects.filter(
                academic_year=self.name,
                school=self.school
            ).count(),
            'total_payments': Payment.objects.filter(
                deadline__academic_year=self.name,
                student__school=self.school,
                status='verified'
            ).aggregate(total=models.Sum('amount'))['total'] or 0,
            'verified_payments': Payment.objects.filter(
                deadline__academic_year=self.name,
                student__school=self.school,
                status='verified'
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