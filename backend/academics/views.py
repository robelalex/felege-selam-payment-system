# backend/academics/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import AcademicYear, YearPromotionLog
from .serializers import AcademicYearSerializer, YearPromotionLogSerializer
from students.models import Student
from schools.models import School  # ✅ Add this import

class AcademicYearViewSet(viewsets.ModelViewSet):
    serializer_class = AcademicYearSerializer
    
    def get_queryset(self):
        queryset = AcademicYear.objects.all()
        
        # ✅ Filter by school from header
        school_id = self.request.headers.get('X-School-ID')
        print(f"📚 AcademicYearViewSet - X-School-ID header: {school_id}")
        
        if school_id:
            try:
                queryset = queryset.filter(school_id=int(school_id))
                print(f"📚 Filtered academic years by school ID: {school_id}")
            except ValueError:
                print(f"📚 Invalid school ID: {school_id}")
        else:
            # If no school header, return empty (should not happen for school admins)
            queryset = queryset.none()
        
        # Filter by year ID if provided (additional filter)
        year_id = self.request.query_params.get('year')
        if year_id:
            try:
                queryset = queryset.filter(id=year_id)
            except (ValueError, TypeError):
                pass
                
        return queryset
    
    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        """Get the current academic year for the school"""
        # ✅ Filter by school from header
        school_id = request.headers.get('X-School-ID')
        
        current_year = None
        if school_id:
            try:
                current_year = AcademicYear.objects.filter(
                    school_id=int(school_id),
                    is_current=True
                ).first()
            except ValueError:
                pass
        
        if not current_year:
            current_year = AcademicYear.objects.filter(is_current=True).first()
        
        if current_year:
            serializer = self.get_serializer(current_year)
            return Response(serializer.data)
        return Response({'error': 'No current academic year set'}, status=404)
    
    @action(detail=True, methods=['post'], url_path='set_current')
    def set_current(self, request, pk=None):
        """Set this academic year as current for its school"""
        year = self.get_object()
        
        # ✅ Only update current for this school
        if year.school:
            AcademicYear.objects.filter(school=year.school, is_current=True).update(is_current=False)
        
        # Set this year as current
        year.is_current = True
        year.save()
        
        serializer = self.get_serializer(year)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='promote_students')
    def promote_students(self, request, pk=None):
        """Promote all students to next grade"""
        year = self.get_object()
        
        if not year.is_current:
            return Response({
                'error': 'Can only promote students from current academic year'
            }, status=400)
        
        # Get next academic year for the same school
        next_year = AcademicYear.objects.filter(
            school=year.school,
            year_ec=year.year_ec + 1
        ).first()
        
        if not next_year:
            return Response({
                'error': 'Next academic year not found. Please create it first.'
            }, status=400)
        
        # Promote students
        promoted = year.promote_students()
        
        # Create promotion log
        log = YearPromotionLog.objects.create(
            from_year=year,
            to_year=next_year,
            students_promoted=promoted,
            students_graduated=Student.objects.filter(grade=8, status='graduated').count(),
            promoted_by=request.user
        )
        
        return Response({
            'success': True,
            'message': f'Promoted {promoted} students to next grade',
            'log': YearPromotionLogSerializer(log).data
        })
    
    @action(detail=False, methods=['post'], url_path='create_next_year')
    def create_next_year(self, request):
        """Create the next academic year for the school"""
        # ✅ Get school from header
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        
        try:
            school = School.objects.get(id=int(school_id))
        except (ValueError, School.DoesNotExist):
            return Response({'error': 'School not found'}, status=404)
        
        # Get current academic year for this school
        current_year = AcademicYear.objects.filter(
            school=school,
            is_current=True
        ).first()
        
        if not current_year:
            return Response({'error': 'No current academic year found for this school'}, status=400)
        
        # Calculate next year
        next_year_ec = current_year.year_ec + 1
        
        # Check if already exists for this school
        if AcademicYear.objects.filter(school=school, year_ec=next_year_ec).exists():
            return Response({'error': 'Next academic year already exists for this school'}, status=400)
        
        # Calculate dates (approximate)
        from datetime import timedelta
        next_start = current_year.end_date + timedelta(days=1)
        next_end = next_start + timedelta(days=365)
        
        # Create next year
        next_year = AcademicYear.objects.create(
            school=school,
            year_ec=next_year_ec,
            name=f"{next_year_ec} E.C.",
            start_date=next_start,
            end_date=next_end,
            is_current=False,
            is_active=True
        )
        
        serializer = self.get_serializer(next_year)
        return Response(serializer.data, status=201)