# backend/payments/views/registration_views.py
"""
✅ Jimma request #2 — registration fees.

Admin-facing management of RegistrationFeeConfig (school-configurable
new/continuing amounts per academic year) and StudentRegistrationType
(per-student new-vs-continuing classification, auto-detected but
admin-overridable). Same permission tier and school-scoping pattern as
fee_override_views.py — see that file for the rationale.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from ..models import RegistrationFeeConfig, StudentRegistrationType, PaymentDeadline
from ..serializers import RegistrationFeeConfigSerializer, StudentRegistrationTypeSerializer
from ..services.registration_fee_service import (
    get_registration_type,
    set_registration_type_override,
)
from authentication.permissions import CanManagePayments
from common.utils import get_verified_school_id


def _sync_registration_deadline(config):
    """
    ✅ FIX (Jimma request #2 — the missing link): saving a
    RegistrationFeeConfig used to only store the new/continuing amounts.
    Nothing ever created the matching PaymentDeadline row
    (deadline_type='registration'), so every downstream screen that
    finds charges by looping over PaymentDeadline — parent pending
    payments, Chapa checkout, the public Telebirr/cash endpoint,
    SMS/email reminders — had nothing to find. An admin could fill in
    this form, save it successfully, and no student would ever actually
    be billed.

    get_or_create is keyed on exactly the fields the model's
    unique_together already enforces (school, academic_year,
    deadline_type, month=None, grade=None), so this is safe to call on
    every create/update without ever producing a duplicate row.

    deadline.amount is kept equal to new_student_amount purely as a
    readable placeholder for admin list screens (e.g. AdminDeadlines.js)
    — the real per-student charge is still computed fresh from
    RegistrationFeeConfig every time via
    registration_fee_service.get_effective_registration_amount(), which
    ignores this field entirely. Nothing about how the amount is
    actually charged changes here.
    """
    deadline, created = PaymentDeadline.objects.get_or_create(
        school=config.school,
        academic_year=config.academic_year,
        deadline_type='registration',
        month=None,
        grade=None,
        defaults={
            'due_date': config.academic_year.start_date,
            'amount': config.new_student_amount,
            'description': 'One-time registration fee (auto-generated from Registration Fee settings)',
            'is_active': True,
        },
    )
    if not created and (deadline.amount != config.new_student_amount or not deadline.is_active):
        deadline.amount = config.new_student_amount
        deadline.is_active = True
        deadline.save()


class RegistrationFeeConfigViewSet(viewsets.ModelViewSet):
    """
    One row per school per academic year. Admins set/update
    new_student_amount and continuing_student_amount here — "settable
    fresh every academic year" per the request, so there's no default
    carried over automatically; each year needs its own row.
    """
    serializer_class = RegistrationFeeConfigSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = RegistrationFeeConfig.objects.select_related('academic_year', 'created_by')
        if school_id:
            qs = qs.filter(school_id=school_id)
        else:
            qs = qs.none()

        academic_year_id = self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)

        return qs

    def get_object(self):
        obj = super().get_object()
        school_id = get_verified_school_id(self.request)
        if school_id and obj.school_id != school_id:
            raise NotFound('Registration fee configuration not found.')
        return obj

    def perform_create(self, serializer):
        school_id = get_verified_school_id(self.request)
        if not school_id:
            raise PermissionDenied("No school associated with this account.")
        config = serializer.save(school_id=school_id, created_by=self.request.user)
        _sync_registration_deadline(config)

    def perform_update(self, serializer):
        # ✅ FIX: PATCH (the frontend's "Update Amounts" path once a config
        # already exists) previously used ModelViewSet's default
        # perform_update, which never touched PaymentDeadline — so
        # changing the amount here didn't reach the actual billing row.
        config = serializer.save()
        _sync_registration_deadline(config)

    @action(detail=False, methods=['get'], url_path='unpaid-students')
    def unpaid_students(self, request):
        """
        ✅ Admin-facing "who hasn't paid registration" list, filterable by
        grade/section — a separate view from the existing monthly-fee
        unpaid list (MultiSchoolSMSPendingRemindersView), because that
        one filters by deadline.grade, and a registration deadline is
        intentionally never grade-specific (enforced in
        PaymentDeadline.clean()). Grade/section filtering here happens
        against the Student rows directly instead.

        GET /api/registration-fee-configs/unpaid-students/
            ?academic_year_id=<id>&grade=<int>&section=<letter>
        grade and section are both optional.
        """
        from students.models import Student
        from payments.models import Payment, PaymentDeadline
        from payments.services.fee_override_service import get_effective_deadline_amount

        school_id = get_verified_school_id(request)
        if not school_id:
            raise PermissionDenied("No school associated with this account.")

        academic_year_id = request.query_params.get('academic_year_id')
        if not academic_year_id:
            return Response(
                {'error': 'academic_year_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            deadline = PaymentDeadline.objects.select_related('academic_year').get(
                school_id=school_id,
                academic_year_id=academic_year_id,
                deadline_type='registration',
            )
        except PaymentDeadline.DoesNotExist:
            # Not an error — the admin just hasn't set registration fees
            # for this year yet (see RegistrationFeeConfigViewSet above).
            return Response({
                'deadline': None,
                'message': 'No registration fee has been configured for this academic year yet.',
                'total_unpaid': 0,
                'students': [],
            })

        students = Student.objects.filter(school_id=school_id, status='active')

        grade = request.query_params.get('grade')
        if grade and grade not in ('all', 'None'):
            try:
                students = students.filter(grade=int(grade))
            except (ValueError, TypeError):
                pass

        section = request.query_params.get('section')
        if section and section not in ('all', 'None'):
            students = students.filter(section=section)

        paid_student_ids = Payment.objects.filter(
            deadline=deadline,
            status='verified',
        ).values_list('student_id', flat=True)

        unpaid = students.exclude(id__in=paid_student_ids).order_by('grade', 'section', 'first_name')

        data = []
        for s in unpaid:
            effective_amount = get_effective_deadline_amount(s, deadline)
            if effective_amount <= 0:
                # e.g. a manually-set $0 amount for this year — nothing owed.
                continue
            reg_type = get_registration_type(s, deadline.academic_year)
            data.append({
                'student_id': s.student_id,
                'name': s.full_name,
                'grade': s.grade,
                'section': s.section,
                'parent_phone': s.parent_phone,
                'parent_email': s.parent_email,
                'registration_type': reg_type.registration_type if reg_type else None,
                'amount': float(effective_amount),
            })

        return Response({
            'deadline': {
                'id': deadline.id,
                'due_date': deadline.due_date,
                'academic_year': deadline.academic_year.name if deadline.academic_year else None,
            },
            'total_unpaid': len(data),
            'students': data,
        })


class StudentRegistrationTypeViewSet(viewsets.ModelViewSet):
    """
    Read/override a student's new-vs-continuing classification for a
    given academic year. list()/retrieve() auto-detect-and-cache a row
    if one doesn't exist yet (via get_registration_type), so staff always
    see a real classification rather than a gap. Direct create/update
    through the serializer is intentionally blocked in favor of the
    explicit `set_type` action below, which always goes through
    set_registration_type_override() so is_manual_override/set_by stay
    accurate — a plain PATCH could otherwise silently leave those fields
    stale or wrong.
    """
    serializer_class = StudentRegistrationTypeSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        school_id = get_verified_school_id(self.request)
        qs = StudentRegistrationType.objects.select_related('student', 'academic_year', 'set_by')
        if school_id:
            qs = qs.filter(student__school_id=school_id)
        else:
            qs = qs.none()

        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student__student_id=student_id)

        academic_year_id = self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)

        return qs

    @action(detail=False, methods=['get'], url_path='for-student')
    def for_student(self, request):
        """
        GET /api/student-registration-types/for-student/?student_id=...&academic_year_id=...
        Returns the (auto-detected-and-cached, or existing) classification
        for one student/year — the endpoint the admin payment screen calls
        to show "New" or "Continuing" next to a student before an admin
        decides whether to override it.
        """
        from students.models import Student
        from academics.models import AcademicYear

        student_id = request.query_params.get('student_id')
        academic_year_id = request.query_params.get('academic_year_id')
        if not student_id or not academic_year_id:
            return Response(
                {'error': 'student_id and academic_year_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        try:
            student = Student.objects.get(student_id=student_id, school_id=school_id)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        reg_type = get_registration_type(student, academic_year)
        return Response(StudentRegistrationTypeSerializer(reg_type).data)

    @action(detail=False, methods=['get'], url_path='for-grade')
    def for_grade(self, request):
        """
        GET /api/student-registration-types/for-grade/
            ?academic_year_id=<id>&grade=<int|'all'>&section=<letter|'all'>

        ✅ NEW — the bulk-classification screen. list()/retrieve() above
        only return rows that already exist; this endpoint is the one
        that powers "show me every student in Grade 7B so I can bulk-fix
        the ones auto-detection got wrong". It auto-detects-and-caches a
        classification for every matching active student (via
        get_registration_type, same as for_student), so the admin always
        sees a real New/Continuing/Transferred value to correct, never a
        blank.

        Root problem this exists for: auto-detection only sees payment
        history recorded IN THIS SYSTEM. A student promoted from last
        grade whose prior-year payments were never digitized here (paper
        records, cash paid at the office, or simply entered into this
        system for the first time this year) auto-detects as 'new' even
        though they're clearly continuing — this list is how an admin
        finds and bulk-corrects a whole grade/section of those at once
        instead of hunting student by student.
        """
        from students.models import Student
        from academics.models import AcademicYear

        academic_year_id = request.query_params.get('academic_year_id')
        if not academic_year_id:
            return Response(
                {'error': 'academic_year_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        if not school_id:
            raise PermissionDenied("No school associated with this account.")

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        students = Student.objects.filter(school_id=school_id, status='active')

        grade = request.query_params.get('grade')
        if grade and grade not in ('all', 'None'):
            try:
                students = students.filter(grade=int(grade))
            except (ValueError, TypeError):
                pass

        section = request.query_params.get('section')
        if section and section not in ('all', 'None'):
            students = students.filter(section=section)

        students = students.order_by('grade', 'section', 'first_name')

        data = []
        for s in students:
            reg_type = get_registration_type(s, academic_year)
            data.append({
                'student_id': s.student_id,
                'name': s.full_name,
                'grade': s.grade,
                'section': s.section,
                'registration_type': reg_type.registration_type if reg_type else None,
                'is_manual_override': reg_type.is_manual_override if reg_type else False,
            })

        return Response({'academic_year_id': academic_year.id, 'students': data})

    @action(detail=False, methods=['post'], url_path='bulk-set-type')
    def bulk_set_type(self, request):
        """
        POST /api/student-registration-types/bulk-set-type/
        Body: {student_ids: [<student_id str>, ...], academic_year_id, registration_type}

        ✅ NEW — bulk version of set_type, for correcting a whole
        grade/section at once from the for-grade screen above. Reuses
        set_registration_type_override() per student, unchanged, so the
        single-student path and the audit trail (is_manual_override,
        set_by) stay exactly as trustworthy as they already were —
        nothing about how one override is applied or recorded is
        different here, this just loops it. student_ids not belonging to
        this school (or not found) are skipped and reported back, never
        silently dropped.
        """
        from students.models import Student
        from academics.models import AcademicYear

        student_ids = request.data.get('student_ids')
        academic_year_id = request.data.get('academic_year_id')
        registration_type = request.data.get('registration_type')

        if not student_ids or not isinstance(student_ids, list):
            return Response(
                {'error': 'student_ids must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not academic_year_id or not registration_type:
            return Response(
                {'error': 'academic_year_id and registration_type are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if registration_type not in ('new', 'continuing', 'transferred'):
            return Response(
                {'error': "registration_type must be 'new', 'continuing', or 'transferred'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        if not school_id:
            raise PermissionDenied("No school associated with this account.")

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        updated = []
        not_found = []
        for student_id in student_ids:
            try:
                student = Student.objects.get(student_id=student_id, school_id=school_id)
            except Student.DoesNotExist:
                not_found.append(student_id)
                continue
            set_registration_type_override(student, academic_year, registration_type, request.user)
            updated.append(student_id)

        return Response({
            'updated_count': len(updated),
            'updated_student_ids': updated,
            'not_found_student_ids': not_found,
        })

    @action(detail=False, methods=['post'], url_path='set-type')
    def set_type(self, request):
        """
        POST /api/student-registration-types/set-type/
        Body: {student_id, academic_year_id, registration_type}
        Admin override — always wins over auto-detection.
        """
        from students.models import Student
        from academics.models import AcademicYear

        student_id = request.data.get('student_id')
        academic_year_id = request.data.get('academic_year_id')
        registration_type = request.data.get('registration_type')

        if not student_id or not academic_year_id or not registration_type:
            return Response(
                {'error': 'student_id, academic_year_id, and registration_type are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if registration_type not in ('new', 'continuing', 'transferred'):
            return Response(
                {'error': "registration_type must be 'new', 'continuing', or 'transferred'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        school_id = get_verified_school_id(request)
        try:
            student = Student.objects.get(student_id=student_id, school_id=school_id)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            academic_year = AcademicYear.objects.get(id=academic_year_id, school_id=school_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        reg_type = set_registration_type_override(student, academic_year, registration_type, request.user)
        return Response(StudentRegistrationTypeSerializer(reg_type).data)