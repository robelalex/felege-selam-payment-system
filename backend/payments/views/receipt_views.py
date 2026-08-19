# backend/payments/views/receipt_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from ..models import Payment


@api_view(['GET'])
@permission_classes([AllowAny])
def get_receipt(request, token):
    """
    GET /api/receipt/<token>/
    Public receipt lookup by unguessable UUID token.
    Only returns data for payments that are actually verified —
    a pending/failed payment has no receipt to show.
    """
    try:
        payment = Payment.objects.select_related(
            'student', 'student__school', 'deadline'
        ).get(receipt_token=token, status='verified')
    except (Payment.DoesNotExist, ValueError):
        return Response({'error': 'Receipt not found'}, status=404)

    student = payment.student
    school = student.school
    is_registration = bool(payment.deadline and payment.deadline.deadline_type == 'registration')

    return Response({
        'invoice_number': payment.invoice_number,
        'school_name': school.name,
        'school_code': school.code,
        'student_name': student.full_name,
        'student_id': student.student_id,
        'grade': student.grade,
        'section': student.section,
        # ✅ FIX: get_month_display() rendered blank for a registration
        # deadline (month is always None there) — the receipt page showed
        # "Month: —" for a registration fee receipt. display_label
        # correctly reads "Registration Fee" instead.
        'month': payment.deadline.display_label if payment.deadline else None,
        'fee_type': payment.deadline.deadline_type if payment.deadline else None,
        'is_registration': is_registration,
        'academic_year': payment.deadline.academic_year.name if payment.deadline and payment.deadline.academic_year else None,
        'amount': str(payment.amount),
        'currency': 'ETB',
        'payment_method': payment.payment_method,
        'transaction_reference': payment.transaction_reference,
        'paid_by': payment.paid_by,
        'verified_at': payment.verified_at.isoformat() if payment.verified_at else None,
    })