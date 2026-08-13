# common/email_service.py
import logging
import requests
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from urllib.parse import urlencode
from schools.models import School

logger = logging.getLogger(__name__)


class SchoolEmailService:
    """
    Dynamic email service that loads Brevo credentials per-school.
    Uses Brevo REST API over HTTPS (port 443) - works on Render Free Tier.
    """
    
    BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
    
    def __init__(self, school_id):
        """Initialize with a specific school ID"""
        try:
            self.school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            raise Exception(f"School with ID {school_id} not found")
        
        if not self.school.has_email_credentials:
            raise Exception(
                f"Email not configured for school: {self.school.name}. "
                "Please add Brevo credentials in School Settings."
            )
        
        self.api_key = self.school.brevo_api_key
        self.sender_email = self.school.brevo_sender_email
        self.sender_name = self.school.brevo_sender_name or self.school.name
    
    def _get_headers(self):
        """Get headers for Brevo API requests"""
        return {
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": self.api_key
        }
    
    def send_email(self, recipient_email, subject, html_content, text_content=None, 
                   reply_to=None, cc=None, bcc=None):
        """
        Send email using this school's Brevo account
        
        Args:
            recipient_email: Recipient's email address
            subject: Email subject
            html_content: HTML body content
            text_content: Plain text fallback (optional)
            reply_to: Reply-to email (optional)
            cc: CC recipients list (optional)
            bcc: BCC recipients list (optional)
        
        Returns:
            dict: {'success': bool, 'message': str, 'message_id': str}
        """
        if not recipient_email:
            raise Exception("No recipient email provided")
        
        # Check quota before sending
        self._check_quota()
        
        payload = {
            "sender": {
                "email": self.sender_email,
                "name": self.sender_name
            },
            "to": [{"email": recipient_email}],
            "subject": subject,
            "htmlContent": html_content
        }
        
        if text_content:
            payload["textContent"] = text_content
        
        if reply_to:
            payload["replyTo"] = {"email": reply_to}
        
        if cc:
            payload["cc"] = [{"email": c} for c in cc]
        
        if bcc:
            payload["bcc"] = [{"email": b} for b in bcc]
        
        try:
            logger.info(f"📤 Sending email for school {self.school.name} to: {recipient_email}")
            
            response = requests.post(
                self.BREVO_API_URL,
                json=payload,
                headers=self._get_headers(),
                timeout=30
            )
            
            if response.status_code == 201:
                result = response.json()
                message_id = result.get('messageId', '')
                
                # Update quota count on success
                self._update_quota_count()
                
                logger.info(f"✅ Email sent successfully. Message ID: {message_id}")
                return {
                    'success': True,
                    'message': 'Email sent successfully',
                    'message_id': message_id,
                    'school': self.school.name
                }
            else:
                error_detail = response.text[:200]
                logger.error(f"❌ Brevo API error: {response.status_code} - {error_detail}")
                raise Exception(f"Brevo API error: {response.status_code} - {error_detail}")
                
        except requests.exceptions.Timeout:
            raise Exception("Connection timeout. Please try again.")
        except requests.exceptions.ConnectionError:
            raise Exception("Cannot connect to Brevo API. Please check internet connection.")
        except Exception as e:
            logger.error(f"❌ Email send error for school {self.school.name}: {e}")
            raise Exception(f"Email failed for {self.school.name}: {str(e)}")
    
    def _check_quota(self):
        """Check if school has email quota available"""
        if self.school.email_monthly_limit == 0:
            return True  # Unlimited
        
        from datetime import date
        today = date.today()
        
        # Reset counter if new month
        if self.school.email_last_reset:
            if self.school.email_last_reset.month != today.month:
                self.school.email_current_month_count = 0
                self.school.email_last_reset = today
                self.school.save(update_fields=['email_current_month_count', 'email_last_reset'])
        else:
            self.school.email_last_reset = today
            self.school.save(update_fields=['email_last_reset'])
        
        if self.school.email_current_month_count >= self.school.email_monthly_limit:
            raise Exception(
                f"Email quota exceeded for {self.school.name}. "
                f"Limit: {self.school.email_monthly_limit}"
            )
        return True
    
    def _update_quota_count(self):
        """Increment email count for this school"""
        if self.school.email_monthly_limit > 0:
            self.school.email_current_month_count += 1
            self.school.save(update_fields=['email_current_month_count'])
    
    def test_credentials(self):
        """
        Test if school's Brevo credentials work
        Sends a test email to the school's own email address
        """
        from django.utils import timezone  # ✅ Import at top
        
        if not self.school.email:
            raise Exception("School email address is not set. Please add school email first.")
        
        try:
            timestamp = timezone.now().strftime('%Y-%m-%d %H:%M:%S')
            
            test_subject = f"✅ Test Email from {self.school.name}"
            test_html = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #10B981;">Test Successful!</h2>
                <p>Your Brevo credentials for <strong>{self.school.name}</strong> are working correctly.</p>
                <p>Sent at: {timestamp}</p>
            </body>
            </html>
            """
            
            result = self.send_email(
                recipient_email=self.school.email,
                subject=test_subject,
                html_content=test_html,
                text_content=f"Test email from {self.school.name}. Credentials working!"
            )
            
            # Update school with success
            self.school.email_enabled = True
            self.school.email_last_test = timezone.now()
            self.school.email_test_status = "success"
            self.school.save(update_fields=['email_enabled', 'email_last_test', 'email_test_status'])
            
            logger.info(f"✅ Test email successful for school {self.school.name}")
            return {
                'success': True,
                'message': f'Test email sent successfully to {self.school.email}',
                'school': self.school.name
            }
            
        except Exception as e:
            # Update school with failure
            error_msg = str(e)[:200]  # ✅ Truncate to prevent DB overflow
            self.school.email_enabled = False
            self.school.email_test_status = f"Failed: {error_msg}"
            self.school.save(update_fields=['email_enabled', 'email_test_status'])
            
            logger.error(f"❌ Test email failed for school {self.school.name}: {e}")
            raise Exception(f"Test failed: {error_msg}")


# Payment link generator (moved here to avoid circular imports)
class PaymentLinkService:
    """Generate payment links for parent portal"""
    
    FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'https://felege-selam-payment-system.vercel.app')
    
    @classmethod
    def generate_payment_link(cls, student_id, deadline_id, amount, student_name=None):
        """
        Generate payment link for parent portal
        
        Args:
            student_id: Student's ID (string or int)
            deadline_id: Payment deadline ID
            amount: Amount to pay
            student_name: Optional student name for display
        
        Returns:
            Full URL string
        """
        base_url = f"{cls.FRONTEND_URL}/parent-pay"
        
        params = {
            'student': str(student_id),
            'deadline': str(deadline_id),
            'amount': str(amount),
        }
        
        if student_name:
            params['name'] = student_name
        
        query_string = urlencode(params)
        return f"{base_url}?{query_string}"
    
    @classmethod
    def generate_bulk_payment_link(cls, student_id, academic_year=None):
        """Generate link for bulk payments"""
        base_url = f"{cls.FRONTEND_URL}/parent-dashboard"
        params = {'student': str(student_id)}
        if academic_year:
            params['year'] = academic_year
        query_string = urlencode(params)
        return f"{base_url}?{query_string}"


def send_otp_email(recipient_email, otp_code, user_type='admin'):
    if user_type == 'admin':
        subject = "Admin Login Verification Code"
        color = "#4F46E5"
        title = "Admin Login Verification"
    else:
        subject = "Parent Portal Access Code"
        color = "#10B981"
        title = "Parent Portal Access"

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>{title}</h2>
        <p>Your verification code is:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: {color};">
            {otp_code}
        </h1>
        <p>This code expires in 10 minutes.</p>
        <p style="color: #999; font-size: 12px;">
            If you did not request this, please ignore this email.
        </p>
    </body>
    </html>
    """
    plain_message = f"{title}\n\nYour code: {otp_code}\n\nExpires in 10 minutes."

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ OTP email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send OTP email: {e}")
        return False, str(e)


