# students/models.py
from django.db import models
from django.core.validators import MinValueValidator
from schools.models import School
import re
from datetime import datetime

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
        blank=True, 
        null=True,  # ✅ Allow null temporarily
        help_text="Format: SCHOOLCODE-YEAR-SEQUENCE (e.g., FS-2024-1001). Auto-generated if left blank."
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
    
    def _format_academic_year(self, year_str):
        """Convert any format to 'YYYY E.C.' format"""
        year_str = str(year_str).strip()
        
        if re.match(r'^\d{4}\s+E\.C\.$', year_str):
            return year_str
        if re.match(r'^\d{4}\s+E\.C$', year_str):
            return year_str.replace('E.C', 'E.C.')
        if re.match(r'^\d{4}\s+EC$', year_str):
            return year_str.replace('EC', 'E.C.')
        if re.match(r'^\d{4}$', year_str):
            return f"{year_str} E.C."
        if re.match(r'^\d{4}\s+E\s+C$', year_str):
            return year_str.replace('E C', 'E.C.')
        if re.match(r'^\d{4}E\.C\.$', year_str):
            return f"{year_str[:4]} E.C."
        
        return year_str
    
    def _generate_student_id(self):
        """Auto-generate student ID based on school code and academic year"""
        if not self.academic_year:
            return None
            
        school_code = self.school.code if self.school.code else self.school.name[:2].upper()
        
        # Extract year from academic_year
        year_match = re.search(r'(\d{4})', self.academic_year)
        year = year_match.group(1) if year_match else str(datetime.now().year)
        
        # Get the next sequence number for this school and year
        last_student = Student.objects.filter(
            school=self.school,
            student_id__startswith=f"{school_code}-{year}-"
        ).order_by('-student_id').first()
        
        if last_student and last_student.student_id:
            try:
                last_seq = int(last_student.student_id.split('-')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
        
        return f"{school_code}-{year}-{next_seq:04d}"
    
    def clean(self):
        """Auto-format academic_year to standard format"""
        if self.academic_year:
            self.academic_year = self._format_academic_year(self.academic_year)
    
    def save(self, *args, **kwargs):
        """Auto-format academic_year and auto-generate student_id before saving"""
        self.clean()
        
        # ✅ Generate ID if not exists
        if not self.student_id or self.student_id == '':
            new_id = self._generate_student_id()
            if new_id:
                self.student_id = new_id
                print(f"Generated ID for {self.first_name}: {self.student_id}")
        
        super().save(*args, **kwargs)