from django.db import models
from django.core.validators import MinValueValidator
from schools.models import School

class Student(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('graduated', 'Graduated'),
        ('transferred', 'Transferred'),
        ('suspended', 'Suspended'),
    ]
    
    GRADE_CHOICES = [(i, f'Grade {i}') for i in range(1, 9)]
    
    student_id = models.CharField(
        max_length=50, 
        unique=True, 
        help_text="Format: SCHOOLCODE-YEAR-SEQUENCE (e.g., FS-2024-1001)"
    )
    
    school = models.ForeignKey(
        School, 
        on_delete=models.CASCADE, 
        related_name='students'
    )
    
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    father_name = models.CharField(max_length=100, blank=True)
    mother_name = models.CharField(max_length=100, blank=True)
    
    grade = models.IntegerField(choices=GRADE_CHOICES)
    section = models.CharField(max_length=10, blank=True)
    academic_year = models.CharField(max_length=20, help_text="e.g., 2016 E.C.")
    
    parent_full_name = models.CharField(max_length=200)
    parent_phone = models.CharField(max_length=20)
    parent_alternative_phone = models.CharField(max_length=20, blank=True)
    parent_email = models.EmailField(blank=True)
    
    monthly_fee = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    
    city = models.CharField(max_length=100, default="Jimma")
    subcity = models.CharField(max_length=100, blank=True)
    kebele = models.CharField(max_length=50, blank=True)
    house_number = models.CharField(max_length=50, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    enrollment_date = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['grade', 'first_name']
        indexes = [
            models.Index(fields=['student_id']),
            models.Index(fields=['parent_phone']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.student_id} - {self.first_name} {self.last_name}"
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"