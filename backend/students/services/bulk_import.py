# backend/students/services/bulk_import.py
import pandas as pd
import openpyxl
from io import BytesIO
from datetime import datetime
from students.models import Student
from schools.models import School
import re

class BulkImportService:
    """Handle bulk import of students from Excel"""
    
    def __init__(self, school_id):
        self.school = School.objects.get(id=school_id)
        self.results = {
            'total': 0,
            'success': 0,
            'errors': [],
            'students': []
        }
    
    def download_template(self):
        """Generate Excel template for download"""
        # Create a template DataFrame
        template_data = {
            'First Name': ['Abel'],
            'Last Name': ['Mekonin'],
            'Father Name': ['Mekonin'],
            'Mother Name': ['Tigist'],
            'Grade': [3],
            'Section': ['A'],
            'Academic Year': ['2016 E.C.'],
            'Parent Full Name': ['Mekonin Tesfaye'],
            'Parent Phone': ['0912345678'],
            'Alternative Phone': [''],
            'Parent Email': [''],
            'Monthly Fee': [200],
            'City': ['Jimma'],
            'Subcity': [''],
            'Kebele': [''],
            'House Number': ['']
        }
        
        df = pd.DataFrame(template_data)
        
        # Save to BytesIO
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Students', index=False)
            
            # Get the workbook and add instructions sheet
            workbook = writer.book
            instructions = workbook.create_sheet("Instructions")
            instructions.append(["BULK STUDENT IMPORT INSTRUCTIONS"])
            instructions.append([])
            instructions.append(["1. Do NOT modify the column headers"])
            instructions.append(["2. Fill in student data starting from row 2"])
            instructions.append(["3. Required fields: First Name, Last Name, Grade, Parent Phone"])
            instructions.append(["4. Grade must be between 1 and 8"])
            instructions.append(["5. Phone number format: 0912345678"])
            instructions.append(["6. Monthly Fee should be a number (e.g., 200)"])
            instructions.append([])
            instructions.append(["After filling, save and upload this file."])
        
        output.seek(0)
        return output
    
    def validate_row(self, row, index):
        """Validate a single row of data and return (errors, fixed_phone)"""
        errors = []
        fixed_phone = None
        
        # Check required fields
        if not row.get('First Name'):
            errors.append(f"Row {index}: First Name is required")
        
        if not row.get('Last Name'):
            errors.append(f"Row {index}: Last Name is required")
        
        # Validate grade
        try:
            grade = int(row.get('Grade', 0))
            if grade < 1 or grade > 8:
                errors.append(f"Row {index}: Grade must be between 1 and 8")
        except (ValueError, TypeError):
            errors.append(f"Row {index}: Grade must be a number")
        
        # Validate phone
        phone = row.get('Parent Phone', '')
        phone_str = str(phone).strip()
        
        # If it's 9 digits, add back the leading zero
        if len(phone_str) == 9 and phone_str.isdigit():
            phone_str = '0' + phone_str
        
        fixed_phone = phone_str
        
        if phone and not re.match(r'^0[0-9]{9}$', phone_str):
            errors.append(f"Row {index}: Invalid phone number format. Use 0912345678")
        
        # Validate monthly fee
        try:
            fee = float(row.get('Monthly Fee', 0))
            if fee <= 0:
                errors.append(f"Row {index}: Monthly Fee must be greater than 0")
        except (ValueError, TypeError):
            errors.append(f"Row {index}: Monthly Fee must be a number")
        
        return errors, fixed_phone
    
    def process_file(self, file):
        """Process uploaded Excel file"""
        try:
            # Read Excel file
            df = pd.read_excel(file, sheet_name='Students')
            
            # Convert to list of dictionaries
            records = df.to_dict('records')
            self.results['total'] = len(records)
            
            # Get existing student IDs for ID generation
            existing_ids = list(Student.objects.values_list('student_id', flat=True))
            
            from students.utils.id_generator import StudentIDGenerator
            id_generator = StudentIDGenerator()
            
            for idx, record in enumerate(records, start=2):
                # Validate and get fixed phone number
                errors, fixed_phone = self.validate_row(record, idx)
                
                if errors:
                    self.results['errors'].extend(errors)
                    continue
                
                try:
                    # Generate student ID
                    student_id = id_generator.generate_student_id(existing_ids)
                    existing_ids.append(student_id)
                    
                    # Create student
                    student = Student.objects.create(
                        student_id=student_id,
                        school=self.school,
                        first_name=record['First Name'],
                        last_name=record['Last Name'],
                        father_name=record.get('Father Name', ''),
                        mother_name=record.get('Mother Name', ''),
                        grade=int(record['Grade']),
                        section=record.get('Section', 'A'),
                        academic_year=record.get('Academic Year', '2016 E.C.'),
                        parent_full_name=record.get('Parent Full Name', ''),
                        parent_phone=fixed_phone,
                        parent_alternative_phone=str(record.get('Alternative Phone', '')),
                        parent_email=record.get('Parent Email', ''),
                        monthly_fee=float(record.get('Monthly Fee', 200)),
                        city=record.get('City', 'Jimma'),
                        subcity=record.get('Subcity', ''),
                        kebele=record.get('Kebele', ''),
                        house_number=record.get('House Number', ''),
                        status='active'
                    )
                    
                    self.results['success'] += 1
                    self.results['students'].append({
                        'id': student.id,
                        'student_id': student.student_id,
                        'name': f"{student.first_name} {student.last_name}"
                    })
                    
                except Exception as e:
                    self.results['errors'].append(f"Row {idx}: Failed to create student - {str(e)}")
            
            return self.results
            
        except Exception as e:
            return {
                'error': f"Failed to process file: {str(e)}",
                'total': 0,
                'success': 0,
                'errors': [str(e)]
            }