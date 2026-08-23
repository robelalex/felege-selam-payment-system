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

        # ✅ SECURITY FIX: this used to print whether the key exists, its
        # length, and its first 10 characters to stdout/server logs on
        # every single ChapaService instantiation. That's a live secret
        # fragment sitting in plaintext logs (which are often less
        # tightly access-controlled than the env vars/secret store
        # itself, and get shipped to third-party log aggregators). A
        # boolean "configured or not" is all any debugging session
        # actually needs.
        logger.info(f"ChapaService initialized (key configured: {bool(self.secret_key)})")

        # ✅ SECURITY FIX (this whole file): every print() below was
        # replaced with logger.debug/info/error. print() writes to
        # stdout unconditionally, bypassing the DEBUG-gated logging
        # level already configured in core/settings.py
        # (logging.basicConfig(level=DEBUG if DEBUG else WARNING)) — so
        # full payment payloads (amounts, parent emails, names) and raw
        # Chapa API responses were being written to production logs on
        # every single payment, regardless of the DEBUG flag. Using the
        # logger instead means: verbose detail only shows up when
        # DEBUG=True (local dev), and only real failures (logger.error)
        # are guaranteed visible in production.
    
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
        logger.debug(f"Chapa initialize_payment called. tx_ref={kwargs.get('tx_ref')}")

        # Check if secret key exists
        if not self.secret_key:
            logger.error("CHAPA_SECRET_KEY not set!")
            return {'success': False, 'error': 'Chapa secret key not configured'}
        
        # Get frontend URL from settings or use default
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        backend_url = getattr(settings, 'BACKEND_URL', 'https://felege-selam-payment-system.onrender.com')
        
        # Validate required fields
        required_fields = ['amount', 'email', 'first_name', 'last_name', 'tx_ref']
        for field in required_fields:
            if not kwargs.get(field):
                logger.error(f"Chapa initialize_payment missing required field: {field}")
                return {'success': False, 'error': f'Missing required field: {field}'}
        
        # Ensure title is max 16 characters
        title = kwargs.get('title', 'School Fee')
        if len(title) > 16:
            title = title[:16]
            logger.debug(f"Chapa title truncated to: {title}")
        
        # ✅ FIXED: Use production URLs
        # callback_url: where Chapa sends webhook (backend)
        # return_url: where user is redirected after payment (frontend)
        callback_url = kwargs.get('callback_url', f'{backend_url}/api/chapa/webhook/')
        return_url = kwargs.get('return_url', f'{frontend_url}/payment/success')
        
        logger.debug(f"Chapa callback_url={callback_url} return_url={return_url}")
        
        # Build payload exactly as Chapa expects
        payload = {
            'amount': str(kwargs.get('amount')),
            'currency': kwargs.get('currency', 'ETB'),
            'email': kwargs.get('email'),
            'first_name': kwargs.get('first_name'),
            'last_name': kwargs.get('last_name'),
            'tx_ref': kwargs.get('tx_ref'),
            'callback_url': callback_url,
            'return_url': return_url,
            'customization': {
                'title': title,
                'description': kwargs.get('description', 'School Fee Payment')
            }
        }
        
        logger.debug(f"Chapa payload built for tx_ref={payload['tx_ref']}")
        
        try:
            logger.debug(f"Calling Chapa: {self.base_url}/transaction/initialize")
            
            response = requests.post(
                f"{self.base_url}/transaction/initialize",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            logger.debug(f"Chapa initialize response: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if the response contains the checkout URL
                if data.get('status') == 'success' and data.get('data', {}).get('checkout_url'):
                    logger.info(f"Chapa payment initialized OK for tx_ref={payload['tx_ref']}")
                    return {
                        'success': True,
                        'data': data,
                        'checkout_url': data['data']['checkout_url']
                    }
                else:
                    logger.error(f"Chapa unexpected response format for tx_ref={payload['tx_ref']}: {data}")
                    return {
                        'success': False,
                        'error': 'Unexpected response format from Chapa'
                    }
            else:
                logger.error(f"Chapa initialize error {response.status_code} for tx_ref={payload['tx_ref']}: {response.text}")
                return {
                    'success': False,
                    'error': response.text
                }
                
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Chapa connection error: {e}")
            return {'success': False, 'error': f'Connection Error: {str(e)}'}
        except requests.exceptions.Timeout as e:
            logger.error(f"Chapa timeout: {e}")
            return {'success': False, 'error': f'Timeout: {str(e)}'}
        except Exception as e:
            logger.exception("Chapa initialize_payment unexpected error")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, tx_ref):
        """Verify a payment transaction"""
        logger.debug(f"Verifying Chapa payment: {tx_ref}")
        
        if not self.secret_key:
            return {'success': False, 'error': 'Chapa secret key not configured'}
        
        try:
            response = requests.get(
                f"{self.base_url}/transaction/verify/{tx_ref}",
                headers=self.headers,
                timeout=30
            )
            
            logger.debug(f"Chapa verify response for {tx_ref}: {response.status_code}")
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'data': response.json()
                }
            else:
                logger.error(f"Chapa verify error {response.status_code} for {tx_ref}: {response.text}")
                return {
                    'success': False,
                    'error': response.text
                }
                
        except Exception as e:
            logger.exception(f"Chapa verify_payment error for {tx_ref}")
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
            logger.exception("Chapa get_banks error")
            return {'success': False, 'error': str(e)}
