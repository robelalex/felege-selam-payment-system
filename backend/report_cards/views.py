# report_cards/views.py
#
# Phase 6 (continued) — the API surface for generating, releasing, and
# viewing report cards. Generation/release stays admin-gated (see
# models.py's design notes: generating never auto-releases). Homeroom
# teachers get read-only access to their own class's report cards plus
# a narrow action to add their comment before release — everything else
# here is admin-only, same permission shape as exams/views.py's
# StudentTermResultViewSet.
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from academics.models import AcademicYear, HomeroomAssignment
from exams.models import Term
from students.models import Student
from common.utils import get_verified_school_id, get_effective_role

from .models import ReportCard
from .serializers import ReportCardSerializer
from .services import generation_service


def _is_admin(request):
    return get_effective_role(request.user) in ('school_admin', 'super_admin')


def _staff_profile(request):
    return getattr(request.user, 'staff_profile', None)


def _teacher_owns_homeroom(staff, grade, section, academic_year_id):
    return HomeroomAssignment.objects.filter(
        teacher=staff, grade=grade, section__name=section, academic_year_id=academic_year_id
    ).exists()


class ReportCardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read (list/retrieve): admin sees everything for their school;
    homeroom teachers see only report cards for their own class.
    Everything else (generate/release/comment) is its own action below.
    """
    serializer_class = ReportCardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = ReportCard.objects.select_related('student', 'term', 'academic_year', 'generated_by', 'released_by') \
            .filter(school_id=school_id)

        params = self.request.query_params
        if params.get('academic_year_id'):
            qs = qs.filter(academic_year_id=params['academic_year_id'])
        if params.get('grade'):
            qs = qs.filter(grade=params['grade'])
        if 'section' in params:
            qs = qs.filter(section=params.get('section', ''))
        if params.get('term_id'):
            qs = qs.filter(term_id=params['term_id'])
        if params.get('report_type'):
            qs = qs.filter(report_type=params['report_type'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('student_id'):
            qs = qs.filter(student_id=params['student_id'])

        if not _is_admin(self.request):
            staff = _staff_profile(self.request)
            if not staff:
                return qs.none()
            # A homeroom teacher only ever sees their OWN class — collapse
            # to that regardless of what grade/section filters were passed.
            owned = HomeroomAssignment.objects.filter(teacher=staff).values_list('grade', 'section__name', 'academic_year_id')
            if not owned:
                return qs.none()
            from django.db.models import Q
            owned_q = Q()
            for grade, section, year_id in owned:
                owned_q |= Q(grade=grade, section=section, academic_year_id=year_id)
            qs = qs.filter(owned_q)

        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Body: { student_id, report_type: 'term'|'cumulative', term_id (required if 'term') }. Admin only."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        student_id = request.data.get('student_id')
        report_type = request.data.get('report_type')
        term_id = request.data.get('term_id')

        student = Student.objects.filter(id=student_id, school_id=school_id).first()
        if not student:
            return Response({'error': 'Student not found'}, status=404)

        staff = _staff_profile(request)
        try:
            if report_type == 'term':
                term = Term.objects.filter(id=term_id, school_id=school_id).first()
                if not term:
                    return Response({'error': 'Term not found'}, status=404)
                report_card = generation_service.generate_term_report_card(student, term, generated_by=staff)
            elif report_type == 'cumulative':
                year = AcademicYear.objects.filter(school_id=school_id, is_current=True).first()
                if not year:
                    return Response({'error': 'Academic year not found'}, status=404)
                report_card = generation_service.generate_cumulative_report_card(student, year, generated_by=staff)
            else:
                return Response({'error': "report_type must be 'term' or 'cumulative'"}, status=400)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        return Response(ReportCardSerializer(report_card, context={'request': request}).data, status=201)

    @action(detail=False, methods=['post'])
    def generate_class(self, request):
        """
        Body: { grade, section, academic_year_id, report_type: 'term'|'cumulative', term_id (required if 'term') }.
        Admin only. Generates for every active student in the class; one
        student with no results yet doesn't block the rest.
        """
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        school_id = get_verified_school_id(request)
        grade = request.data.get('grade')
        section = request.data.get('section', '')
        academic_year_id = request.data.get('academic_year_id')
        report_type = request.data.get('report_type')
        term_id = request.data.get('term_id')

        if not (grade and academic_year_id and report_type):
            return Response({'error': 'grade, academic_year_id and report_type are required'}, status=400)

        from schools.models import School
        school = School.objects.filter(id=school_id).first()
        year = AcademicYear.objects.filter(id=academic_year_id, school_id=school_id).first()
        if not (school and year):
            return Response({'error': 'Academic year not found'}, status=404)

        term = None
        if report_type == 'term':
            term = Term.objects.filter(id=term_id, school_id=school_id).first()
            if not term:
                return Response({'error': 'Term not found'}, status=404)

        staff = _staff_profile(request)
        try:
            successes, failures = generation_service.generate_for_class(
                school, year, int(grade), section, report_type, term=term, generated_by=staff,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        return Response({
            'generated': ReportCardSerializer(successes, many=True, context={'request': request}).data,
            'failed': failures,
        }, status=201)

    @action(detail=True, methods=['post'])
    def release(self, request, pk=None):
        """Admin only — flips a draft report card to released, visible to parents."""
        if not _is_admin(request):
            return Response({'error': 'Admin only'}, status=403)

        report_card = self.get_object()
        if report_card.status == 'released':
            return Response({'error': 'Already released'}, status=400)

        staff = _staff_profile(request)
        report_card = generation_service.release_report_card(report_card, released_by=staff)
        return Response(ReportCardSerializer(report_card, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def comment(self, request, pk=None):
        """
        Body: { comment }. The homeroom teacher for this report card's
        class (or an admin) can set/update the remark — only while still
        in draft, since a released PDF is a signed document and
        shouldn't quietly change underneath a parent who already has it.
        """
        report_card = self.get_object()

        if not _is_admin(request):
            staff = _staff_profile(request)
            if not staff or not _teacher_owns_homeroom(staff, report_card.grade, report_card.section, report_card.academic_year_id):
                return Response({'error': 'You are not the homeroom teacher for this class'}, status=403)
        else:
            staff = _staff_profile(request)

        if report_card.status == 'released':
            return Response({'error': 'This report card has already been released and can no longer be edited'}, status=400)

        report_card.homeroom_comment = request.data.get('comment', '')
        report_card.comment_by = staff
        report_card.save(update_fields=['homeroom_comment', 'comment_by'])
        # Comment is part of the printed PDF, so re-render it to match.
        from .services.pdf_service import render_report_card_pdf
        report_card.pdf_file = render_report_card_pdf(report_card)
        report_card.save(update_fields=['pdf_file'])

        return Response(ReportCardSerializer(report_card, context={'request': request}).data)
