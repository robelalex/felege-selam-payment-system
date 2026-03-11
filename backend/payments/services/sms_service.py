# payments/services/sms_service.py
class SMSService:
    """SMS service for development - logs messages to console"""
    
    def __init__(self):
        self.use_sandbox = True
        
    def send_sms(self, phone_number, message):
        """Send SMS to a single number (development version)"""
        try:
            # For development, just log the message
            print(f"📱 SIMULATED SMS to {phone_number}: {message}")
            print(f"📝 Message content: {message}")
            
            # In production, you would integrate with Africa's Talking here
            return {'success': True, 'message': 'SMS logged to console (development mode)'}
            
        except Exception as e:
            print(f"❌ SMS Error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def send_bulk_sms(self, recipients):
        """Send SMS to multiple recipients"""
        results = []
        for recipient in recipients:
            result = self.send_sms(recipient['phone'], recipient['message'])
            results.append({
                'phone': recipient['phone'],
                'success': result['success'],
                'error': result.get('error')
            })
        return results