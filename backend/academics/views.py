from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import AcademicYear, YearPromotionLog
from .serializers import AcademicYearSerializer, YearPromotionLogSerializer
from students.models import Student

class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    
    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get the current academic year"""
        current_year = AcademicYear.objects.filter(is_current=True).first()
        if current_year:
            serializer = self.get_serializer(current_year)
            return Response(serializer.data)
        return Response({'error': 'No current academic year set'}, status=404)
    
    @action(detail=True, methods=['post'])
    def set_current(self, request, pk=None):
        """Set this academic year as current"""
        year = self.get_object()
        
        # Clear current flag from all years
        AcademicYear.objects.filter(is_current=True).update(is_current=False)
        
        # Set this year as current
        year.is_current = True
        year.save()
        
        serializer = self.get_serializer(year)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def promote_students(self, request, pk=None):
        """Promote all students to next grade"""
        year = self.get_object()
        
        if not year.is_current:
            return Response({
                'error': 'Can only promote students from current academic year'
            }, status=400)
        
        # Get next academic year
        next_year = AcademicYear.objects.filter(
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
    
    @action(detail=False, methods=['post'])
    def create_next_year(self, request):
        """Create the next academic year"""
        current_year = AcademicYear.objects.filter(is_current=True).first()
        
        if not current_year:
            return Response({'error': 'No current academic year found'}, status=400)
        
        # Calculate next year
        next_year_ec = current_year.year_ec + 1
        
        # Check if already exists
        if AcademicYear.objects.filter(year_ec=next_year_ec).exists():
            return Response({'error': 'Next academic year already exists'}, status=400)
        
        # Calculate dates (approximate)
        from datetime import timedelta
        next_start = current_year.end_date + timedelta(days=1)
        next_end = next_start + timedelta(days=365)
        
        # Create next year
        next_year = AcademicYear.objects.create(
            year_ec=next_year_ec,
            name=f"{next_year_ec} E.C.",
            start_date=next_start,
            end_date=next_end,
            is_current=False,
            is_active=True
        )
        
        serializer = self.get_serializer(next_year)
        return Response(serializer.data, status=201)