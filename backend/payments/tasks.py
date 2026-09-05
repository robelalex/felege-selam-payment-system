# backend/payments/tasks.py
"""
Background tasks for async bank slip verification via Verify.ET API.
Uses Django-Q to process verifications without blocking HTTP requests.

FIXED: Verify.ET's real response envelope (per https://verify.et/docs/api) is:

  POST /api/verify (200, completed):
    {
      "data": [ { "bank", "status", "verified", "amount", "currency",
                  "senderName", "receiverName", "referenceNumber", ... } ],
      "verification": { "requestId", "processingStatus", "status", "verified" },
      "links": { "statusUrl": ... }
    }

  POST /api/verify (202, queued):
    {
      "data": [],
      "statusUrl": "...",
      "verification": { "processingStatus": "queued", "status": "pending", "verified": false },
      "links": { "statusUrl", "pollAfterMs", "webhookRegistered" }
    }

  GET /api/verify/:requestId (status poll — THIN, no transaction fields!):
    {
      "data": { "requestId", "bank", "processingStatus", "status", "verified", "completedAt" }
    }

Key fixes vs. the previous version:
  1. "verification"/poll "data" NEVER contains amount/senderName/etc. Those only
     live in the top-level `data` LIST returned by the 200-completed POST response
     (or in the webhook payload). The old code looked for
     verification.get('data', {}) / verification.get('transaction', {}), which is
     always empty -> Amount: None.
  2. The terminal "success" state is reported as status == "success" (not
     "verified"). The old poller compared against the literal string "verified",
     which never matched, so every poll fell into the "pending" branch until
     timeout.
  3. Because the GET status-poll endpoint doesn't carry transaction fields, once
     processingStatus == "completed" we re-issue the original POST with the SAME
     Idempotency-Key to fetch the full transaction payload (the API returns the
     cached result for a reused idempotency key). This avoids ever inventing data
     from an endpoint that doesn't provide it.
"""

import time
import uuid
import requests
from django.utils import timezone
from payments.models import PaymentSlip, Payment, PaymentDeadline
from schools.models import School
from students.models import Student
from datetime import timedelta


def _build_verify_payload(clean_ref: str, school) -> dict:
    payload = {
        "bank": "cbe",
        "referenceNumber": clean_ref,
        "accountSuffix": school.cbe_account_suffix,
    }
    if school.cbe_account_number:
        payload["settlementAccount"] = school.cbe_account_number
    return payload


