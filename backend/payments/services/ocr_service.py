# backend/payments/services/ocr_service.py
import pytesseract
import cv2
import numpy as np
import re
from PIL import Image
import logging

logger = logging.getLogger(__name__)

class OCRService:
    """Service to extract text from bank slip images using OCR"""
    
    def __init__(self):
        # Configure Tesseract path if needed
        # pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        pass
    
    def preprocess_image(self, image_path):
        """Preprocess image for better OCR accuracy"""
        try:
            # Read image
            img = cv2.imread(image_path)
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply thresholding to get black and white image
            _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
            
            # Denoise
            denoised = cv2.medianBlur(thresh, 1)
            
            return denoised
        except Exception as e:
            logger.error(f"Image preprocessing error: {e}")
            return None
    
    def extract_text(self, image_path):
        """Extract text from image using Tesseract"""
        try:
            # Preprocess image
            processed_img = self.preprocess_image(image_path)
            
            if processed_img is None:
                return ""
            
            # Convert to PIL Image
            pil_img = Image.fromarray(processed_img)
            
            # Extract text
            text = pytesseract.image_to_string(pil_img, lang='eng')
            
            return text
        except Exception as e:
            logger.error(f"OCR extraction error: {e}")
            return ""
    
    def extract_amount(self, text):
        """Extract amount from OCR text"""
        # Look for patterns like "1000", "1,000", "1000.00"
        patterns = [
            r'(?:birr|Br|ETB|ብር)[\s]*([\d,]+(?:\.\d{2})?)',
            r'([\d,]+(?:\.\d{2})?)[\s]*(?:birr|Br|ETB|ብር)',
            r'(?:total|amount|sum)[\s:]*([\d,]+(?:\.\d{2})?)',
            r'([\d,]+(?:\.\d{2})?)\s*$'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Clean the amount
                amount_str = matches[0].replace(',', '')
                try:
                    return float(amount_str)
                except ValueError:
                    continue
        
        return None
    
    def extract_account_number(self, text):
        """Extract account number from OCR text"""
        # Look for patterns like "1000123456", "1000 1234 56"
        patterns = [
            r'(?:account|a/c|acc)[\s:]*([\d\s-]{8,})',
            r'([\d\s-]{8,})(?:\s|$)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Clean the account number
                account = re.sub(r'[\s-]', '', matches[0])
                if len(account) >= 8:
                    return account
        
        return None
    
    def extract_date(self, text):
        """Extract transaction date from OCR text"""
        # Look for date patterns
        patterns = [
            r'(\d{2}[/-]\d{2}[/-]\d{2,4})',
            r'(\d{4}[/-]\d{2}[/-]\d{2})'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                return matches[0]
        
        return None
    
    def verify_slip(self, image_path, expected_amount):
        """Complete slip verification"""
        try:
            # Extract text from image
            text = self.extract_text(image_path)
            
            if not text:
                return {
                    'success': False,
                    'confidence': 0,
                    'message': 'Could not read text from image',
                    'extracted_text': ''
                }
            
            # Extract amount
            extracted_amount = self.extract_amount(text)
            
            if not extracted_amount:
                return {
                    'success': False,
                    'confidence': 30,
                    'message': 'Could not find amount in image',
                    'extracted_text': text[:200]
                }
            
            # Calculate confidence based on amount match
            amount_diff = abs(extracted_amount - expected_amount)
            if amount_diff == 0:
                confidence = 95
                message = 'Amount matches exactly'
            elif amount_diff <= 10:
                confidence = 85
                message = f'Amount off by {amount_diff} Birr'
            elif amount_diff <= 50:
                confidence = 70
                message = f'Amount off by {amount_diff} Birr'
            else:
                confidence = 50
                message = f'Amount mismatch: expected {expected_amount}, got {extracted_amount}'
            
            # Extract additional info
            account = self.extract_account_number(text)
            date = self.extract_date(text)
            
            return {
                'success': True,
                'confidence': confidence,
                'message': message,
                'extracted_amount': extracted_amount,
                'expected_amount': expected_amount,
                'account_number': account,
                'transaction_date': date,
                'extracted_text': text[:200] + '...' if len(text) > 200 else text
            }
            
        except Exception as e:
            logger.error(f"Slip verification error: {e}")
            return {
                'success': False,
                'confidence': 0,
                'message': f'Error processing image: {str(e)}',
                'extracted_text': ''
            }