def send_approval_notification(recipient_email, school_name):
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Congratulations!</h2>
        <p>Your school <strong>{school_name}</strong> has been approved.</p>
        <a href="https://felege-selam-payment-system.vercel.app/admin/login"
           style="background: #4F46E5; color: white; padding: 10px 20px;
                  text-decoration: none; border-radius: 5px;">
            Login Here
        </a>
    </body>
    </html>
    """
    try:
        send_mail(
            subject=f"School Approved - {school_name}",
            message=f"Your school {school_name} has been approved!",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Approval email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send approval email: {e}")
        return False, str(e)


def send_reset_password_email(recipient_email, token):
    frontend_url = getattr(
        settings, 'FRONTEND_URL',
        'https://felege-selam-payment-system.vercel.app'
    )
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Click the button below to reset your password:</p>
        <a href="{reset_link}"
           style="background: #4F46E5; color: white; padding: 10px 20px;
                  text-decoration: none; border-radius: 5px;">
            Reset Password
        </a>
        <p>This link expires in 24 hours.</p>
    </body>
    </html>
    """
    try:
        send_mail(
            subject="Password Reset - School Payment System",
            message=f"Reset your password: {reset_link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Password reset email sent to {recipient_email}")
        return True, "Reset email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send reset email: {e}")
        return False, str(e)


