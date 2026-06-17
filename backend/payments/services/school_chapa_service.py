# backend/payments/services/school_chapa_service.py
import requests
import json
import logging
from django.conf import settings
from schools.models import School

logger = logging.getLogger(__name__)


class SchoolChapaService:
    """
    Chapa payment service that loads credentials for each school.
    Each school has their own Chapa account and API key.
    """
    
    def __init__(self, school_id):
        """
        Initialize Chapa service for a specific school
        
        Args:
            school_id: The ID of the school
        """
        self.school_id = school_id
        try:
            self.school = School.objects.get(id=school_id)
        except School.DoesNotExist:
            raise Exception(f"School with ID {school_id} not found")
        
        self.api_key = self.school.chapa_api_key
        self.webhook_secret = self.school.chapa_webhook_secret
        self.base_url = "https://api.chapa.co/v1"
        
        if not self.api_key:
            logger.warning(f"⚠️ Chapa API key not configured for school: {self.school.name}")
    
    def _get_headers(self):
        """Get headers for Chapa API requests"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def initialize_payment(self, amount, email, first_name, last_name, tx_ref, callback_url, return_url):
        """
        Initialize a payment for this school
        
        Args:
            amount: Payment amount
            email: Customer email
            first_name: Customer first name
            last_name: Customer last name
            tx_ref: Transaction reference (unique)
            callback_url: Webhook URL for payment confirmation
            return_url: URL to redirect after payment
        
        Returns:
            dict: {
                'success': bool,
                'checkout_url': str,
                'tx_ref': str
            }
        """
        if not self.api_key:
            return {
                'success': False,
                'error': f'Chapa not configured for school: {self.school.name}'
            }
        
        data = {
            "amount": str(amount),
            "currency": "ETB",
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "tx_ref": tx_ref,
            "callback_url": callback_url,
            "return_url": return_url,
            "customization": {
                "title": f"{self.school.name} - Payment",
                "description": f"School Fee Payment - {self.school.name}"
            },
            "meta": {
                "school_id": str(self.school.id),
                "school_name": self.school.name,
                "school_code": self.school.code
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/transaction/initialize",
                json=data,
                headers=self._get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    return {
                        'success': True,
                        'checkout_url': result.get('data', {}).get('checkout_url'),
                        'tx_ref': tx_ref,
                        'data': result
                    }
                else:
                    return {
                        'success': False,
                        'error': result.get('message', 'Payment initialization failed')
                    }
            else:
                return {
                    'success': False,
                    'error': f'Chapa API error: {response.status_code}',
                    'details': response.text
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Connection timeout. Please try again.'
            }
        except requests.exceptions.ConnectionError:
            return {
                'success': False,
                'error': 'Cannot connect to Chapa API. Please check your internet connection.'
            }
        except Exception as e:
            logger.error(f"Chapa payment initialization error for school {self.school.name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def verify_payment(self, tx_ref):
        """
        Verify a payment transaction
        
        Args:
            tx_ref: Transaction reference to verify
        
        Returns:
            dict: {
                'success': bool,
                'status': str,
                'amount': float,
                'data': dict
            }
        """
        if not self.api_key:
            return {
                'success': False,
                'error': f'Chapa not configured for school: {self.school.name}'
            }
        
        try:
            response = requests.get(
                f"{self.base_url}/transaction/verify/{tx_ref}",
                headers=self._get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    payment_data = result.get('data', {})
                    return {
                        'success': True,
                        'status': payment_data.get('status'),
                        'amount': payment_data.get('amount'),
                        'currency': payment_data.get('currency'),
                        'data': result
                    }
                else:
                    return {
                        'success': False,
                        'error': result.get('message', 'Verification failed')
                    }
            else:
                return {
                    'success': False,
                    'error': f'Chapa API error: {response.status_code}'
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Connection timeout. Please try again.'
            }
        except Exception as e:
            logger.error(f"Chapa payment verification error for school {self.school.name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_banks(self):
        """
        Get list of supported banks from Chapa
        
        Returns:
            dict: {
                'success': bool,
                'data': list of banks
            }
        """
        if not self.api_key:
            return {
                'success': False,
                'error': f'Chapa not configured for school: {self.school.name}'
            }
        
        try:
            response = requests.get(
                f"{self.base_url}/banks",
                headers=self._get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('status') == 'success':
                    return {
                        'success': True,
                        'data': result.get('data', [])
                    }
                else:
                    return {
                        'success': False,
                        'error': result.get('message', 'Failed to get banks')
                    }
            else:
                return {
                    'success': False,
                    'error': f'Chapa API error: {response.status_code}'
                }
                
        except Exception as e:
            logger.error(f"Chapa get banks error for school {self.school.name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def test_credentials(self):
        """
        Test if Chapa credentials are valid by getting banks list
        
        Returns:
            dict: {
                'success': bool,
                'message': str
            }
        """
        if not self.api_key:
            return {
                'success': False,
                'message': 'Chapa API key not configured'
            }
        
        try:
            # Try to get bank list as a test
            headers = self._get_headers()
            
            response = requests.get(
                f"{self.base_url}/banks",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                # Update school with success
                from django.utils import timezone
                self.school.chapa_enabled = True
                self.school.chapa_test_status = "success"
                self.school.chapa_last_test = timezone.now()
                self.school.save(update_fields=['chapa_enabled', 'chapa_test_status', 'chapa_last_test'])
                
                return {
                    'success': True,
                    'message': '✅ Chapa credentials are valid! Online payments are now enabled.'
                }
            else:
                self.school.chapa_enabled = False
                self.school.chapa_test_status = f"failed: {response.status_code}"
                self.school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
                
                return {
                    'success': False,
                    'message': f'❌ Invalid credentials. Please check your API key. (Status: {response.status_code})'
                }
                
        except requests.exceptions.Timeout:
            self.school.chapa_enabled = False
            self.school.chapa_test_status = "error: timeout"
            self.school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
            
            return {
                'success': False,
                'message': '❌ Connection timeout. Please try again.'
            }
        except requests.exceptions.ConnectionError:
            self.school.chapa_enabled = False
            self.school.chapa_test_status = "error: connection failed"
            self.school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
            
            return {
                'success': False,
                'message': '❌ Cannot connect to Chapa API. Please check your internet connection.'
            }
        except Exception as e:
            self.school.chapa_enabled = False
            self.school.chapa_test_status = f"error: {str(e)[:50]}"
            self.school.save(update_fields=['chapa_enabled', 'chapa_test_status'])
            
            return {
                'success': False,
                'message': f'❌ Error: {str(e)}'
            }