def verify_slip_async(slip_id: int, school_id: int):
    """
    Background task: Submit slip to Verify.ET -> Return immediately if queued.
    Polling is handled by separate lightweight tasks to avoid blocking workers.
    """
    try:
        slip = PaymentSlip.objects.select_related('student', 'deadline').get(id=slip_id)
        school = School.objects.get(id=school_id)

        print(f"[Q] \u2705 Task started for slip #{slip_id} | School: {school.name}")

        if slip.verification_status in ('verified', 'rejected', 'queued', 'processing'):
            print(f"[Q] \u23ed\ufe0f Slip #{slip_id} already {slip.verification_status}, skipping")
            return

        if not slip.transaction_reference:
            slip.verification_status = 'manual_review'
            slip.verification_error = 'No transaction reference detected by AI'
            slip.save(update_fields=['verification_status', 'verification_error'])
            print(f"[Q] \u274c No reference for slip #{slip_id}")
            return

        if not all([school.verify_et_api_key, school.verify_et_enabled, school.cbe_account_suffix]):
            slip.verification_status = 'manual_review'
            slip.verification_error = 'Verify.ET not configured for this school'
            slip.save(update_fields=['verification_status', 'verification_error'])
            print(f"[Q] \u274c Verify.ET not configured for school #{school_id}")
            return

        clean_ref = slip.transaction_reference.split('&')[0].strip()

        # waitMs is passed as a query param per the docs, not in the JSON body.
        api_url = "https://verify.et/api/verify?waitMs=5000"
        # Fresh idempotency key on every initial submit so a previous cached
        # FAILED result is never returned. A stable key is only used when
        # re-POSTing after a SUCCESSFUL poll to retrieve the full payload.
        idempotency_key = f"slip-{slip.id}-{clean_ref}-{uuid.uuid4().hex[:8]}"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": school.verify_et_api_key,
            "Idempotency-Key": idempotency_key,
        }
        payload = _build_verify_payload(clean_ref, school)

        print(f"[Q] \U0001F4E1 Submitting ref={clean_ref} to Verify.ET...")

        response = requests.post(api_url, json=payload, headers=headers, timeout=10)

        # \u2500\u2500 IMMEDIATE COMPLETION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        if response.status_code == 200:
            data = response.json()
            # Verify.ET can return HTTP 200 with success:False when CBE is
            # synchronously unavailable. This is NOT a verified result.
            if not data.get("success", True):
                error_block = data.get("error") or {}
                error_code = error_block.get("code", "unknown")
                retryable = error_block.get("retryable", False)
                error_msg = data.get("message") or error_block.get("message") or "Upstream error"
                print(f"[Q] ⚠️ 200 but success=False for slip #{slip_id}: {error_code} | {error_msg}")
                slip.verification_status = "manual_review" if retryable else "failed"
                slip.verify_et_status = "failed"
                slip.verification_error = f"Bank unavailable ({error_code}): {error_msg}"
                slip.verify_et_checked_at = timezone.now()
                slip.save(update_fields=[
                    "verification_status", "verify_et_status",
                    "verification_error", "verify_et_checked_at"
                ])
                return
            _process_verify_et_result(slip, data, clean_ref)
            return

        # \u2500\u2500 QUEUED: schedule first poll as a SEPARATE task (non-blocking) \u2500\u2500
        elif response.status_code == 202:
            data = response.json()
            verification = data.get('verification', {})
            request_id = data.get('requestId') or verification.get('requestId')
            status_url = (
                data.get('links', {}).get('statusUrl')
                or data.get('statusUrl')
            )

            if not status_url:
                slip.verification_status = 'manual_review'
                slip.verification_error = 'API returned 202 but no status URL provided'
                slip.verify_et_status = 'error'
                slip.save(update_fields=[
                    'verification_status', 'verification_error', 'verify_et_status'
                ])
                print(f"[Q] \u274c No status URL for slip #{slip_id}")
                return

            full_url = f"https://verify.et{status_url}" if status_url.startswith('/') else status_url
            print(f"[Q] \U0001F504 Queued. Scheduling first poll in 5s...")

            from django_q.tasks import async_task
            async_task(
                'payments.tasks.poll_verify_et_status',
                slip.id,
                school_id,
                full_url,
                school.verify_et_api_key,
                clean_ref,
                idempotency_key,
                attempt=1,
                max_attempts=8,  # widened: completion can lag past 5 short retries
            )

            slip.verification_status = 'queued'
            slip.verify_et_status = 'polling'
            slip.save(update_fields=['verification_status', 'verify_et_status'])
            return

        # \u2500\u2500 OTHER ERRORS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        else:
            slip.verification_status = 'failed'
            slip.verify_et_status = 'error'
            slip.verification_error = f'API returned HTTP {response.status_code}'
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            print(f"[Q] \u274c API error {response.status_code} for slip #{slip_id}")
            return

    except PaymentSlip.DoesNotExist:
        print(f"[Q] \u274c Slip #{slip_id} not found")
    except School.DoesNotExist:
        print(f"[Q] \u274c School #{school_id} not found")
    except Exception as e:
        print(f"[Q] \U0001F4A5 Unexpected error for slip #{slip_id}: {e}")
        try:
            slip = PaymentSlip.objects.get(id=slip_id)
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Unexpected error: {str(e)[:200]}'
            slip.save(update_fields=['verification_status', 'verification_error'])
        except Exception:
            pass


