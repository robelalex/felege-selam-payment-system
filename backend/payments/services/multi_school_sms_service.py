# payments/services/multi_school_sms_service.py
import re
import requests
from decimal import Decimal
from django.utils import timezone
from datetime import date
import logging

from schools.models import School

logger = logging.getLogger(__name__)


class InsufficientSMSBalanceError(Exception):
    """
    ✅ NEW (requested): raised instead of silently failing (or silently
    letting the developer eat the cost) when a platform-managed school's
    SMS wallet can't cover the next message. Every existing caller
    already wraps sends in a try/except Exception, so this surfaces as
    a normal, catchable error with a message the UI can show directly —
    no call site needs to change to handle this correctly.
    """
    pass


class MultiSchoolSMSService:
    """
    SMS service that loads credentials for each school individually.
    Uses Afro Message REST API (https://api.afromessage.com/api/send).

    ✅ UPDATED (requested): this now supports TWO modes, decided
    automatically per school, with zero changes needed at any of this
    class's ~9 call sites across the codebase:

      1. SELF-MANAGED (unchanged): the school has its own
         `at_api_key` configured in School Settings. Behaves exactly as
         before — sends go straight to Afro Message on the school's own
         account, no wallet involved, the platform earns nothing and
         bears no cost here.

      2. PLATFORM-MANAGED (new): the school has NO `at_api_key` of its
         own. Sends go through the DEVELOPER'S OWN shared Afro Message
         account (SMSPricingSettings.platform_api_key), and each
         successful send debits the school's SchoolSMSWallet at the
         current marked-up price (SMSPricingSettings.price_per_sms) —
         this is the "developer resells SMS at a markup" business model
         requested. If the wallet can't cover the next message, the
         send is refused BEFORE contacting Afro Message at all (see
         InsufficientSMSBalanceError below), so the platform never
         fronts SMS cost a school hasn't paid for.

    A school with neither its own key nor a platform key configured
    gets the same "SMS not configured" error as before — no regression
    for anyone who hasn't opted into either path yet.
    """

    BASE_URL = "https://api.afromessage.com/api/send"

    def __init__(self, school_id):
        self.school = School.objects.get(id=school_id)
        self.billed_via_wallet = False
        self._effective_api_key = self.school.at_api_key

        if not self._effective_api_key:
            # No school-owned key — fall back to the platform's own
            # shared account, billed through the school's SMS wallet.
            from payments.sms_wallet_models import SMSPricingSettings
            pricing = SMSPricingSettings.get_current()
            if pricing.platform_api_key:
                self._effective_api_key = pricing.platform_api_key
                self.billed_via_wallet = True

        if not self._effective_api_key:
            raise Exception(
                f"SMS not configured for school: {self.school.name}. "
                f"Please add Afro Message API Key in School Settings, "
                f"or ask the platform to enable platform-managed SMS."
            )

    # ---------- quota helpers (unchanged from your original) ----------

    def _check_quota(self):
        if self.school.sms_monthly_limit == 0:
            return True

        today = date.today()
        if self.school.sms_last_reset:
            if self.school.sms_last_reset.month != today.month:
                self.school.sms_current_month_count = 0
                self.school.sms_last_reset = today
                self.school.save(update_fields=['sms_current_month_count', 'sms_last_reset'])
        else:
            self.school.sms_last_reset = today
            self.school.save(update_fields=['sms_last_reset'])

        if self.school.sms_current_month_count >= self.school.sms_monthly_limit:
            raise Exception(f"SMS quota exceeded for {self.school.name}. Limit: {self.school.sms_monthly_limit}")

        return True

    def _update_quota_count(self):
        if self.school.sms_monthly_limit > 0:
            self.school.sms_current_month_count += 1
            self.school.save(update_fields=['sms_current_month_count'])

    # ---------- phone formatting ----------

    def format_phone_number(self, phone_number):
        """
        Afro Message expects Ethiopian numbers as 2519XXXXXXXX / 2517XXXXXXXX
        (12 digits, no '+', no leading '0').
        """
        cleaned = re.sub(r"\D", "", str(phone_number))

        if cleaned.startswith("251") and len(cleaned) == 12:
            return cleaned
        cleaned = cleaned.lstrip('0')
        if len(cleaned) == 9:
            return "251" + cleaned
        # fallback: assume it just needs the country code prefixed
        return "251" + cleaned

    # ---------- core send ----------

    def _check_wallet_balance(self):
        """
        ✅ NEW: for platform-managed schools only. Refuses to even
        attempt the send if the wallet can't cover it — the platform
        should never front SMS cost a school hasn't paid into their
        wallet for. Self-managed schools skip this entirely (their own
        Afro Message account, their own balance to manage).
        """
        if not self.billed_via_wallet:
            return
        from payments.sms_wallet_models import SMSPricingSettings, SchoolSMSWallet
        pricing = SMSPricingSettings.get_current()
        wallet = SchoolSMSWallet.get_or_create_for_school(self.school)
        if wallet.balance_etb < pricing.price_per_sms:
            raise InsufficientSMSBalanceError(
                f"SMS wallet balance ({wallet.balance_etb} ETB) is too low to send this message "
                f"(costs {pricing.price_per_sms} ETB). Please top up the SMS wallet."
            )

    def _debit_wallet_and_log(self, related_to, success):
        """
        ✅ NEW: called once, right after Afro Message confirms (or we
        know) the send outcome. Debits the wallet ONLY on a successful
        send — a failed send never should have cost the school
        anything — and always leaves an audit-trail row so both the
        school and the super admin can see exactly what was sent and
        what it cost, not just a balance number that silently changed.
        """
        if not self.billed_via_wallet:
            return
        from payments.sms_wallet_models import SMSPricingSettings, SchoolSMSWallet, SMSUsageRecord
        pricing = SMSPricingSettings.get_current()
        if success:
            wallet = SchoolSMSWallet.get_or_create_for_school(self.school)
            wallet.balance_etb = wallet.balance_etb - pricing.price_per_sms
            wallet.save(update_fields=['balance_etb', 'updated_at'])
        SMSUsageRecord.objects.create(
            school=self.school,
            related_to=related_to or '',
            price_charged=pricing.price_per_sms if success else Decimal('0'),
            cost_to_platform=pricing.cost_per_sms if success else Decimal('0'),
            success=success,
        )

    def _update_self_tracker(self, success):
        """
        ✅ NEW (requested): purely optional bookkeeping for SELF-managed
        schools (their own Afro Message key) who've opted in to seeing a
        balance + low-balance alert in this app, same as platform-managed
        schools get — see sms_self_tracker_models.py for full reasoning.

        Deliberately a no-op for:
          - platform-managed schools (self.billed_via_wallet True) — they
            already have the real wallet, this tracker doesn't apply.
          - self-managed schools who never opted in (no row, or
            enabled=False) — nothing happens, nothing is created.
          - failed sends — never counts down a failed message.

        Wrapped in try/except on purpose: this is a convenience feature
        only. If it ever fails for any reason, the SMS has ALREADY been
        sent successfully — a bug here must never look like a failed
        send to the caller, so we log and move on rather than raising.
        """
        if self.billed_via_wallet or not success:
            return
        try:
            from payments.sms_self_tracker_models import SchoolSMSSelfTracker
            tracker = SchoolSMSSelfTracker.objects.filter(school=self.school, enabled=True).first()
            if tracker:
                tracker.balance_etb = tracker.balance_etb - tracker.estimated_cost_per_sms
                tracker.save(update_fields=['balance_etb', 'updated_at'])
        except Exception:
            logger.exception(f"Non-fatal: failed to update self-tracked SMS balance for {self.school.name}")

    def send_sms(self, phone_number, message, related_to=None):
        """Send SMS using Afro Message's REST API."""
        if not phone_number:
            raise Exception("No phone number provided")

        self._check_quota()
        self._check_wallet_balance()  # ✅ NEW — no-op for self-managed schools

        formatted_number = self.format_phone_number(phone_number)
        logger.info(f"📤 Sending SMS for school {self.school.name} to: {formatted_number}")

        headers = {
            "Authorization": f"Bearer {self._effective_api_key}",
        }

        base_params = {
            "to": formatted_number,
            "message": message[:459],  # Afro Message allows up to 3 concatenated SMS (~459 chars); trim to be safe
        }

        # Field-name uncertainty: their SDKs use `sender` for sender name.
        # Some older integrations reportedly expect `sender_name` instead.
        # We try `sender` first, and only fall back if the API explicitly
        # complains about an unrecognized/invalid sender field.
        param_variants = []
        if self.school.sms_sender_id:
            param_variants.append({**base_params, "sender": self.school.sms_sender_id})
            param_variants.append({**base_params, "sender_name": self.school.sms_sender_id})
        else:
            param_variants.append(dict(base_params))  # no sender at all — use account default

        last_error = None

        for params in param_variants:
            try:
                response = requests.get(
                    self.BASE_URL,
                    headers=headers,
                    params=params,
                    timeout=15,
                )
            except requests.exceptions.Timeout:
                raise Exception("Connection timeout. Please try again.")
            except requests.exceptions.RequestException as e:
                raise Exception(f"Network error contacting Afro Message: {e}")

            try:
                data = response.json()
            except ValueError:
                data = {"acknowledge": "error", "response": f"Non-JSON response: {response.text[:200]}"}

            if response.status_code == 200 and data.get("acknowledge") == "success":
                self._update_quota_count()
                self._debit_wallet_and_log(related_to, success=True)  # ✅ NEW — no-op for self-managed schools
                self._update_self_tracker(success=True)  # ✅ NEW — no-op unless this self-managed school opted in
                logger.info(f"✅ Afro Message send succeeded for {self.school.name}: {data.get('response')}")
                result = {
                    'success': True,
                    'message': 'SMS sent successfully',
                    'school': self.school.name,
                    'provider_response': data.get('response'),
                }
                # ✅ NEW: extra keys only meaningful for platform-managed
                # schools — every existing caller reads specific keys it
                # already expects (e.g. result['success']), so adding
                # keys here is safe and doesn't change existing behavior.
                if self.billed_via_wallet:
                    from payments.sms_wallet_models import SMSPricingSettings, SchoolSMSWallet
                    wallet = SchoolSMSWallet.get_or_create_for_school(self.school)
                    result['billed_via_wallet'] = True
                    result['wallet_balance_after'] = wallet.balance_etb
                    result['low_balance_warning'] = wallet.is_low()
                return result

            # Keep the error and only retry the next param variant if this
            # looks like a sender-field problem, not an auth/balance problem.
            error_detail = data.get("response") or data.get("error_message") or response.text[:200]
            last_error = f"HTTP {response.status_code}: {error_detail}"

            error_text = str(error_detail).lower()
            sender_related = "sender" in error_text or "identifier" in error_text
            if not sender_related:
                break  # no point trying the other param name

        # If we got here, all variants failed
        logger.error(f"❌ Afro Message send failed for {self.school.name}: {last_error}")
        self._debit_wallet_and_log(related_to, success=False)  # ✅ NEW — logs the attempt, never charges for a failed send

        if "auth" in str(last_error).lower() or "unauthorized" in str(last_error).lower() or "401" in str(last_error):
            self.school.sms_enabled = False
            self.school.sms_test_status = f"Failed: {str(last_error)[:100]}"
            self.school.save(update_fields=['sms_enabled', 'sms_test_status'])
            logger.warning(f"Disabled SMS for school {self.school.name} due to auth error")

        raise Exception(f"Afro Message API Error: {last_error}")

    # ---------- test credentials ----------

    def test_credentials(self):
        if not self.school.phone:
            raise Exception("School phone number is not set. Please add school phone number first.")

        try:
            test_message = (
                f"Test SMS from {self.school.name}. "
                f"Afro Message credentials working. "
                f"Time: {timezone.now().strftime('%H:%M')}"
            )

            self.send_sms(self.school.phone, test_message, related_to="test_credentials")

            self.school.sms_enabled = True
            self.school.sms_last_test = timezone.now()
            self.school.sms_test_status = "success"
            self.school.save(update_fields=['sms_enabled', 'sms_last_test', 'sms_test_status'])

            logger.info(f"✅ Test SMS successful for school {self.school.name}")

            return {
                'success': True,
                'message': f'Test SMS sent successfully to {self.school.phone}',
                'school': self.school.name
            }

        except Exception as e:
            self.school.sms_enabled = False
            self.school.sms_test_status = f"Failed: {str(e)[:100]}"
            self.school.save(update_fields=['sms_enabled', 'sms_test_status'])

            logger.error(f"Test SMS failed for school {self.school.name}: {e}")
            raise Exception(f"Test failed: {str(e)}")

    # ---------- balance ----------

    def get_balance(self):
        """
        Afro Message's public API (send / bulk / code / verify) does not
        expose a balance or top-up endpoint, so we can't pull a live SMS
        credit balance from them. Instead, this returns OUR OWN internal
        usage tracker — how many SMS this school has sent this calendar
        month against its configured quota — which we already record on
        every successful send (see _update_quota_count). This is not the
        real Afro Message account balance; for that, the school admin
        needs to log into the Afro Message dashboard directly.
        """
        self._check_quota_reset_if_needed()

        monthly_limit = self.school.sms_monthly_limit or 0
        sent_this_month = self.school.sms_current_month_count or 0
        remaining = (monthly_limit - sent_this_month) if monthly_limit > 0 else None

        return {
            'success': True,
            'type': 'internal_usage',  # not a live provider balance
            'school': self.school.name,
            'sms_enabled': self.school.sms_enabled,
            'sms_test_status': self.school.sms_test_status or '',
            'sms_last_test': self.school.sms_last_test,
            'sender_id': self.school.sms_sender_id or '',
            'sent_this_month': sent_this_month,
            'monthly_limit': monthly_limit,  # 0 means unlimited/no cap set
            'remaining_this_month': remaining,
            'provider_dashboard_url': 'https://afromessage.com/',
            'note': (
                "This is your usage inside this app, not your live Afro "
                "Message credit balance — Afro Message doesn't offer an API "
                "for that. Check your real balance or top up on their site."
            ),
        }

    def _check_quota_reset_if_needed(self):
        """Roll over the monthly counter if we've crossed into a new month,
        without raising (unlike _check_quota, which is used before sending)."""
        today = date.today()
        if self.school.sms_last_reset and self.school.sms_last_reset.month != today.month:
            self.school.sms_current_month_count = 0
            self.school.sms_last_reset = today
            self.school.save(update_fields=['sms_current_month_count', 'sms_last_reset'])
        elif not self.school.sms_last_reset:
            self.school.sms_last_reset = today
            self.school.save(update_fields=['sms_last_reset'])
    
    # ---------- ANTI-SPOOFING PAYMENT REMINDER (SIMPLIFIED) ----------

    def send_anti_spoof_reminder(self, payment):
        """
        Sends a simplified, spoof-proof payment reminder for a specific Payment object.
        
        This method:
        1. Generates a signed magic link token (no pre-sent code).
        2. Sends ONE SMS message via Afro Message containing the link and a security warning.
        3. Does NOT include amount, student name, or deadline in SMS text.
        
        Args:
            payment: A payments.Payment instance
            
        Returns:
            dict: {'success': bool, 'message': str, 'token': str}
        """
        from payments.tokens import generate_payment_token
        
        if not payment.student.parent_phone:
            raise Exception("Parent phone number is not set for this student.")
            
        try:
            # Generate signed token + DB record. 
            # Note: verification_code is now generated dynamically in the View, not here.
            token, record = generate_payment_token(payment, payment.student.parent_phone, channel="sms")
            
            formatted_phone = self.format_phone_number(payment.student.parent_phone)
            school_name = self.school.name
            
            # ✅ SINGLE MESSAGE: Link + Security Warning
            # No pre-sent code. The parent gets the code ONLY when they click the link.
            message = (
                f"{school_name}: Payment due. Click to pay securely:\n"
                f"https://felege-selam-payment-system.vercel.app/pay/{token}\n\n"
                f"⚠️ For your safety: A code will be sent to your phone when you click. "
                f"Never share this code with anyone calling you. Valid 6 hours."
            )
            
            # Send the single reminder message (counts against normal quota)
            result = self.send_sms(
                formatted_phone, 
                message, 
                related_to=f"link_{record.id}"
            )
            
            logger.info(f"✅ Simplified anti-spoof reminder sent for payment {payment.id}")
            
            return {
                'success': True,
                'message': 'Reminder sent successfully',
                'token': token,
                'school': self.school.name
            }
            
        except Exception as e:
            logger.error(f"❌ Anti-spoof reminder failed for payment {payment.id}: {e}")
            raise Exception(f"Failed to send anti-spoof reminder: {str(e)}")