# ✅ UPDATED: Send payment reminder email with payment link and school branding
def send_payment_reminder_email(recipient_email, student_name, pending_months, total_due, custom_message=None, school=None, payment_link=None):
    """
    Send payment reminder email to parent/guardian with payment link
    
    Args:
        recipient_email: Parent's email address
        student_name: Full name of the student
        pending_months: Comma-separated list of pending months with amounts
        total_due: Total amount due
        custom_message: Optional custom message to include
        school: School object (for branding and bank details)
        payment_link: Direct payment link (if None, will be generic)
    
    Returns:
        tuple: (success: bool, message: str)
    """
    
    # School branding
    school_name = school.name if school else "School"
    school_phone = school.phone if school else ""
    bank_name = school.bank_name if school else ""
    bank_account = school.bank_account_number if school else ""
    bank_holder = school.bank_account_holder if school else ""
    school_logo = school.logo.url if school and school.logo else None
    
    if custom_message:
        message_body = f"""
        <p>Dear Parent,</p>
        <p>{custom_message}</p>
        <p>This reminder is for your child: <strong>{student_name}</strong></p>
        """
    else:
        message_body = f"""
        <p>Dear Parent,</p>
        <p>This is a friendly reminder that your child <strong>{student_name}</strong> has pending payment for the following month(s):</p>
        <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0; font-size: 16px;"><strong>📅 Pending Months:</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 18px; color: #D97706;">{pending_months}</p>
        </div>
        <div style="background: #EEF2FF; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0; font-size: 16px;"><strong>💰 Total Amount Due:</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #4F46E5;">{total_due:,.2f} Birr</p>
        </div>
        """
    
    # Payment button HTML
    payment_button = ""
    if payment_link:
        payment_button = f"""
        <div style="text-align: center; margin: 25px 0;">
            <a href="{payment_link}"
               style="background: #10B981; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; font-size: 16px;
                      font-weight: bold; display: inline-block;">
                💳 Pay Online Now
            </a>
            <p style="font-size: 12px; color: #6B7280; margin-top: 10px;">
                Click the button above to pay securely online
            </p>
        </div>
        """
    
    # Bank details section
    bank_section = ""
    if bank_name and bank_account:
        bank_section = f"""
        <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 0 0 10px 0; font-weight: bold;">🏦 Bank Transfer Details:</p>
            <p style="margin: 5px 0;">Bank: <strong>{bank_name}</strong></p>
            <p style="margin: 5px 0;">Account Number: <strong>{bank_account}</strong></p>
            <p style="margin: 5px 0;">Account Holder: <strong>{bank_holder}</strong></p>
        </div>
        """
    
    # Alternative payment link text
    alt_payment_text = ""
    if payment_link:
        alt_payment_text = f"""
        <p style="margin: 15px 0 0 0; font-size: 12px; color: #6B7280; word-break: break-all;">
            Or copy this link to your browser: <a href="{payment_link}">{payment_link}</a>
        </p>
        """
    
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Reminder - {school_name}</title>
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <!-- Header with School Branding -->
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
                {f'<img src="{school_logo}" style="max-width: 80px; margin-bottom: 15px; border-radius: 50%;" alt="{school_name}">' if school_logo else ''}
                <h1 style="color: white; margin: 0; font-size: 24px;">{school_name}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Payment Reminder</p>
            </div>
            
            <!-- Body -->
            <div style="padding: 30px;">
                {message_body}
                
                {payment_button}
                
                {bank_section}
                
                {alt_payment_text}
                
                <!-- Contact Info -->
                {f'<p style="margin: 20px 0 0 0; font-size: 14px;">📞 For questions, call: <strong>{school_phone}</strong></p>' if school_phone else ''}
                
                <!-- Divider -->
                <hr style="margin: 25px 0; border: none; border-top: 1px solid #E5E7EB;">
                
                <!-- Footer -->
                <p style="color: #6B7280; font-size: 12px; text-align: center; margin: 0;">
                    This is an automated reminder from {school_name} payment system.<br>
                    Please do not reply to this email. If you have already paid, please ignore this message.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"""
{school_name} - Payment Reminder
{'=' * 40}

Dear Parent,

This is a reminder that your child {student_name} has pending payment for:
{pending_months}

Total Amount Due: {total_due:,.2f} Birr

{'-' * 40}
{'Click here to pay online: ' + payment_link if payment_link else ''}

{'-' * 40}
{'Bank Transfer Details:' if bank_name else ''}
Bank: {bank_name}
Account: {bank_account}
Account Holder: {bank_holder}

{'For questions, call: ' + school_phone if school_phone else ''}

Thank you for your cooperation.

---
{school_name} - Automated Message
    """
    
    try:
        send_mail(
            subject=f"📚 Payment Reminder - {student_name} - {school_name}",
            message=plain_message.strip(),
            from_email=f"{school_name} <{settings.DEFAULT_FROM_EMAIL}>",
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Payment reminder email sent to {recipient_email} for {student_name} ({school_name})")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send payment reminder email to {recipient_email}: {e}")
        return False, str(e)