def poll_verify_et_status(slip_id: int, school_id: int, status_url: str,
                           api_key: str, clean_ref: str, idempotency_key: str,
                           attempt: int, max_attempts: int):
    """
    Lightweight polling task - runs for <10s then exits.
    Schedules next poll if still pending. NEVER blocks worker long-term.

    IMPORTANT: GET /api/verify/:requestId only returns status flags
    (processingStatus / status / verified) — never amount/senderName/etc.
    Once processingStatus == "completed", we re-POST /api/verify with the
    SAME Idempotency-Key to retrieve the full transaction payload.
    """
    try:
        slip = PaymentSlip.objects.get(id=slip_id)

        if slip.verification_status in ('verified', 'failed', 'manual_review', 'timeout'):
            print(f"[Q-POLL] \u23ed\ufe0f Slip #{slip_id} already resolved, stopping polls")
            return

        print(f"[Q-POLL] \U0001F504 Attempt {attempt}/{max_attempts} for slip #{slip_id}")

        headers = {"Content-Type": "application/json", "x-api-key": api_key}
        poll_response = requests.get(status_url, headers=headers, timeout=10)

        if poll_response.status_code == 200:
            poll_data = poll_response.json()
            status_block = poll_data.get('data', {}) or {}
            processing_status = status_block.get('processingStatus', 'queued')
            outcome_status = status_block.get('status', 'pending')  # "pending" | "success" | "failed"
            verified_flag = status_block.get('verified', False)

            print(
                f"[Q-POLL-DEBUG] Slip #{slip_id} | processingStatus={processing_status} "
                f"status={outcome_status} verified={verified_flag} | raw={poll_data}"
            )

            # BOTH "completed" and "failed" are terminal values for
            # processingStatus. Only "queued"/"running" mean "still going".
            if processing_status not in ('completed', 'failed'):
                _schedule_next_poll(slip_id, school_id, status_url, api_key,
                                     clean_ref, idempotency_key, attempt, max_attempts)
                return

            if processing_status == 'completed' and outcome_status == 'success' and verified_flag:
                full_data = _fetch_full_result_via_idempotent_repost(
                    clean_ref, school_id, api_key, idempotency_key
                )
                if full_data is not None:
                    _process_verify_et_result(slip, full_data, clean_ref)
                else:
                    slip.verification_status = 'manual_review'
                    slip.verification_error = (
                        'Verification completed but full transaction payload '
                        'could not be retrieved (idempotent re-POST failed)'
                    )
                    slip.verify_et_checked_at = timezone.now()
                    slip.save(update_fields=[
                        'verification_status', 'verification_error', 'verify_et_checked_at'
                    ])
                return

            # processing_status == "failed" -> this requestId is permanently
            # dead. Never poll it again; either resubmit fresh, or give up.
            error_block = status_block.get('error') or {}
            error_code = error_block.get('code', '')
            retryable = error_block.get('retryable', False)
            error_message = status_block.get('errorMessage') or error_code or 'Verification failed'

            if retryable and attempt < max_attempts:
                print(f"[Q-POLL] \u26a0\ufe0f Retryable upstream failure ({error_code}) on slip "
                      f"#{slip_id}: {error_message}. Re-submitting fresh request.")
                delays = [5, 10, 20, 30, 30, 30, 30, 30]
                next_delay = delays[min(attempt, len(delays) - 1)]

                from django_q.tasks import schedule
                schedule(
                    'payments.tasks.resubmit_verify_et_request',
                    slip_id,
                    school_id,
                    clean_ref,
                    attempt=attempt + 1,
                    max_attempts=max_attempts,
                    next_run=timezone.now() + timedelta(seconds=next_delay)
                )
                slip.verification_error = f'Retrying after upstream issue: {error_message}'
                slip.save(update_fields=['verification_error'])
                return

            slip.verification_status = 'manual_review' if retryable else 'failed'
            slip.verify_et_status = 'failed'
            slip.verification_error = error_message
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            print(f"[Q-POLL] \u274c Terminal failure on attempt {attempt}: {error_message}")
            return

        elif poll_response.status_code == 404:
            _schedule_next_poll(slip_id, school_id, status_url, api_key,
                                 clean_ref, idempotency_key, attempt, max_attempts)
            return

        else:
            print(f"[Q-POLL] \u26a0\ufe0f Unexpected poll status {poll_response.status_code} for slip #{slip_id}")
            _schedule_next_poll(slip_id, school_id, status_url, api_key,
                                 clean_ref, idempotency_key, attempt, max_attempts)
            return

    except Exception as e:
        print(f"[Q-POLL] \u26a0\ufe0f Poll error for slip #{slip_id}: {e}")
        try:
            slip = PaymentSlip.objects.get(id=slip_id)
            if slip.verification_status == 'queued':
                slip.verification_status = 'manual_review'
                slip.verification_error = f'Polling failed: {str(e)[:200]}'
                slip.save(update_fields=['verification_status', 'verification_error'])
        except Exception:
            pass


