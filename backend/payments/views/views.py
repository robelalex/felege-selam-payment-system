# backend/payments/views/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from payments.models import Payment, PaymentDeadline
from students.models import Student
from payments.serializers import PaymentSerializer, PaymentDeadlineSerializer
from academics.models import AcademicYear


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer

    def get_queryset(self):
        """
        Filter payments by school AND academic year.

        ✅ FIX: We now filter by deadline__academic_year (FK) instead of
        student__academic_year (CharField). This means a payment is always
        anchored to the year its deadline was created in.

        After year promotion:
          - Students move to 2021 ✅
          - Their 2020 payments stay linked to 2020 deadlines ✅
          - 2021 view shows ONLY new 2021 payments ✅
        """
        school_id = self.request.headers.get('X-School-ID')
        year_id = self.request.query_params.get('academic_year_id')

        print(f"💰 PaymentViewSet.get_queryset - X-School-ID: {school_id}")
        print(f"💰 PaymentViewSet.get_queryset - year_id: {year_id}")

        queryset = Payment.objects.filter(is_archived=False)

        if not school_id:
            print("💰 No school header - returning empty")
            return Payment.objects.none()

        try:
            school_id_int = int(school_id)
            queryset = queryset.filter(student__school_id=school_id_int)
            print(f"💰 Filtered by school ID: {school_id_int}, count: {queryset.count()}")
        except ValueError:
            print(f"💰 Invalid school ID: {school_id}")
            return Payment.objects.none()

        # ✅ FIX: Filter by deadline's academic year FK — not student's current year
        if year_id:
            try:
                academic_year = AcademicYear.objects.get(
                    id=int(year_id),
                    school_id=school_id_int
                )
                print(f"💰 Academic year: {academic_year.name}")

                queryset = queryset.filter(deadline__academic_year=academic_year)
                print(f"💰 Payment count after year filter: {queryset.count()}")

            except AcademicYear.DoesNotExist:
                print("💰 Academic year not found for this school - returning empty")
                return Payment.objects.none()
            except ValueError:
                print(f"💰 Invalid year_id: {year_id}")
                return Payment.objects.none()

        return queryset

    def list(self, request, *args, **kwargs):
        print("💰 ===== PAYMENT LIST CALLED =====")
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        print(f"💰 Returning {len(serializer.data)} payments")
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def initiate_payment(self, request):
        """Parent initiates a payment for a specific student and deadline (one at a time)"""
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method', 'telebirr')
        paid_by = request.data.get('paid_by')
        paid_by_phone = request.data.get('paid_by_phone')
        school_id = request.headers.get('X-School-ID')

        if not student_id:
            return Response({'error': 'student_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not deadline_id:
            return Response({'error': 'deadline_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not amount:
            return Response({'error': 'amount is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.get(student_id=student_id)

            if school_id and str(student.school_id) != school_id:
                return Response({'error': 'Student does not belong to your school'}, status=403)

            deadline = PaymentDeadline.objects.get(id=deadline_id)

            if school_id and str(deadline.school_id) != school_id:
                return Response({'error': 'Deadline does not belong to your school'}, status=403)

            if not paid_by:
                if request.user and request.user.is_authenticated:
                    paid_by = request.user.get_full_name() or request.user.username
                else:
                    paid_by = 'Anonymous User'

            if not paid_by_phone:
                paid_by_phone = 'Not provided'

            payment = Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method=payment_method,
                paid_by=paid_by,
                paid_by_phone=paid_by_phone,
                status='pending'
            )

            serializer = self.get_serializer(payment)
            return Response({
                'success': True,
                'message': 'Payment initiated successfully',
                'payment': serializer.data,
            }, status=status.HTTP_201_CREATED)

        except Student.DoesNotExist:
            return Response({'error': f'Student with ID {student_id} not found'}, status=404)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': f'Payment deadline with ID {deadline_id} not found'}, status=404)
        except Exception as e:
            return Response(
                {'error': f'Payment initiation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def verify_payment(self, request, pk=None):
        """Admin verifies a payment"""
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')

        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)

        payment.status = 'verified'
        payment.verified_at = timezone.now()
        payment.verified_by = request.user
        payment.save()

        return Response({'success': True, 'message': 'Payment verified successfully'})

    @action(detail=False, methods=['get'])
    def pending_verifications(self, request):
        """Get all payments pending verification for the current school"""
        school_id = request.headers.get('X-School-ID')

        if not school_id:
            return Response([], status=200)

        pending_payments = Payment.objects.filter(
            status='pending',
            student__school_id=int(school_id)
        )
        serializer = self.get_serializer(pending_payments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def archive_payment(self, request, pk=None):
        """Move a payment to history (archive)"""
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')

        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)

        payment.is_archived = True
        payment.archived_at = timezone.now()
        payment.save()
        return Response({'success': True, 'message': 'Payment moved to history'}, status=200)

    @action(detail=False, methods=['post'])
    def bulk_archive(self, request):
        """Move multiple payments to history at once"""
        payment_ids = request.data.get('payment_ids', [])
        school_id = request.headers.get('X-School-ID')

        if not payment_ids:
            return Response({'error': 'No payment IDs provided'}, status=400)
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)

        payments = Payment.objects.filter(
            id__in=payment_ids,
            student__school_id=int(school_id),
            is_archived=False
        )

        if payments.count() == 0:
            return Response({'error': 'No matching payments found'}, status=404)

        count = payments.count()
        payments.update(is_archived=True, archived_at=timezone.now())

        return Response({
            'success': True,
            'message': f'Moved {count} payment(s) to history',
            'archived_count': count,
        }, status=200)

    @action(detail=False, methods=['get'])
    def history(self, request):
        """Return all archived payments for this school"""
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response([], status=200)

        # ✅ Also filter history by academic year if provided
        year_id = request.query_params.get('academic_year_id')

        queryset = Payment.objects.filter(
            student__school_id=int(school_id),
            is_archived=True
        )

        if year_id:
            try:
                academic_year = AcademicYear.objects.get(
                    id=int(year_id),
                    school_id=int(school_id)
                )
                queryset = queryset.filter(deadline__academic_year=academic_year)
            except (AcademicYear.DoesNotExist, ValueError):
                pass

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def permanent_delete(self, request, pk=None):
        """Permanently delete an archived payment"""
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')

        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)

        if not payment.is_archived:
            return Response({'error': 'Only archived payments can be permanently deleted'}, status=400)

        payment.delete()
        return Response({'success': True, 'message': 'Payment permanently deleted'}, status=200)


class PaymentDeadlineViewSet(viewsets.ModelViewSet):
    queryset = PaymentDeadline.objects.all()
    serializer_class = PaymentDeadlineSerializer

    def get_queryset(self):
        """Filter deadlines by school from header, optionally by academic year"""
        school_id = self.request.headers.get('X-School-ID')

        if not school_id:
            return PaymentDeadline.objects.none()

        try:
            school_id_int = int(school_id)
        except ValueError:
            return PaymentDeadline.objects.none()

        queryset = PaymentDeadline.objects.filter(school_id=school_id_int)

        # ✅ Also allow filtering deadlines by academic year
        year_id = self.request.query_params.get('academic_year_id')
        if year_id:
            try:
                queryset = queryset.filter(academic_year_id=int(year_id))
            except ValueError:
                pass

        return queryset

    def perform_create(self, serializer):
        """Auto-set school from header when creating a deadline"""
        from schools.models import School
        from rest_framework import serializers as drf_serializers

        school_id = self.request.headers.get('X-School-ID')
        if not school_id:
            raise drf_serializers.ValidationError({'error': 'School ID required (X-School-ID header)'})

        try:
            school = School.objects.get(id=int(school_id))
            serializer.save(school=school)
        except School.DoesNotExist:
            raise drf_serializers.ValidationError({'error': 'School not found'})

    @action(detail=False, methods=['get'])
    def active_deadlines(self, request):
        """Get active payment deadlines for the current school, filtered by year"""
        school_id = request.headers.get('X-School-ID')

        if not school_id:
            return Response([], status=200)

        queryset = PaymentDeadline.objects.filter(
            school_id=int(school_id),
            is_active=True
        )

        # ✅ Filter active deadlines by academic year
        year_id = request.query_params.get('academic_year_id')
        if year_id:
            try:
                queryset = queryset.filter(academic_year_id=int(year_id))
            except ValueError:
                pass

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# ===== STANDALONE FUNCTION =====
@api_view(['GET'])
def payments_filtered_by_year(request):
    """
    Get payments filtered by academic year AND school.

    ✅ FIX: Filter via deadline__academic_year FK instead of
    student__academic_year CharField.
    """
    year_id = request.query_params.get('academic_year_id')
    school_id = request.headers.get('X-School-ID')

    print("💰 ===== PAYMENTS FILTERED BY YEAR =====")
    print(f"💰 year_id: {year_id}")
    print(f"💰 school_id: {school_id}")

    if not year_id or not school_id:
        return Response([], status=200)

    try:
        school_id = int(school_id)
        year_id = int(year_id)
    except ValueError:
        return Response([], status=200)

    try:
        academic_year = AcademicYear.objects.get(id=year_id, school_id=school_id)
    except AcademicYear.DoesNotExist:
        return Response([], status=200)

    print(f"💰 Academic year: {academic_year.name}")

    # ✅ FIX: anchor to deadline's year, not the student's current year field
    payments = Payment.objects.filter(
        deadline__academic_year=academic_year,
        student__school_id=school_id,
        is_archived=False
    )

    print(f"💰 Payment count: {payments.count()}")

    serializer = PaymentSerializer(payments, many=True)
    return Response(serializer.data)