# ✅ NEW: Send detailed payment reminder with deadline-specific link
def send_deadline_reminder_email(recipient_email, student, deadline, school, payment_link=None):
    """
    Send email reminder for a specific deadline with SECURE tokenized payment link.
    
    Args:
        recipient_email: Parent's email address
        student: Student object
        deadline: PaymentDeadline object
        school: School object
        payment_link: Optional pre-generated secure payment link
    
    Returns:
        tuple: (success: bool, message: str)
    """
    
    # ✅ Fee exceptions (Jimma request #1): the amount actually owed for
    # this deadline, used both for the tokenized payment record below
    # AND for what's displayed in the email body — computed once here so
    # the two can never disagree with each other.
    from payments.services.fee_override_service import get_effective_deadline_amount
    display_amount = get_effective_deadline_amount(student, deadline)

    # ✅ ENFORCE SECURE TOKEN GENERATION - No legacy fallback allowed
    if not payment_link:
        from payments.tokens import generate_payment_token
        from payments.models import Payment
        if display_amount <= 0:
            return False, 'Nothing due for this deadline — already covered by a fee waiver.'

        # Create or get payment record for this deadline
        payment, created = Payment.objects.get_or_create(
            student=student,
            deadline=deadline,
            defaults={
                'amount': display_amount,
                'payment_method': 'chapa',
                'paid_by': student.full_name,
                'paid_by_phone': student.parent_phone,
                'status': 'pending'
            }
        )
        if not created and payment.status == 'pending' and payment.amount != display_amount:
            payment.amount = display_amount
            payment.save(update_fields=['amount'])
        
        # Generate secure anti-spoofing token (same function used by SMS)
        token, record = generate_payment_token(payment, student.parent_phone, channel="email")
        payment_link = f"https://felege-selam-payment-system.vercel.app/pay/{token}"
    
    # Format due date
    due_date_str = deadline.due_date.strftime('%B %d, %Y') if deadline.due_date else "as soon as possible"
    
    # School branding
    school_logo = school.logo.url if school.logo else None
    
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Due - {deadline.get_month_display()} {deadline.academic_year}</title>
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
                {f'<img src="{school_logo}" style="max-width: 80px; margin-bottom: 15px; border-radius: 50%;" alt="{school.name}">' if school_logo else ''}
                <h1 style="color: white; margin: 0; font-size: 24px;">{school.name}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Payment Due Notice</p>
            </div>
            
            <div style="padding: 30px;">
                <p>Dear Parent/Guardian of <strong>{student.full_name}</strong> (Grade {student.grade}),</p>
                
                <div style="background: #FEE2E2; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #DC2626;">
                    <p style="margin: 0 0 5px 0;"><strong>📅 Month:</strong> {deadline.get_month_display()}</p>
                    <p style="margin: 0 0 5px 0;"><strong>📖 Academic Year:</strong> {deadline.academic_year}</p>
                    <p style="margin: 0 0 5px 0;"><strong>💰 Amount Due:</strong> <span style="font-size: 20px; font-weight: bold;">{display_amount} ETB</span></p>
                    <p style="margin: 0;"><strong>⏰ Due Date:</strong> {due_date_str}</p>
                </div>
                
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{payment_link}"
                       style="background: #10B981; color: white; padding: 14px 28px;
                              text-decoration: none; border-radius: 8px; font-size: 16px;
                              font-weight: bold; display: inline-block;">
                        💳 Pay Now
                    </a>
                </div>
                
                <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0 0 10px 0; font-weight: bold;">🏦 Bank Transfer Information:</p>
                    <p style="margin: 5px 0;">Bank: <strong>{school.bank_name}</strong></p>
                    <p style="margin: 5px 0;">Account: <strong>{school.bank_account_number}</strong></p>
                    <p style="margin: 5px 0;">Account Holder: <strong>{school.bank_account_holder}</strong></p>
                </div>
                
                <p style="font-size: 12px; color: #6B7280; word-break: break-all;">
                    Link: <a href="{payment_link}">{payment_link}</a>
                </p>
                
                <hr style="margin: 25px 0; border: none; border-top: 1px solid #E5E7EB;">
                
                <p style="color: #6B7280; font-size: 12px; text-align: center;">
                    For questions: {school.phone}<br>
                    This is an automated message from {school.name}
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"""
{school.name} - Payment Due Notice
{'=' * 40}

Student: {student.full_name} (Grade {student.grade})
Month: {deadline.get_month_display()}
Academic Year: {deadline.academic_year}
Amount Due: {display_amount} ETB
Due Date: {due_date_str}

{'=' * 40}
Pay Online: {payment_link}
{'=' * 40}

Bank Transfer:
Bank: {school.bank_name}
Account: {school.bank_account_number}
Holder: {school.bank_account_holder}

For questions: {school.phone}

This is an automated message from {school.name}
    """
    
    try:
        send_mail(
            subject=f"Payment Due: {deadline.get_month_display()} {deadline.academic_year} - {student.full_name}",
            message=plain_message.strip(),
            from_email=f"{school.name} <{settings.DEFAULT_FROM_EMAIL}>",
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_message,
        )
        logger.info(f"✅ Deadline reminder email sent to {recipient_email}")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"❌ Failed to send deadline reminder email: {e}")
        return False, str(e)