def resubmit_verify_et_request(slip_id: int, school_id: int, clean_ref: str,
                                attempt: int, max_attempts: int):
    """
    Called when a previous Verify.ET request died with a retryable upstream
    error (e.g. CBE timeout). A dead requestId can never become "completed" -
    polling it forever is pointless. This submits a brand-new POST /api/verify
    with a fresh Idempotency-Key and starts a new poll chain for it.
    """
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        school = School.objects.get(id=school_id)

        if slip.verification_status in ('verified', 'rejected', 'failed', 'manual_review'):
            print(f"[Q-RESUBMIT] \u23ed\ufe0f Slip #{slip_id} already resolved, skipping resubmit")
            return

        idempotency_key = f"slip-{slip.id}-{clean_ref}-retry{attempt}-{uuid.uuid4().hex[:8]}"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": school.verify_et_api_key,
            "Idempotency-Key": idempotency_key,
        }
        payload = _build_verify_payload(clean_ref, school)

        print(f"[Q-RESUBMIT] \U0001F4E1 Re-submitting ref={clean_ref} for slip #{slip_id} (attempt {attempt})")
        response = requests.post(
            "https://verify.et/api/verify?waitMs=5000",
            json=payload, headers=headers, timeout=10
        )

        if response.status_code == 200:
            _process_verify_et_result(slip, response.json(), clean_ref)
            return

        elif response.status_code == 202:
            data = response.json()
            status_url = data.get('links', {}).get('statusUrl') or data.get('statusUrl')
            if not status_url:
                slip.verification_status = 'manual_review'
                slip.verification_error = 'Resubmit returned 202 but no status URL'
                slip.save(update_fields=['verification_status', 'verification_error'])
                return
            full_url = f"https://verify.et{status_url}" if status_url.startswith('/') else status_url

            from django_q.tasks import async_task
            async_task(
                'payments.tasks.poll_verify_et_status',
                slip.id, school_id, full_url, school.verify_et_api_key,
                clean_ref, idempotency_key,
                attempt=attempt, max_attempts=max_attempts,
            )
            return

        else:
            slip.verification_status = 'failed'
            slip.verify_et_status = 'error'
            slip.verification_error = f'Resubmit API returned HTTP {response.status_code}'
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            return

    except Exception as e:
        print(f"[Q-RESUBMIT] \U0001F4A5 Error resubmitting slip #{slip_id}: {e}")
        try:
            slip = PaymentSlip.objects.get(id=slip_id)
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Resubmit failed: {str(e)[:200]}'
            slip.save(update_fields=['verification_status', 'verification_error'])
        except Exception:
            pass


def _schedule_next_poll(slip_id, school_id, status_url, api_key, clean_ref,
                         idempotency_key, attempt, max_attempts):
    """Handle timeout vs. scheduling the next backoff attempt."""
    if attempt >= max_attempts:
        try:
            slip = PaymentSlip.objects.get(id=slip_id)
            slip.verification_status = 'timeout'
            slip.verify_et_status = 'timeout'
            slip.verification_error = f'Verification timed out after {max_attempts} attempts'
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            print(f"[Q-POLL] \u23f1\ufe0f Timeout for slip #{slip_id}")
        except PaymentSlip.DoesNotExist:
            pass
        return

    delays = [5, 10, 20, 30, 30, 30, 30, 30]
    next_delay = delays[min(attempt, len(delays) - 1)]

    from django_q.tasks import schedule
    schedule(
        'payments.tasks.poll_verify_et_status',
        slip_id,
        school_id,
        status_url,
        api_key,
        clean_ref,
        idempotency_key,
        attempt=attempt + 1,
        max_attempts=max_attempts,
        next_run=timezone.now() + timedelta(seconds=next_delay)
    )
    print(f"[Q-POLL] \u23f3 Scheduled next poll in {next_delay}s")


