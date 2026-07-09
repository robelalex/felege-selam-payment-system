# backend/payments/services/receipt_service.py
"""
Handles receipt generation and post-payment notification.
Called once, right when a payment transitions to 'verified'
(from the webhook, from verify-poll, or from slip verification).
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')


def finalize_receipt(payment):
    """
    Ensures payment has both invoice_number and receipt_token.
    Idempotent — safe to call even if already generated.
    """
    changed_fields = []
    if not payment.invoice_number:
        payment.invoice_number = payment.generate_invoice_number()
        changed_fields.append('invoice_number')
    if not payment.receipt_token:
        payment.generate_receipt_token()
        changed_fields.append('receipt_token')
    if changed_fields:
        payment.save(update_fields=changed_fields)
    return payment


def get_receipt_url(payment):
    return f"{FRONTEND_URL}/receipt/{payment.receipt_token}"


def send_payment_success_notifications(payment):
    """
    Sends SMS + Email to the parent confirming the payment, with a link
    to the secure, tokenized receipt page. Fire-and-forget style —
    failures are logged but never block the payment flow itself.
    """
    finalize_receipt(payment)
    receipt_url = get_receipt_url(payment)
    student = payment.student
    school = student.school
    month = payment.deadline.get_month_display() if payment.deadline else ""

    # ---- SMS ----
    if student.parent_phone:
        try:
            from .multi_school_sms_service import MultiSchoolSMSService
            message = (
                f"{school.name}: Payment of {payment.amount} Birr for "
                f"{student.full_name} ({month}) is confirmed.\n"
                f"Receipt: {receipt_url}\n"
                f"Invoice: {payment.invoice_number}"
            )
            sms_service = MultiSchoolSMSService(school.id)
            sms_service.send_sms(student.parent_phone, message, related_to=f"receipt_{payment.id}")
            logger.info(f"✅ Receipt SMS sent for payment {payment.id}")
        except Exception as e:
            logger.warning(f"⚠️ Receipt SMS failed for payment {payment.id}: {e}")

    # ---- Email ----
    parent_email = getattr(student, 'parent_email', None)
    if parent_email:
        try:
            from common.email_service import SchoolEmailService
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #10B981;">✅ Payment Confirmed</h2>
                <p>Dear Parent,</p>
                <p>Your payment for <strong>{student.full_name}</strong> has been received and confirmed.</p>
                <div style="background: #ECFDF5; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10B981;">
                    <p style="margin: 0;"><strong>Month:</strong> {month}</p>
                    <p style="margin: 5px 0;"><strong>Amount:</strong> {payment.amount} Birr</p>
                    <p style="margin: 5px 0;"><strong>Invoice:</strong> {payment.invoice_number}</p>
                </div>
                <a href="{receipt_url}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
                    View / Download Receipt
                </a>
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #E5E7EB;">
                <p style="color: #6B7280; font-size: 12px;">
                    Automated message from {school.name}. Keep this receipt link private — it opens your payment record.
                </p>
            </body>
            </html>
            """
            text_content = (
                f"Payment Confirmed\n\n"
                f"Student: {student.full_name}\nMonth: {month}\nAmount: {payment.amount} Birr\n"
                f"Invoice: {payment.invoice_number}\n\nReceipt: {receipt_url}\n\n"
                f"---\n{school.name}"
            )
            email_service = SchoolEmailService(school.id)
            email_service.send_email(
                recipient_email=parent_email,
                subject=f"Payment Confirmed - {student.full_name} ({payment.invoice_number})",
                html_content=html_content,
                text_content=text_content,
            )
            logger.info(f"✅ Receipt email sent for payment {payment.id}")
        except Exception as e:
            logger.warning(f"⚠️ Receipt email failed for payment {payment.id}: {e}")