# backend/payments/tasks.py
"""
Background tasks for async bank slip verification via Verify.ET API.
Uses Django-Q to process verifications without blocking HTTP requests.
"""

import time
import requests
from django.utils import timezone
from payments.models import PaymentSlip, Payment, PaymentDeadline
from schools.models import School
from students.models import Student


def verify_slip_async(slip_id: int, school_id: int):
    """
    Background task: Submit slip to Verify.ET → Poll → Update DB → Create Payment
    
    Args:
        slip_id: ID of the PaymentSlip to verify
        school_id: ID of the school (for credential isolation)
    """
    try:
        # ─ 1. Fetch slip and school ───────────────────────────────────────
        slip = PaymentSlip.objects.select_related('student', 'deadline').get(id=slip_id)
        school = School.objects.get(id=school_id)
        
        print(f"[Q] ✅ Task started for slip #{slip_id} | School: {school.name}")
        
        # Skip if already verified or rejected
        if slip.verification_status in ('verified', 'rejected'):
            print(f"[Q] ⏭️ Slip #{slip_id} already {slip.verification_status}, skipping")
            return
        
        if not slip.transaction_reference:
            slip.verification_status = 'manual_review'
            slip.verification_error = 'No transaction reference detected by AI'
            slip.save(update_fields=['verification_status', 'verification_error'])
            print(f"[Q] ❌ No reference for slip #{slip_id}")
            return
        
        # ── 2. Check school has Verify.ET configured ────────────────────────
        if not all([school.verify_et_api_key, school.verify_et_enabled, school.cbe_account_suffix]):
            slip.verification_status = 'manual_review'
            slip.verification_error = 'Verify.ET not configured for this school'
            slip.save(update_fields=['verification_status', 'verification_error'])
            print(f"[Q] ❌ Verify.ET not configured for school #{school_id}")
            return
        
        # Clean reference number (remove &suffix if present)
        clean_ref = slip.transaction_reference.split('&')[0].strip()
        
        # ── 3. Submit to Verify.ET API ──────────────────────────────────────
        api_url = "https://verify.et/api/verify"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": school.verify_et_api_key,
        }
        payload = {
            "bank": "cbe",
            "referenceNumber": clean_ref,
            "accountSuffix": school.cbe_account_suffix,
            "waitMs": 5000,  # Reduced from 15s — we poll ourselves
        }
        
        if school.cbe_account_number:
            payload["settlementAccount"] = school.cbe_account_number
        
        print(f"[Q] 📡 Submitting ref={clean_ref} to Verify.ET...")
        
        response = requests.post(api_url, json=payload, headers=headers, timeout=10)
        
        # ─ 4a. Immediate success (200) ─────────────────────────────────────
        if response.status_code == 200:
            data = response.json()
            _process_verify_et_result(slip, data, clean_ref)
            return
        
        # ── 4b. Queued (202) → Poll with exponential backoff ────────────────
        elif response.status_code == 202:
            data = response.json()
            status_url = data.get('links', {}).get('statusUrl') or data.get('statusUrl')
            
            if not status_url:
                slip.verification_status = 'manual_review'
                slip.verification_error = 'API returned 202 but no status URL provided'
                slip.verify_et_status = 'error'
                slip.save(update_fields=[
                    'verification_status', 'verification_error', 'verify_et_status'
                ])
                print(f"[Q] ❌ No status URL for slip #{slip_id}")
                return
            
            full_url = f"https://verify.et{status_url}" if status_url.startswith('/') else status_url
            print(f"[Q] 🔄 Queued. Polling: {full_url}")
            
            # Exponential backoff: 5s → 10s → 20s → 30s → 30s (max 5 attempts)
            delays = [5, 10, 20, 30, 30]
            
            for attempt, delay in enumerate(delays, 1):
                time.sleep(delay)
                
                try:
                    poll_response = requests.get(full_url, headers=headers, timeout=10)
                    
                    if poll_response.status_code == 200:
                        poll_data = poll_response.json()
                        verification = poll_data.get('verification', {})
                        status = verification.get('status', 'pending')
                        
                        if status == 'verified':
                            _process_verify_et_result(slip, poll_data, clean_ref)
                            return
                        elif status == 'failed':
                            slip.verification_status = 'failed'
                            slip.verify_et_status = 'failed'
                            slip.verification_error = 'Transaction not found in CBE system'
                            slip.verify_et_checked_at = timezone.now()
                            slip.save(update_fields=[
                                'verification_status', 'verify_et_status',
                                'verification_error', 'verify_et_checked_at'
                            ])
                            print(f"[Q] ❌ Failed after {attempt} polls")
                            return
                        elif status == 'pending':
                            print(f"[Q] ⏳ Poll {attempt}/{len(delays)}: still pending ({delay}s wait)")
                            continue
                    elif poll_response.status_code == 404:
                        print(f"[Q] ⏳ Poll {attempt}/{len(delays)}: 404 (still processing)")
                        continue
                        
                except Exception as e:
                    print(f"[Q] ⚠️ Poll {attempt} error: {e}")
                    continue
            
            # All polls exhausted → timeout
            slip.verification_status = 'timeout'
            slip.verify_et_status = 'timeout'
            slip.verification_error = f'Verification timed out after {sum(delays)}s of polling'
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            print(f"[Q] ⏱️ Timeout for slip #{slip_id}")
            return
        
        # ── 4c. Other errors ────────────────────────────────────────────────
        else:
            slip.verification_status = 'failed'
            slip.verify_et_status = 'error'
            slip.verification_error = f'API returned HTTP {response.status_code}'
            slip.verify_et_checked_at = timezone.now()
            slip.save(update_fields=[
                'verification_status', 'verify_et_status',
                'verification_error', 'verify_et_checked_at'
            ])
            print(f"[Q] ❌ API error {response.status_code} for slip #{slip_id}")
            return
            
    except PaymentSlip.DoesNotExist:
        print(f"[Q] ❌ Slip #{slip_id} not found")
    except School.DoesNotExist:
        print(f"[Q] ❌ School #{school_id} not found")
    except Exception as e:
        print(f"[Q] 💥 Unexpected error for slip #{slip_id}: {e}")
        try:
            slip = PaymentSlip.objects.get(id=slip_id)
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Unexpected error: {str(e)[:200]}'
            slip.save(update_fields=['verification_status', 'verification_error'])
        except Exception:
            pass


