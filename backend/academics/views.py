# backend/academics/views.py
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.utils import timezone
from .models import AcademicYear, YearPromotionLog, Subject, HomeroomAssignment
from .serializers import (
    AcademicYearSerializer, YearPromotionLogSerializer,
    SubjectSerializer, HomeroomAssignmentSerializer,
)
from students.models import Student, GRADUATION_GRADE
from schools.models import School
from datetime import timedelta
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
# ✅ Same fix as payments/views.py and slip_views.py: resolve the school
# from the logged-in user's own account, not from a client-supplied header.
from common.utils import get_verified_school_id
from authentication.permissions import CanManageAcademics
from exams.models import Term, StudentTermResult
from exams.services import results_service


class AcademicYearViewSet(viewsets.ModelViewSet):
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AcademicYear.objects.all()
        school_id = get_verified_school_id(self.request)
        print(f"📚 AcademicYearViewSet - verified school_id: {school_id}")

        if school_id:
            queryset = queryset.filter(school_id=school_id)
        else:
            # If no verified school, return empty (should not happen for school admins)
            queryset = queryset.none()

        # Filter by year ID if provided (additional filter)
        year_id = self.request.query_params.get('year')
        if year_id:
            try:
                queryset = queryset.filter(id=year_id)
            except (ValueError, TypeError):
                pass

        return queryset

    def perform_create(self, serializer):
        """✅ School comes from the verified, logged-in user's own account."""
        school_id = get_verified_school_id(self.request)

        if not school_id:
            raise serializers.ValidationError({"error": "Could not resolve your school"})

        try:
            school = School.objects.get(id=school_id)
            serializer.save(school=school)
            print(f"📚 Created academic year for school: {school.name}")
        except School.DoesNotExist:
            raise serializers.ValidationError({"error": "School not found"})

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        """Get the current academic year for the school"""
        school_id = get_verified_school_id(request)

        current_year = None
        if school_id:
            current_year = AcademicYear.objects.filter(
                school_id=school_id,
                is_current=True
            ).first()

        if not current_year:
            # Try to get any year for this school as fallback
            if school_id:
                current_year = AcademicYear.objects.filter(
                    school_id=school_id
                ).order_by('-year_ec').first()

        if current_year:
            serializer = self.get_serializer(current_year)
            return Response(serializer.data)
        return Response({'error': 'No academic year found for this school'}, status=404)

    @method_decorator(csrf_exempt, name='dispatch')
    @action(detail=True, methods=['post'], url_path='set_current', permission_classes=[IsAuthenticated])
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

    @action(detail=True, methods=['post'], url_path='promote_students', permission_classes=[IsAuthenticated])
    def promote_students(self, request, pk=None):
        """
        Promote active students to the next grade — now based on their
        Phase 4 results instead of blindly moving everyone up.

        Decision per student, using StudentTermResult for the chosen term:
          - is_passing True  -> promote (or graduate, if at GRADUATION_GRADE)
          - is_passing False -> RETAIN: stays in the same grade, but still
            moves to the new academic year (they repeat the grade)
          - no result at all (no marks ever accepted for them this term)
            -> promoted anyway, same as the old blind behavior, but
            counted separately as students_promoted_without_results so
            the admin can see the decision wasn't actually based on data

        Which term's results to use:
          - request.data['term_id'] if given
          - otherwise the highest-'order' Term for this academic year
            (i.e. the school's own idea of the "final" term)
          - if this academic year has no terms at all set up (school
            hasn't adopted the marks/results system yet), falls back to
            the pre-Phase-4 blind-promote behavior for everyone, so this
            doesn't break schools that aren't using results yet
        """
        year = self.get_object()

        # ✅ Check if user is authenticated (School Admin)
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)

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

        # Resolve which term's results decide promotion.
        term_id = request.data.get('term_id')
        if term_id:
            term = Term.objects.filter(id=term_id, academic_year=year, school=year.school).first()
            if not term:
                return Response({'error': 'Term not found for this academic year'}, status=400)
        else:
            term = results_service.get_final_term(year.school, year)

        promoted_count = 0
        graduated_count = 0
        retained_count = 0
        promoted_without_results_count = 0
        retained_students = []          # for the response, so the admin can see exactly who
        no_result_students = []

        students = Student.objects.filter(
            school=year.school,
            status='active'
        )

        # Preload results for this term in one query instead of one per student.
        results_by_student_id = {}
        if term:
            results_by_student_id = {
                r.student_id: r for r in StudentTermResult.objects.filter(term=term, student__in=students)
            }

        for student in students:
            result = results_by_student_id.get(student.id)
            is_passing = result.is_passing if result else None

            if is_passing is False:
                # ❌ Failed this term — retain in the same grade, but still
                # move them into the new academic year (they repeat it).
                student.academic_year = f"{year.year_ec + 1} E.C."
                student.save()
                retained_count += 1
                retained_students.append({'id': student.id, 'name': f"{student.formatted_name}", 'grade': student.grade})
                continue

            if is_passing is None:
                promoted_without_results_count += 1
                no_result_students.append({'id': student.id, 'name': f"{student.formatted_name}", 'grade': student.grade})

            if student.grade < GRADUATION_GRADE:
                student.grade += 1
                student.academic_year = f"{year.year_ec + 1} E.C."
                new_fee = year.get_default_fee_for_grade(student.grade, year.school.id)
                if new_fee:
                    student.monthly_fee = new_fee
                student.save()
                promoted_count += 1
            elif student.grade == GRADUATION_GRADE:
                student.status = 'graduated'
                student.save()
                graduated_count += 1

        log = YearPromotionLog.objects.create(
            from_year=year,
            to_year=next_year,
            students_promoted=promoted_count,
            students_graduated=graduated_count,
            students_retained=retained_count,
            students_promoted_without_results=promoted_without_results_count,
            term_used=term,
            promoted_by=request.user
        )

        message = f'Promoted {promoted_count} students, {graduated_count} graduated, {retained_count} retained'
        if not term:
            message += ' (no terms set up for this year — promoted everyone without checking results, same as before)'
        elif promoted_without_results_count:
            message += f' ({promoted_without_results_count} had no results yet and were promoted by default)'

        return Response({
            'success': True,
            'message': message,
            'promoted_count': promoted_count,
            'graduated_count': graduated_count,
            'retained_count': retained_count,
            'promoted_without_results_count': promoted_without_results_count,
            'term_used': {'id': term.id, 'name': term.name} if term else None,
            'retained_students': retained_students,
            'students_without_results': no_result_students,
            'log': YearPromotionLogSerializer(log).data
        })

    @action(detail=False, methods=['post'], url_path='create_next_year')
    def create_next_year(self, request):
        """Create the next academic year for the school"""
        school_id = get_verified_school_id(request)
        if not school_id:
            return Response({'error': 'Could not resolve your school'}, status=400)

        try:
            school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            return Response({'error': 'School not found'}, status=404)

        # Get current academic year for this school
        current_year = AcademicYear.objects.filter(
            school=school,
            is_current=True
        ).first()

        if not current_year:
            # If no current year, get the latest year
            current_year = AcademicYear.objects.filter(school=school).order_by('-year_ec').first()

        if not current_year:
            return Response({'error': 'No academic year found for this school'}, status=400)

        # Calculate next year
        next_year_ec = current_year.year_ec + 1

        # Check if already exists for this school
        if AcademicYear.objects.filter(school=school, year_ec=next_year_ec).exists():
            return Response({'error': 'Next academic year already exists for this school'}, status=400)

        # Calculate dates (approximate)
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

    @action(detail=True, methods=['patch'], url_path='archive')
    def archive_year(self, request, pk=None):
        """Soft delete - archive the academic year"""
        year = self.get_object()
        year.is_active = False
        year.is_archived = True
        year.save()
        return Response({'success': True, 'message': f'Year {year.name} archived'})

    @action(detail=True, methods=['patch'], url_path='restore')
    def restore_year(self, request, pk=None):
        """Restore an archived academic year"""
        year = self.get_object()
        year.is_active = True
        year.is_archived = False
        year.save()
        return Response({'success': True, 'message': f'Year {year.name} restored'})

    @action(detail=False, methods=['get'], url_path='archived')
    def get_archived(self, request):
        """Get all archived academic years for the school"""
        school_id = get_verified_school_id(request)
        if not school_id:
            return Response([], status=200)

        archived = AcademicYear.objects.filter(
            school_id=school_id,
            is_archived=True
        )
        serializer = self.get_serializer(archived, many=True)
        return Response(serializer.data)


