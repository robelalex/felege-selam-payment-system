# students/views.py
from django.http import HttpResponse
from .services.bulk_import import BulkImportService
import json
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Student
from .serializers import StudentSerializer
from payments.models import Payment, PaymentDeadline
import pandas as pd
from django.http import HttpResponse
from io import BytesIO
from datetime import datetime
from schools.models import School  # Add this import

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    
    @action(detail=False, methods=['get'])
    def search_by_id(self, request):
        """Search student by their unique ID"""
        student_id = request.query_params.get('student_id', None)
        if student_id:
            try:
                student = Student.objects.get(student_id=student_id)
                serializer = self.get_serializer(student)
                return Response(serializer.data)
            except Student.DoesNotExist:
                return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'error': 'Please provide student_id'}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def payment_history(self, request, pk=None):
        """Get payment history for a specific student"""
        student = self.get_object()
        payments = Payment.objects.filter(student=student).order_by('-created_at')
        
        data = []
        for payment in payments:
            data.append({
                'id': payment.id,
                'month': payment.deadline.get_month_display(),
                'academic_year': payment.deadline.academic_year,
                'amount': str(payment.amount),
                'status': payment.status,
                'payment_date': payment.created_at,
                'payment_method': payment.payment_method,
                'transaction_ref': payment.transaction_reference
            })
        
        return Response(data)
    
    @action(detail=True, methods=['get'])
    def pending_payments(self, request, pk=None):
        """Get all pending payments for a student"""
        student = self.get_object()
        
        # Get all active deadlines that the student hasn't paid yet
        paid_deadlines = Payment.objects.filter(
            student=student, 
            status='verified'
        ).values_list('deadline_id', flat=True)
        
        pending_deadlines = PaymentDeadline.objects.filter(
            school=student.school,
            is_active=True
        ).exclude(id__in=paid_deadlines)
        
        from .serializers import PaymentDeadlineSerializer
        serializer = PaymentDeadlineSerializer(pending_deadlines, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """Download Excel template for bulk import"""
        try:
            # Get school (you might want to get this from user's profile)
            school = School.objects.first()
            if not school:
                return Response({'error': 'No school found'}, status=404)
            
            service = BulkImportService(school.id)
            excel_file = service.download_template()
            
            response = HttpResponse(
                excel_file.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="student_import_template.xlsx"'
            return response
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """Import students from uploaded Excel file"""
        try:
            if 'file' not in request.FILES:
                return Response({'error': 'No file uploaded'}, status=400)
            
            file = request.FILES['file']
            
            # Get school (you might want to get this from user's profile)
            school = School.objects.first()
            if not school:
                return Response({'error': 'No school found'}, status=404)
            
            service = BulkImportService(school.id)
            results = service.process_file(file)
            
            return Response(results)
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'])
    def export_students(self, request):
        """Export all students to Excel"""
        try:
            students = Student.objects.all()
            
            # Create DataFrame
            data = []
            for student in students:
                data.append({
                    'Student ID': student.student_id,
                    'First Name': student.first_name,
                    'Last Name': student.last_name,
                    'Father Name': student.father_name,
                    'Mother Name': student.mother_name,
                    'Grade': student.grade,
                    'Section': student.section,
                    'Academic Year': student.academic_year,
                    'Parent Name': student.parent_full_name,
                    'Parent Phone': student.parent_phone,
                    'Monthly Fee': student.monthly_fee,
                    'Status': student.status
                })
            
            df = pd.DataFrame(data)
            
            # Save to BytesIO
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Students', index=False)
            
            output.seek(0)
            
            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="students_export_{datetime.now().strftime("%Y%m%d")}.xlsx"'
            return response
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)
        
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Export all students to Excel"""
        try:
            students = Student.objects.all()
            
            # Create data for Excel
            data = []
            for student in students:
                data.append({
                    'Student ID': student.student_id,
                    'First Name': student.first_name,
                    'Last Name': student.last_name,
                    'Father Name': student.father_name,
                    'Mother Name': student.mother_name,
                    'Grade': student.grade,
                    'Section': student.section,
                    'Academic Year': student.academic_year,
                    'Parent Name': student.parent_full_name,
                    'Parent Phone': student.parent_phone,
                    'Alternative Phone': student.parent_alternative_phone,
                    'Parent Email': student.parent_email,
                    'Monthly Fee': student.monthly_fee,
                    'City': student.city,
                    'Subcity': student.subcity,
                    'Kebele': student.kebele,
                    'House Number': student.house_number,
                    'Status': student.status,
                    'Enrollment Date': student.enrollment_date
                })
            
            # Create DataFrame
            df = pd.DataFrame(data)
            
            # Create Excel file in memory
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Students', index=False)
            
            output.seek(0)
            
            # Create response
            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="students_export_{datetime.now().strftime("%Y%m%d")}.xlsx"'
            return response
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)