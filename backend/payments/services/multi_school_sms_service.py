# payments/services/multi_school_sms_service.py
import re
import requests
from django.utils import timezone
from datetime import date
import logging

from schools.models import School

logger = logging.getLogger(__name__)


class MultiSchoolSMSService:
    """
    SMS service that loads credentials for each school individually.
    Uses Afro Message REST API (https://api.afromessage.com/api/send).
    """

    BASE_URL = "https://api.afromessage.com/api/send"

    def __init__(self, school_id):
        self.school = School.objects.get(id=school_id)

        if not self.school.at_api_key:
            raise Exception(
                f"SMS not configured for school: {self.school.name}. "
                f"Please add Afro Message API Key in School Settings."
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

    def send_sms(self, phone_number, message, related_to=None):
        """Send SMS using Afro Message's REST API."""
        if not phone_number:
            raise Exception("No phone number provided")

        self._check_quota()

        formatted_number = self.format_phone_number(phone_number)
        logger.info(f"📤 Sending SMS for school {self.school.name} to: {formatted_number}")

        headers = {
            "Authorization": f"Bearer {self.school.at_api_key}",
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
                logger.info(f"✅ Afro Message send succeeded for {self.school.name}: {data.get('response')}")
                return {
                    'success': True,
                    'message': 'SMS sent successfully',
                    'school': self.school.name,
                    'provider_response': data.get('response'),
                }

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
        NOTE: I don't have a confirmed Afro Message balance endpoint from
        their public SDKs — their dashboard is the reliable source for this.
        Leaving this as a stub that returns a clear 'not supported' message
        rather than guessing a URL, since a wrong guess here would just
        produce another confusing error for you to debug.
        """
        return {
            'success': False,
            'error': 'Balance check not implemented for Afro Message — check balance in the Afro Message dashboard directly.',
            'school': self.school.name
        }
    
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
            token, record = generate_payment_token(payment, payment.student.parent_phone)
            
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