class SubjectViewSet(viewsets.ModelViewSet):
    """
    Subject registration — each school builds its own subject list
    (English, Math, Physics...). No hardcoded subjects anywhere.
    """
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated, CanManageAcademics]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return Subject.objects.none()
        queryset = Subject.objects.filter(school_id=school_id, is_active=True)

        # ✅ NEW: optional ?grade= filter — subjects are now class(grade)-based.
        # Not passing this param keeps the old behavior (every active subject
        # for the school), so nothing that already calls /subjects/ breaks.
        grade = self.request.query_params.get('grade')
        if grade:
            try:
                queryset = queryset.filter(
                    models.Q(grade=int(grade)) | models.Q(grade__isnull=True)
                )
            except ValueError:
                pass
        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise serializers.ValidationError({"error": "Could not resolve your school"})
        serializer.save(school_id=school_id)

    def destroy(self, request, *args, **kwargs):
        """Soft delete — subjects may be referenced by past marks/assignments."""
        subject = self.get_object()
        subject.is_active = False
        subject.save(update_fields=['is_active'])
        return Response({'success': True, 'message': f'{subject.name} removed'})


class HomeroomAssignmentViewSet(viewsets.ModelViewSet):
    """
    The homeroom (class) teacher for each grade+section, per academic year.
    """
    serializer_class = HomeroomAssignmentSerializer
    permission_classes = [IsAuthenticated, CanManageAcademics]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            return HomeroomAssignment.objects.none()

        queryset = HomeroomAssignment.objects.filter(school_id=school_id).select_related(
            'section', 'teacher', 'academic_year'
        )

        year_id = self.request.query_params.get('academic_year_id')
        if year_id:
            queryset = queryset.filter(academic_year_id=year_id)

        grade = self.request.query_params.get('grade')
        if grade:
            queryset = queryset.filter(grade=grade)

        return queryset

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise serializers.ValidationError({"error": "Could not resolve your school"})

        section = serializer.validated_data.get('section')
        if section and section.school_id != school_id:
            raise serializers.ValidationError({"error": "Section does not belong to your school"})

        teacher = serializer.validated_data.get('teacher')
        if teacher and teacher.school_id != school_id:
            raise serializers.ValidationError({"error": "Teacher does not belong to your school"})
        if teacher and teacher.role != 'teacher':
            raise serializers.ValidationError({"error": "Selected staff member is not marked as a teacher"})

        serializer.save(school_id=school_id)