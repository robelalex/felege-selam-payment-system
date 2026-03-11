# payments/services/sms.py
import africastalking
from django.conf import settings

# Initialize Africa's Talking
username = "sandbox"  # Use 'sandbox' for testing or your actual username
api_key = "your_api_key_here"  # Get from Africa's Talking dashboard

africastalking.initialize(username, api_key)
sms = africastalking.SMS

def send_payment_reminder(phone_number, student_name, amount, due_date):
    """Send payment reminder SMS to parent"""
    message = f"Dear parent, this is a reminder that {student_name}'s school fee of {amount} Birr is due on {due_date}. Please make payment to avoid late fees. Thank you, Felege Selam School."
    
    try:
        response = sms.send(message, [phone_number])
        print(f"SMS sent: {response}")
        return True
    except Exception as e:
        print(f"SMS failed: {e}")
        return False

def send_payment_confirmation(phone_number, student_name, amount, month):
    """Send payment confirmation SMS"""
    message = f"Dear parent, we have received your payment of {amount} Birr for {student_name} for the month of {month}. Thank you for your timely payment! - Felege Selam School"
    
    try:
        response = sms.send(message, [phone_number])
        return True
    except Exception as e:
        print(f"SMS failed: {e}")
        return False