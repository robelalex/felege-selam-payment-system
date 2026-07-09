# backend/payments/services/payment_initiation_service.py
"""
Single source of truth for starting a Chapa checkout.
Both the dashboard "Pay Now" button and the OTP-gated reminder-link flow
call THIS function — guaranteeing identical tx_ref behavior, identical
Payment-row bookkeeping, and identical status-lookup behavior for parents,
no matter which door they came in through.
"""
import uuid
import logging
from .school_chapa_service import SchoolChapaService

logger = logging.getLogger(__name__)


def build_tx_ref(payment):
    """
    Unified transaction reference format, used everywhere:
    PAY-{SCHOOLCODE}-{payment.id}-{random8}

    Embeds the school code and the local Payment PK directly in the
    reference, so even just glancing at a tx_ref tells you which school
    and which payment row it belongs to — no more guessing from prefix.
    """
    school = payment.student.school
    school_code = school.code or f"S{school.id}"
    return f"PAY-{school_code}-{payment.id}-{uuid.uuid4().hex[:8]}"


def initiate_payment_checkout(payment, email, first_name, last_name,
                                callback_url, return_url_base):
    """
    Generates a tx_ref, saves it onto the Payment row FIRST, then calls Chapa.
    This ordering is critical: if Chapa's initialize call fails, we still
    have a Payment row we can inspect/retry — and if it succeeds, the
    webhook or verify-poll can always find the row by tx_ref because it
    was written before Chapa was ever contacted.

    Args:
        payment: Payment instance (already exists in DB)
        email, first_name, last_name: passed to Chapa checkout
        callback_url: Chapa webhook URL
        return_url_base: frontend URL to redirect to after payment,
                          tx_ref will be appended as a query param

    Returns:
        dict: {'success': bool, 'checkout_url': str, 'tx_ref': str, 'error': str}
    """
    tx_ref = build_tx_ref(payment)
    payment.transaction_reference = tx_ref
    payment.save(update_fields=['transaction_reference'])

    return_url = f"{return_url_base}?tx_ref={tx_ref}"

    chapa_service = SchoolChapaService(payment.student.school_id)
    result = chapa_service.initialize_payment(
        amount=float(payment.amount),
        email=email,
        first_name=first_name,
        last_name=last_name,
        tx_ref=tx_ref,
        callback_url=callback_url,
        return_url=return_url,
    )

    if result.get('success'):
        logger.info(f"✅ Unified checkout initiated for payment {payment.id}, tx_ref={tx_ref}")
        return {'success': True, 'checkout_url': result['checkout_url'], 'tx_ref': tx_ref}
    else:
        logger.error(f"❌ Unified checkout failed for payment {payment.id}: {result.get('error')}")
        return {'success': False, 'error': result.get('error', 'Chapa error'), 'tx_ref': tx_ref}