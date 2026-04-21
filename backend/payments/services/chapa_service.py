# backend/payments/services/chapa_service.py
import requests
import json
import hmac
import hashlib
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class ChapaService:
    """Chapa payment gateway integration for Ethiopian payments"""
    
    def __init__(self):
        self.secret_key = getattr(settings, 'CHAPA_SECRET_KEY', None)
        self.base_url = "https://api.chapa.co/v1"
        self.headers = {
            'Authorization': f'Bearer {self.secret_key}',
            'Content-Type': 'application/json'
        }
        
        print("="*50)
        print("CHAPA SERVICE INITIALIZED")
        print(f"Secret Key exists: {'Yes' if self.secret_key else 'No'}")
        if self.secret_key:
            print(f"Secret Key length: {len(self.secret_key)}")
            print(f"Secret Key starts with: {self.secret_key[:10]}...")
        print("="*50)
    
    def initialize_payment(self, **kwargs):
        """
        Initialize a payment with Chapa
        Required params:
        - amount: float
        - currency: str (ETB)
        - email: str
        - first_name: str
        - last_name: str
        - tx_ref: str (unique transaction reference)
        - callback_url: str (webhook URL)
        - return_url: str (redirect URL after payment)
        """
        
        print("="*50)
        print("CHAPA INITIALIZE PAYMENT CALLED")
        print(f"Kwargs received: {kwargs}")
        print("="*50)
        
        # Check if secret key exists
        if not self.secret_key:
            print("❌ CHAPA_SECRET_KEY not set!")
            return {'success': False, 'error': 'Chapa secret key not configured'}
        
        # Validate required fields
        required_fields = ['amount', 'email', 'first_name', 'last_name', 'tx_ref']
        for field in required_fields:
            if not kwargs.get(field):
                print(f"❌ Missing required field: {field}")
                return {'success': False, 'error': f'Missing required field: {field}'}
        
        # Ensure title is max 16 characters
        title = kwargs.get('title', 'School Fee')
        if len(title) > 16:
            title = title[:16]
            print(f"Title truncated to: {title}")
        
        # Build payload exactly as Chapa expects
        payload = {
            'amount': str(kwargs.get('amount')),
            'currency': kwargs.get('currency', 'ETB'),
            'email': kwargs.get('email'),
            'first_name': kwargs.get('first_name'),
            'last_name': kwargs.get('last_name'),
            'tx_ref': kwargs.get('tx_ref'),
            'callback_url': kwargs.get('callback_url', 'http://localhost:8000/api/chapa/webhook/'),
            'return_url': kwargs.get('return_url', 'http://localhost:3000/payment/success'),
            'customization': {
                'title': title,
                'description': kwargs.get('description', 'School Fee Payment')
            }
        }
        
        print("="*50)
        print("FINAL PAYLOAD:")
        import json as json_lib
        print(json_lib.dumps(payload, indent=2))
        print("="*50)
        
        try:
            import requests
            print(f"Making request to: {self.base_url}/transaction/initialize")
            print(f"Headers: Authorization: Bearer [HIDDEN], Content-Type: application/json")
            
            response = requests.post(
                f"{self.base_url}/transaction/initialize",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {response.headers}")
            print(f"Response Body: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Success: {data}")
                
                # Check if the response contains the checkout URL
                if data.get('status') == 'success' and data.get('data', {}).get('checkout_url'):
                    return {
                        'success': True,
                        'data': data,
                        'checkout_url': data['data']['checkout_url']
                    }
                else:
                    print(f"❌ Unexpected response format: {data}")
                    return {
                        'success': False,
                        'error': 'Unexpected response format from Chapa'
                    }
            else:
                print(f"❌ Error Response: {response.text}")
                return {
                    'success': False,
                    'error': response.text
                }
                
        except requests.exceptions.ConnectionError as e:
            print(f"❌ Connection Error: {e}")
            return {'success': False, 'error': f'Connection Error: {str(e)}'}
        except requests.exceptions.Timeout as e:
            print(f"❌ Timeout Error: {e}")
            return {'success': False, 'error': f'Timeout: {str(e)}'}
        except Exception as e:
            print(f"❌ Exception: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, tx_ref):
        """Verify a payment transaction"""
        print(f"🔍 Verifying payment: {tx_ref}")
        
        if not self.secret_key:
            return {'success': False, 'error': 'Chapa secret key not configured'}
        
        try:
            response = requests.get(
                f"{self.base_url}/transaction/verify/{tx_ref}",
                headers=self.headers,
                timeout=30
            )
            
            print(f"Verify Response: {response.status_code} - {response.text}")
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'data': response.json()
                }
            else:
                return {
                    'success': False,
                    'error': response.text
                }
                
        except Exception as e:
            print(f"❌ Verify error: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_banks(self):
        """Get list of supported banks"""
        try:
            response = requests.get(
                f"{self.base_url}/banks",
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'data': response.json()
                }
            else:
                return {'success': False, 'error': response.text}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}