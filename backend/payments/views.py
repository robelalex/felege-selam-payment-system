# payments/views.py
from django.db import models
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from .models import Payment, PaymentDeadline, PaymentReminder
from students.models import Student
from .serializers import PaymentSerializer, PaymentDeadlineSerializer
from .services.reminder_service import ReminderService
from academics.models import AcademicYear
from schools.models import School
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        school_id = self.request.headers.get('X-School-ID')
        print(f"💰 PaymentViewSet.get_queryset - X-School-ID: {school_id}")

        if not school_id:
            return Payment.objects.none()

        try:
            return Payment.objects.filter(
                student__school_id=int(school_id),
                is_archived=False
            )
        except ValueError:
            return Payment.objects.none()

    def list(self, request, *args, **kwargs):
        print(f"💰 ===== PAYMENT LIST CALLED =====")
        queryset = self.get_queryset()

        year_id = request.query_params.get('academic_year_id')
        school_id = request.headers.get('X-School-ID')

        if year_id and school_id:
            try:
                academic_year = AcademicYear.objects.get(
                    id=int(year_id), school_id=int(school_id)
                )
                queryset = queryset.filter(
                    deadline__academic_year=academic_year.name,
                    student__school_id=int(school_id),
                    is_archived=False
                )
                print(f"💰 After year filter (deadline_academic_year={academic_year.name}), count: {queryset.count()}")
            except AcademicYear.DoesNotExist:
                print(f"💰 Academic year not found for id={year_id}")
                queryset = queryset.none()
        else:
            if school_id:
                queryset = queryset.filter(
                    student__school_id=int(school_id),
                    is_archived=False
                )
            else:
                queryset = queryset.none()

        serializer = self.get_serializer(queryset, many=True)
        print(f"💰 Returning {len(serializer.data)} payments")
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def initiate_payment(self, request):
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method', 'telebirr')
        paid_by = request.data.get('paid_by')
        paid_by_phone = request.data.get('paid_by_phone')
        school_id = request.headers.get('X-School-ID')

        try:
            student = Student.objects.get(student_id=student_id)
            if school_id and str(student.school_id) != school_id:
                return Response({'error': 'Student does not belong to your school'}, status=403)

            deadline = PaymentDeadline.objects.get(id=deadline_id)
            if school_id and str(deadline.school_id) != school_id:
                return Response({'error': 'Deadline does not belong to your school'}, status=403)

            payment = Payment.objects.create(
                student=student, deadline=deadline, amount=amount,
                payment_method=payment_method, paid_by=paid_by,
                paid_by_phone=paid_by_phone, status='pending'
            )
            serializer = self.get_serializer(payment)
            return Response({
                'success': True,
                'message': 'Payment initiated successfully',
                'payment': serializer.data,
            }, status=status.HTTP_201_CREATED)

        except Student.DoesNotExist:
            return Response({'error': 'Student not found'}, status=404)
        except PaymentDeadline.DoesNotExist:
            return Response({'error': 'Payment deadline not found'}, status=404)

    @action(detail=True, methods=['post'])
    def verify_payment(self, request, pk=None):
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
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response([], status=200)

        pending = Payment.objects.filter(
            status='pending',
            is_archived=False,
            student__school_id=int(school_id)
        )
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def archive_payment(self, request, pk=None):
        """
        Move a payment to history (archive).
        Does NOT delete — verified payments still count as paid
        so the parent portal does not show the month as unpaid again.
        """
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')

        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)

        payment.is_archived = True
        payment.archived_at = timezone.now()
        payment.save()
        print(f"🗃️ Archived payment {payment.id}")
        return Response({'success': True, 'message': 'Payment moved to history'}, status=200)

    @action(detail=False, methods=['post'])
    def bulk_archive(self, request):
        """
        Move multiple payments to history at once.
        """
        payment_ids = request.data.get('payment_ids', [])
        school_id = request.headers.get('X-School-ID')

        if not payment_ids:
            return Response({'error': 'No payment IDs provided'}, status=400)
        if not school_id:
            return Response({'error': 'School ID required'}, status=400)

        try:
            payments = Payment.objects.filter(
                id__in=payment_ids,
                student__school_id=int(school_id),
                is_archived=False
            )

            if payments.count() == 0:
                return Response({'error': 'No matching payments found'}, status=404)

            now = timezone.now()
            count = payments.count()
            payments.update(is_archived=True, archived_at=now)

            print(f"🗃️ Bulk archived {count} payments for school {school_id}")
            return Response({
                'success': True,
                'message': f'Moved {count} payment(s) to history',
                'archived_count': count,
            }, status=200)

        except Exception as e:
            print(f"❌ Bulk archive error: {e}")
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Return all archived payments for this school.
        Used by the Payment History page.
        """
        school_id = request.headers.get('X-School-ID')
        if not school_id:
            return Response([], status=200)

        try:
            queryset = Payment.objects.filter(
                student__school_id=int(school_id),
                is_archived=True
            )

            year_id = request.query_params.get('academic_year_id')
            if year_id:
                try:
                    academic_year = AcademicYear.objects.get(
                        id=int(year_id), school_id=int(school_id)
                    )
                    student_ids = Student.objects.filter(
                        academic_year=academic_year.name,
                        school_id=int(school_id)
                    ).values_list('id', flat=True)
                    queryset = queryset.filter(student_id__in=student_ids)
                except AcademicYear.DoesNotExist:
                    pass

            serializer = self.get_serializer(queryset, many=True)
            print(f"💰 Returning {len(serializer.data)} archived payments")
            return Response(serializer.data)

        except ValueError:
            return Response([], status=200)

    @action(detail=True, methods=['delete'])
    def permanent_delete(self, request, pk=None):
        """
        Permanently delete from history page only.
        Only works on already-archived payments.
        """
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')

        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)

        if not payment.is_archived:
            return Response(
                {'error': 'Only archived payments can be permanently deleted. Archive it first.'},
                status=400
            )

        payment.delete()
        print(f"🗑️ Permanently deleted payment {pk}")
        return Response({'success': True, 'message': 'Payment permanently deleted'}, status=200)


@method_decorator(csrf_exempt, name='dispatch')
class PaymentDeadlineViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentDeadlineSerializer

    def get_queryset(self):
        school_id = self.request.headers.get('X-School-ID')
        grade = self.request.query_params.get('grade')

        if not school_id:
            return PaymentDeadline.objects.none()

        try:
            queryset = PaymentDeadline.objects.filter(school_id=int(school_id))
            if grade:
                queryset = queryset.filter(
                    models.Q(grade=int(grade)) | models.Q(grade__isnull=True)
                )
            return queryset
        except ValueError:
            return PaymentDeadline.objects.none()

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        school_id = self.request.headers.get('X-School-ID')
        grade = self.request.data.get('grade')
        if school_id:
            try:
                serializer.save(school_id=int(school_id), grade=grade if grade else None)
            except ValueError:
                from rest_framework import serializers as s
                raise s.ValidationError({"error": "Invalid school ID"})
        else:
            from rest_framework import serializers as s
            raise s.ValidationError({"error": "School ID required"})

    @action(detail=False, methods=['get'])
    def active_deadlines(self, request):
        school_id = request.headers.get('X-School-ID')
        grade = request.query_params.get('grade')

        if not school_id:
            return Response([], status=200)

        try:
            deadlines = PaymentDeadline.objects.filter(
                school_id=int(school_id), is_active=True
            )
            if grade:
                deadlines = deadlines.filter(
                    models.Q(grade=int(grade)) | models.Q(grade__isnull=True)
                )
        except ValueError:
            deadlines = PaymentDeadline.objects.none()

        serializer = self.get_serializer(deadlines, many=True)
        return Response(serializer.data)


class ReminderViewSet(viewsets.ViewSet):

    @action(detail=False, methods=['get'])
    def pending(self, request):
        year_id = request.query_params.get('academic_year_id')
        month = request.query_params.get('month')
        grade = request.query_params.get('grade')
        school_id = request.headers.get('X-School-ID')

        if not school_id:
            return Response({'error': 'School ID required'}, status=400)

        academic_year_name = None
        if year_id:
            try:
                academic_year = AcademicYear.objects.get(
                    id=int(year_id), school_id=int(school_id)
                )
                academic_year_name = academic_year.name
            except AcademicYear.DoesNotExist:
                return Response({'error': 'Academic year not found'}, status=404)

        service = ReminderService()
        results = service.get_pending_students(
            month=month, grade=grade,
            academic_year=academic_year_name, school_id=school_id
        )
        return Response(results)

    @action(detail=False, methods=['post'])
    def send(self, request):
        student_ids = request.data.get('student_ids', [])
        month = request.data.get('month')
        custom_message = request.data.get('message', '')
        academic_year = request.data.get('academic_year')
        school_id = request.headers.get('X-School-ID')

        if not school_id:
            return Response({'error': 'School ID required'}, status=400)
        if not student_ids:
            return Response({'error': 'No students selected'}, status=400)

        service = ReminderService()
        results = service.send_reminders(
            student_ids, month, custom_message,
            academic_year=academic_year, school_id=school_id
        )
        return Response({
            'success': True,
            'sent': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']]),
            'results': results
        })


@api_view(['GET'])
def payments_filtered_by_year(request):
    year_id = request.query_params.get('academic_year_id')
    school_id = request.headers.get('X-School-ID')

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

    student_ids = Student.objects.filter(
        academic_year=academic_year.name,
        school_id=school_id
    ).values_list('id', flat=True)

    if not student_ids:
        return Response([], status=200)

    payments = Payment.objects.filter(
        student_id__in=student_ids,
        is_archived=False
    )

    serializer = PaymentSerializer(payments, many=True)
    return Response(serializer.data)