def _fetch_full_result_via_idempotent_repost(clean_ref: str, school_id: int,
                                              api_key: str, idempotency_key: str):
    """
    Once processingStatus == 'completed', GET /api/verify/:requestId still won't
    carry amount/senderName/etc (per the documented contract). Re-POST the
    original request with the same Idempotency-Key: the API returns the cached
    completed result, which DOES include the full `data` array.
    """
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        return None

    payload = _build_verify_payload(clean_ref, school)
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "Idempotency-Key": idempotency_key,
    }
    try:
        resp = requests.post(
            "https://verify.et/api/verify?waitMs=0",
            json=payload, headers=headers, timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        print(f"[Q-POLL] \u26a0\ufe0f Idempotent re-POST returned {resp.status_code}: {resp.text[:300]}")
        return None
    except Exception as e:
        print(f"[Q-POLL] \u26a0\ufe0f Idempotent re-POST failed: {e}")
        return None


def _process_verify_et_result(slip: PaymentSlip, data: dict, clean_ref: str):
    """
    Process a completed Verify.ET response and create a Payment record.
    Automatically sends dual-channel notifications (Email + SMS) upon success.
    """
    try:
        print(f"[Q-DEBUG] Full API response for slip #{slip.id}: {data}")

        results = data.get('data') or []
        tx_data = results[0] if isinstance(results, list) and results else {}
        verification = data.get('verification', {}) or {}

        payer_name = tx_data.get('senderName') or ''
        receiver = tx_data.get('receiverName') or ''
        bank_amount = tx_data.get('amount')
        tx_date = tx_data.get('timestamp') or ''
        is_verified_flag = tx_data.get('verified', verification.get('verified', False))
        tx_status = tx_data.get('status') or verification.get('status')

        # Handle incomplete/unverified results
        if bank_amount is None or not is_verified_flag or tx_status != 'success':
            print(f"[Q-WARN] ⚠️ Incomplete result for slip #{slip.id}")
            slip.verify_et_status = tx_status or 'unknown'
            slip.verify_et_payer_name = payer_name
            slip.verify_et_amount = bank_amount
            slip.verify_et_date = tx_date
            slip.verify_et_receiver = receiver
            slip.verify_et_response_raw = data
            slip.verify_et_checked_at = timezone.now()
            slip.verification_status = 'manual_review'
            slip.verification_error = 'Verify.ET returned an incomplete or unverified result'
            slip.save()
            return

        # Check amount match (within 1 Birr tolerance)
        amount_matches = False
        try:
            diff = abs(float(bank_amount) - float(slip.amount))
            amount_matches = diff <= 1.0
        except (ValueError, TypeError):
            pass

        # Update slip with verified data
        slip.verify_et_status = 'verified'
        slip.verify_et_payer_name = payer_name
        slip.verify_et_amount = bank_amount
        slip.verify_et_date = tx_date
        slip.verify_et_receiver = receiver
        slip.verify_et_response_raw = data
        slip.verify_et_checked_at = timezone.now()

        if amount_matches:
            slip.verification_status = 'verified'
            slip.status = 'verified'
            slip.verified_at_system = timezone.now()
            slip.cbe_verification_status = 'cbe_verified'
            slip.cbe_check_method = 'api'
            slip.cbe_verified_at = timezone.now()
        else:
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Amount mismatch: declared={slip.amount}, bank={bank_amount}'

        slip.save()
        print(f"[Q] ✅ Verified slip #{slip.id} | Payer: {payer_name} | Amount: {bank_amount}")

        # Create payment record if verified
        if slip.verification_status == 'verified':
            existing = Payment.objects.filter(
                student=slip.student,
                deadline=slip.deadline,
                status='verified'
            ).exists()

            if not existing:
                Payment.objects.create(
                    student=slip.student,
                    deadline=slip.deadline,
                    amount=bank_amount,
                    payment_method='bank_transfer',
                    transaction_reference=clean_ref,
                    status='verified',
                    verified_by=None,
                    paid_by=payer_name or slip.uploaded_by,
                    paid_by_phone='',
                    is_from_slip=True,
                    slip=slip,
                    verified_at=timezone.now(),
                )
                print(f"[Q] 💰 Payment record created for slip #{slip.id}")

                # ✅ NEW: Trigger dual-channel notification immediately
                try:
                    from common.email_service import SchoolEmailService
                    from payments.services.multi_school_sms_service import MultiSchoolSMSService
                    
                    school = slip.student.school
                    student = slip.student
                    month_display = slip.deadline.get_month_display() if slip.deadline else "Unknown"
                    academic_year = slip.deadline.academic_year.name if slip.deadline and slip.deadline.academic_year else ""
                    amount_val = float(bank_amount)
                    
                    # Prepare content
                    email_subject = f"✅ Payment Verified - {student.full_name} - {month_display} {academic_year}"
                    html_content = f"""
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #10B981;">Payment Successfully Verified!</h2>
                        <p>Dear Parent,</p>
                        <p>Your payment for <strong>{student.full_name}</strong> has been successfully verified via CBE.</p>
                        <div style="background: #F0FDF4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10B981;">
                            <p style="margin: 0;"><strong>Student:</strong> {student.full_name}</p>
                            <p style="margin: 5px 0 0 0;"><strong>Month:</strong> {month_display} {academic_year}</p>
                            <p style="margin: 5px 0 0 0;"><strong>Amount Paid:</strong> {amount_val:,.2f} ETB</p>
                            <p style="margin: 5px 0 0 0;"><strong>Payer Name:</strong> {payer_name}</p>
                        </div>
                        <p>No further action is required. Thank you for your timely payment!</p>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #E5E7EB;">
                        <p style="color: #6B7280; font-size: 12px;">This is an automated message from {school.name}. Please do not reply.</p>
                    </body>
                    </html>
                    """
                    text_content = f"Payment Verified! {student.full_name} - {month_display} {academic_year}. Amount: {amount_val:,.2f} ETB. Payer: {payer_name}. No further action needed. - {school.name}"
                    sms_message = f"✅ Payment Verified! {student.full_name} - {month_display} {academic_year}. Amount: {amount_val:,.2f} ETB. Payer: {payer_name}. No further action needed. - {school.name}"

                    # Send Email (Layer 2 - School's Brevo Account)
                    if hasattr(student, 'parent_email') and student.parent_email:
                        try:
                            email_service = SchoolEmailService(school.id)
                            email_service.send_email(
                                recipient_email=student.parent_email,
                                subject=email_subject,
                                html_content=html_content,
                                text_content=text_content
                            )
                            print(f"[Q-NOTIFY] ✅ Email sent to {student.parent_email} for slip #{slip.id}")
                        except Exception as e:
                            print(f"[Q-NOTIFY] ⚠️ Email failed for slip #{slip.id}: {e}")

                    # Send SMS (Africa's Talking)
                    if hasattr(student, 'parent_phone') and student.parent_phone:
                        try:
                            sms_service = MultiSchoolSMSService(school.id)
                            sms_service.send_sms(
                                phone_number=student.parent_phone,
                                message=sms_message,
                                related_to=f"verification_slip_{slip.id}"
                            )
                            print(f"[Q-NOTIFY] ✅ SMS sent to {student.parent_phone} for slip #{slip.id}")
                        except Exception as e:
                            print(f"[Q-NOTIFY] ⚠️ SMS failed for slip #{slip.id}: {e}")

                except Exception as notify_err:
                    # NEVER let notification errors break the verification task
                    print(f"[Q-NOTIFY] 💥 Critical notification error for slip #{slip.id}: {notify_err}")

    except Exception as e:
        print(f"[Q] 💥 Error processing result for slip #{slip.id}: {e}")
        try:
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Result processing error: {str(e)[:200]}'
            slip.save(update_fields=['verification_status', 'verification_error'])
        except Exception:
            pass


def _send_verification_notification(slip: PaymentSlip):
    """
    Send dual-channel notification (Email + SMS) to parent after successful verification.
    Uses school-specific credentials from database.
    Gracefully handles failures without breaking the background task.
    """
    try:
        student = slip.student
        school = student.school
        
        # Prepare notification content
        payer_name = slip.verify_et_payer_name or "Parent"
        amount = float(slip.verify_et_amount or slip.amount)
        month_display = slip.deadline.get_month_display() if slip.deadline else "Unknown Month"
        academic_year = slip.deadline.academic_year.name if slip.deadline and slip.deadline.academic_year else ""
        
        email_subject = f"✅ Payment Verified - {student.full_name} - {month_display} {academic_year}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #10B981;">Payment Successfully Verified!</h2>
            <p>Dear Parent,</p>
            <p>Your payment for <strong>{student.full_name}</strong> has been successfully verified via CBE.</p>
            
            <div style="background: #F0FDF4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10B981;">
                <p style="margin: 0;"><strong>Student:</strong> {student.full_name}</p>
                <p style="margin: 5px 0 0 0;"><strong>Month:</strong> {month_display} {academic_year}</p>
                <p style="margin: 5px 0 0 0;"><strong>Amount Paid:</strong> {amount:,.2f} ETB</p>
                <p style="margin: 5px 0 0 0;"><strong>Payer Name:</strong> {payer_name}</p>
                <p style="margin: 5px 0 0 0;"><strong>Verified At:</strong> {timezone.now().strftime('%Y-%m-%d %H:%M')}</p>
            </div>
            
            <p>No further action is required. Thank you for your timely payment!</p>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 12px;">This is an automated message from {school.name}. Please do not reply.</p>
        </body>
        </html>
        """
        
        text_content = f"""
        Payment Successfully Verified!
        
        Dear Parent,
        Your payment for {student.full_name} has been successfully verified via CBE.
        
        Student: {student.full_name}
        Month: {month_display} {academic_year}
        Amount Paid: {amount:,.2f} ETB
        Payer Name: {payer_name}
        Verified At: {timezone.now().strftime('%Y-%m-%d %H:%M')}
        
        No further action is required. Thank you for your timely payment!
        
        ---
        Automated message from {school.name}
        """
        
        sms_message = (
            f"✅ Payment Verified! {student.full_name} - {month_display} {academic_year}. "
            f"Amount: {amount:,.2f} ETB. Payer: {payer_name}. "
            f"No further action needed. - {school.name}"
        )
        
        # === SEND EMAIL VIA SCHOOL'S BREVO ACCOUNT ===
        email_sent = False
        if hasattr(student, 'parent_email') and student.parent_email:
            try:
                from common.email_service import SchoolEmailService
                email_service = SchoolEmailService(school.id)
                result = email_service.send_email(
                    recipient_email=student.parent_email,
                    subject=email_subject,
                    html_content=html_content,
                    text_content=text_content
                )
                email_sent = True
                print(f"[Q-NOTIFY] ✅ Email sent to {student.parent_email} for slip #{slip.id}")
            except Exception as e:
                print(f"[Q-NOTIFY] ⚠️ Email failed for slip #{slip.id}: {e}")
        else:
            print(f"[Q-NOTIFY] ⚠️ No parent email for student {student.student_id}, skipping email")
        
        # === SEND SMS VIA SCHOOL'S AFRICA'S TALKING ACCOUNT ===
        sms_sent = False
        if hasattr(student, 'parent_phone') and student.parent_phone:
            try:
                from payments.services.multi_school_sms_service import MultiSchoolSMSService
                sms_service = MultiSchoolSMSService(school.id)
                result = sms_service.send_sms(
                    phone_number=student.parent_phone,
                    message=sms_message,
                    related_to=f"verification_slip_{slip.id}"
                )
                sms_sent = True
                print(f"[Q-NOTIFY] ✅ SMS sent to {student.parent_phone} for slip #{slip.id}")
            except Exception as e:
                print(f"[Q-NOTIFY] ⚠️ SMS failed for slip #{slip.id}: {e}")
        else:
            print(f"[Q-NOTIFY] ⚠️ No parent phone for student {student.student_id}, skipping SMS")
        
        # Log success/failure summary
        if email_sent or sms_sent:
            print(f"[Q-NOTIFY] 🎉 Notification complete for slip #{slip.id}: "
                  f"Email={'✅' if email_sent else '❌'} SMS={'✅' if sms_sent else '❌'}")
        else:
            print(f"[Q-NOTIFY] ❌ Both email and SMS failed for slip #{slip.id}")
            
    except Exception as e:
        # NEVER let notification errors break the verification task
        print(f"[Q-NOTIFY] 💥 Critical notification error for slip #{slip.id}: {e}")


# ✅ NEW (requested, scaling audit item 5): bulk manual reminders used to
# run synchronously inside send_reminders() in reminder_views.py — for a
# school clicking "send to 2,000 students," that blocked the single
# Gunicorn worker (see render.yaml — currently --workers 1) for however
# long 2,000 SMS/email sends took, timing out the request and freezing
# every OTHER school's API calls at the same time. Same async_task
# pattern already proven above for slip verification, just applied here.
#
# Deliberately logs results with print() rather than trying to notify
# the requesting admin in real time — Django-Q doesn't push results back
# to the browser. If you want the admin to see final counts, the next
# step would be a small "notifications" or "task status" model they can
# poll — out of scope for this specific fix, flagging it for later.
def send_bulk_reminders_async(student_ids, month, custom_message, academic_year, school_id, requested_by_id=None):
    from django.contrib.auth import get_user_model
    from .services.reminder_service import ReminderService

    User = get_user_model()
    requested_by = None
    if requested_by_id:
        requested_by = User.objects.filter(id=requested_by_id).first()

    print(f"[Q-REMINDERS] Starting bulk reminder send: {len(student_ids)} students, "
          f"school_id={school_id}, requested_by={requested_by}")

    try:
        service = ReminderService()
        results = service.send_reminders(
            student_ids, month, custom_message,
            academic_year=academic_year, school_id=school_id,
        )
        successful = len([r for r in results if r['success']])
        failed = len([r for r in results if not r['success']])
        print(f"[Q-REMINDERS] ✅ Done: {successful} sent, {failed} failed, "
              f"{len(results)} total (school_id={school_id})")
    except Exception as e:
        # Same principle as slip notifications above: a bug here must
        # never silently vanish, but it also must never crash the whole
        # Django-Q worker process for other schools' queued tasks.
        print(f"[Q-REMINDERS] 💥 Bulk reminder send failed for school_id={school_id}: {e}")


# ✅ NEW (requested, scaling audit item 5): the async counterpart to
# MultiSchoolSendBulkRemindersView.post() — the endpoint your frontend
# actually calls for bulk payment-link SMS reminders. Re-fetches
# everything by ID (school, deadline, students) exactly as the view
# does, then calls the SAME _run_bulk_reminder_batch() the view uses
# for small batches, so behavior is identical either way — just off
# the request/response cycle for large batches.
def send_bulk_payment_link_reminders_async(school_id, deadline_id, student_ids, custom_message):
    from schools.models import School
    from students.models import Student
    from .models import PaymentDeadline
    from .views.sms_views_v2 import _run_bulk_reminder_batch

    print(f"[Q-REMINDERS] Starting bulk payment-link reminder send: "
          f"{len(student_ids)} students, school_id={school_id}, deadline_id={deadline_id}")

    try:
        school = School.objects.get(id=school_id)
        deadline = PaymentDeadline.objects.get(id=deadline_id, school=school)
        students = Student.objects.filter(
            student_id__in=student_ids, school=school, status='active'
        ).exclude(parent_phone__isnull=True).exclude(parent_phone='')

        results, successful_count = _run_bulk_reminder_batch(school, deadline, students, custom_message)
        print(f"[Q-REMINDERS] ✅ Done: {successful_count} sent, {len(results) - successful_count} failed, "
              f"{len(results)} total (school_id={school_id}, deadline_id={deadline_id})")
    except Exception as e:
        print(f"[Q-REMINDERS] 💥 Bulk payment-link reminder send failed for "
              f"school_id={school_id}, deadline_id={deadline_id}: {e}")