def _process_verify_et_result(slip: PaymentSlip, data: dict, clean_ref: str):
    """
    Process successful Verify.ET response: update slip + create Payment record.
    Called when API returns verified status (immediate or after polling).
    """
    try:
        verification = data.get('verification', {})
        # Handle multiple possible response structures from Verify.ET
        tx_data = verification.get('data', {}) or verification.get('transaction', {}) or {}
        
        # Try multiple field names for payer name
        payer_name = (
            tx_data.get('senderName') or 
            tx_data.get('payer') or 
            tx_data.get('fromName') or
            tx_data.get('sender') or
            verification.get('payerName') or
            ''
        )
        
        # Try multiple field names for amount
        bank_amount = (
            tx_data.get('amount') or 
            tx_data.get('value') or
            tx_data.get('totalAmount') or
            verification.get('amount')
        )
        
        # Try multiple field names for date
        tx_date = (
            tx_data.get('date') or 
            tx_data.get('transactionDate') or
            tx_data.get('createdAt') or
            verification.get('date') or
            ''
        )
        
        receiver = (
            tx_data.get('receiverName') or 
            tx_data.get('receiver') or
            tx_data.get('toName') or
            verification.get('receiverName') or
            ''
        )
        
        # Check amount match (within 1 Birr tolerance)
        amount_matches = False
        if bank_amount:
            try:
                diff = abs(float(bank_amount) - float(slip.amount))
                amount_matches = diff <= 1.0
            except (ValueError, TypeError):
                pass
        
        # ── Update slip with API results ────────────────────────────────────
        slip.verify_et_status = 'verified'
        slip.verify_et_payer_name = payer_name
        slip.verify_et_amount = bank_amount
        slip.verify_et_date = tx_date
        slip.verify_et_receiver = receiver
        slip.verify_et_response_raw = data
        slip.verify_et_checked_at = timezone.now()
        
        # Set workflow status AND legacy status for dashboard compatibility
        if amount_matches:
            slip.verification_status = 'verified'
            slip.status = 'verified'  # ✅ CRITICAL: Sync legacy status field
            slip.verified_at_system = timezone.now()
            slip.cbe_verification_status = 'cbe_verified'
            slip.cbe_check_method = 'api'
            slip.cbe_verified_at = timezone.now()
        else:
            # Amount mismatch → flag for manual review but keep API data
            slip.verification_status = 'manual_review'
            slip.verification_error = (
                f'Amount mismatch: declared={slip.amount}, bank={bank_amount}'
            )
        
        slip.save()
        
        print(f"[Q] ✅ Verified slip #{slip.id} | Payer: {payer_name} | Amount: {bank_amount}")
        
        # ─ Create Payment record if verified and doesn't exist ─────────────
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
                    amount=bank_amount or slip.amount,
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
            
            # TODO: Trigger SMS notification here when service is ready
            # _send_verification_sms(slip)
            
    except Exception as e:
        print(f"[Q] 💥 Error processing result for slip #{slip.id}: {e}")
        slip.verification_status = 'manual_review'
        slip.verification_error = f'Result processing error: {str(e)[:200]}'
        slip.save(update_fields=['verification_status', 'verification_error'])