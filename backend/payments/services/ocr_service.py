# backend/payments/services/ocr_service.py
import pytesseract
import cv2
import numpy as np
import re
from PIL import Image
import logging

logger = logging.getLogger(__name__)

class OCRService:
    """Enhanced OCR service for bank slip verification with multi-factor validation"""
    
    # Ethiopian bank names for matching
    BANKS = [
        'Commercial Bank of Ethiopia', 'CBE', 'Dashen Bank', 'Awash Bank',
        'Bank of Abyssinia', 'United Bank', 'Nib International Bank',
        'Cooperative Bank of Oromia', 'Zemen Bank', 'Berhan Bank',
        'Oromia Bank', 'Abay Bank', 'Addis International Bank', 'Enat Bank',
        'Wegagen Bank', 'Debub Global Bank', 'Amhara Bank', 'Sidama Bank'
    ]
    
    def __init__(self):
        # Configure Tesseract path if needed
        # pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        pass
    
    def preprocess_image(self, image_path):
        """Advanced preprocessing to handle shadows, wrinkles, and optimize OCR accuracy"""
        try:
            # 1. Read image
            img = cv2.imread(image_path)
            if img is None:
                return None
            
            # 2. Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # 3. Dynamic Rescaling (Crucial for small fonts on mobile uploads)
            height, width = gray.shape[:2]
            if width < 1000:
                scale_factor = 1.5
                gray = cv2.resize(gray, (int(width * scale_factor), int(height * scale_factor)), interpolation=cv2.INTER_CUBIC)

            # 4. Remove Shadows using Morphological Closing
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
            background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
            normalized_gray = cv2.divide(gray, background, scale=255)

            # 5. Adaptive Thresholding
            thresh = cv2.adaptiveThreshold(
                normalized_gray, 
                255, 
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 
                15, 
                9   
            )
            
            # 6. Gentle Denoising
            denoised = cv2.fastNlMeansDenoising(thresh, None, h=10, templateWindowSize=7, searchWindowSize=21)
            
            return denoised
        except Exception as e:
            logger.error(f"Image preprocessing error: {e}")
            return None
    
    def extract_text(self, image_path):
        """Extract text from image using Tesseract"""
        try:
            processed_img = self.preprocess_image(image_path)
            
            if processed_img is None:
                return ""
            
            pil_img = Image.fromarray(processed_img)
            text = pytesseract.image_to_string(pil_img, lang='eng')
            
            return text
        except Exception as e:
            logger.error(f"OCR extraction error: {e}")
            return ""
    
    def extract_amount(self, text):
        """Extract amount from OCR text - Enhanced version"""
        patterns = [
            r'(?:birr|Br|ETB|ብር)[\s:]*([\d,]+(?:\.\d{2})?)',
            r'([\d,]+(?:\.\d{2})?)[\s:]*(?:birr|Br|ETB|ብር)',
            r'(?:total|amount|sum)[\s:]*([\d,]+(?:\.\d{2})?)',
            r'(?:amount paid|total paid|paid amount)[\s:]*([\d,]+(?:\.\d{2})?)',
            r'([\d,]+(?:\.\d{2})?)\s*$'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                amount_str = matches[0].replace(',', '')
                try:
                    return float(amount_str)
                except ValueError:
                    continue
        
        return None
    
    def extract_bank_name(self, text):
        """Extract bank name from OCR text"""
        text_lower = text.lower()
        for bank in self.BANKS:
            if bank.lower() in text_lower:
                return bank
        return None
    
    def extract_account_number(self, text):
        """Extract account number from OCR text - Enhanced"""
        patterns = [
            r'(?:account|a/c|acc|acct)[\s:]*([\d\s-]{8,20})',
            r'(?:account number)[\s:]*([\d\s-]{8,20})',
            r'([\d\s-]{10,20})(?:\s|$)',
            r'(?:1000[\d\s-]{6,15})'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                account = re.sub(r'[\s-]', '', matches[0])
                if len(account) >= 8:
                    return account
        
        return None
    
    def extract_reference_number(self, text):
        """Extract transaction reference number with CBE/Ethiopian bank specific logic"""
        if not text:
            return ""

        # Clean text: remove extra whitespace but preserve line breaks
        cleaned = re.sub(r'[^\S\n]+', ' ', text)
        
        # 1. PRIMARY: CBE/Dashen Specific Patterns (Highest Priority)
        cbe_patterns = [
            r'\b(FSPAY[A-Z0-9\-]{10,})\b',           # Felege Selam Payment pattern
            r'\b(FT[A-Z0-9]{8,}(?:&\d+)?)\b',         # Funds Transfer + optional suffix
            r'\b(TT[A-Z0-9]{8,})\b',                  # Telegraphic Transfer
            r'\b(CBE[A-Z0-9\-]{8,})\b',               # CBE prefixed references
        ]
        
        for pattern in cbe_patterns:
            matches = re.findall(pattern, cleaned, re.IGNORECASE)
            if matches:
                ref = matches[0].strip().upper()
                # Filter out false positives that are just headers
                if len(ref) > 8 and not any(word in ref for word in ['PAYMENT', 'TRANSACTION', 'RECEIPT', 'BANK']):
                    return ref

        # 2. SECONDARY: Label-Based Extraction (Contextual)
        label_lines = [
            r'(?:tr\s*\.?\s*ref|ref\s*no|reference\s*no|trx\s*id|transaction\s*id)[\s:]*([A-Z0-9\-]{8,30})',
            r'(?:payment\s*ref|pay\s*ref|slip\s*no|receipt\s*no)[\s:]*([A-Z0-9\-]{8,30})',
        ]
        
        for pattern in label_lines:
            matches = re.findall(pattern, cleaned, re.IGNORECASE)
            if matches:
                ref = matches[0].strip().upper()
                if len(ref) > 8 and not any(word in ref for word in ['COMMERCIAL', 'BANK', 'AMOUNT']):
                    return ref

        # 3. TERTIARY: Standalone Alphanumeric Codes (Fallback)
        fallback = re.findall(r'\b([A-Z]{2,}[0-9]{3,}[A-Z0-9\-]{3,})\b', cleaned, re.IGNORECASE)
        for candidate in fallback:
            if len(candidate) >= 10 and not any(word in candidate.upper() for word in ['PAYMENT', 'TRANSACTION', 'RECEIPT', 'BANK', 'TOTAL', 'AMOUNT']):
                return candidate.upper()
        
        return ""
    
    def extract_date(self, text):
        """Extract transaction date from OCR text"""
        patterns = [
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
            r'(?:date|txn date)[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(?:transaction date)[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                return matches[0]
        
        return None
    
    def extract_student_reference(self, text):
        """Extract student ID from reference field"""
        patterns = [
            r'(?:student|stud|std)[\s:]*([A-Z0-9\-]{6,20})',
            r'(?:ref|reference)[\s:]*([A-Z0-9\-]{6,20})',
            r'([A-Z]{2,}[0-9\-]{4,15})'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                return matches[0].strip()
        
        return None
    
    def verify_slip(self, image_path, expected_amount, expected_student_id=None, expected_bank_name=None):
        """
        Complete slip verification with multi-factor validation.

        ✅ NEW: now also tries AI-based extraction (Claude reading the
        actual image) via ai_slip_extraction_service, since regex-on-OCR-
        text was consistently unreliable at pulling the transaction
        reference off real parent-uploaded photos. For each field, the AI
        result is used when Claude found something and OCR/regex did
        not — real value from either wins over a missing one. If the AI
        path is unavailable (no API key) or fails for any reason, this
        works exactly as it did before, unchanged.
        """
        try:
            text = self.extract_text(image_path)
            
            if not text:
                return {
                    'success': False, 'confidence': 0, 'auto_verified': False,
                    'message': 'Could not read text from image', 'extracted_text': '',
                    'extracted_amount': None, 'extracted_bank': None,
                    'extracted_reference': None, 'extracted_account': None,
                    'extracted_student_id': None, 'extracted_date': None,
                    'amount_match': False, 'bank_match': False,
                    'student_id_match': False, 'reference_found': False
                }
            
            extracted_amount = self.extract_amount(text)
            extracted_bank = self.extract_bank_name(text)
            extracted_reference = self.extract_reference_number(text)
            extracted_account = self.extract_account_number(text)
            extracted_date = self.extract_date(text)
            extracted_student_id = self.extract_student_reference(text)

            # ✅ NEW: let Claude read the actual photo and fill in whatever
            # the regex pass missed — reference_number especially, since
            # that's the field with the least consistent formatting across
            # banks. A None/empty regex result never overrides a real AI
            # one; a real regex result is only replaced if the AI result
            # disagrees on amount specifically (the field with the most
            # riding on it), preferring whichever one is present.
            try:
                from payments.services.ai_slip_extraction_service import extract_with_ai
                ai_result = extract_with_ai(image_path)
            except Exception as e:
                logger.warning(f"AI slip extraction call failed, continuing with OCR-only: {e}")
                ai_result = None

            ai_used_for = []
            if ai_result:
                if not extracted_reference and ai_result.get('reference_number'):
                    extracted_reference = str(ai_result['reference_number']).strip().upper()
                    ai_used_for.append('reference')
                if not extracted_bank and ai_result.get('bank_name'):
                    extracted_bank = ai_result['bank_name']
                    ai_used_for.append('bank')
                if not extracted_account and ai_result.get('account_number'):
                    extracted_account = str(ai_result['account_number']).strip()
                    ai_used_for.append('account')
                if not extracted_date and ai_result.get('transaction_date'):
                    extracted_date = ai_result['transaction_date']
                    ai_used_for.append('date')
                if not extracted_student_id and ai_result.get('student_reference'):
                    extracted_student_id = ai_result['student_reference']
                    ai_used_for.append('student_id')
                if extracted_amount is None and ai_result.get('amount') is not None:
                    try:
                        extracted_amount = float(ai_result['amount'])
                        ai_used_for.append('amount')
                    except (TypeError, ValueError):
                        pass

            confidence = 0
            amount_match = False
            bank_match = False
            student_id_match = False
            match_details = []
            if ai_used_for:
                match_details.append(f"AI-assisted fields: {', '.join(ai_used_for)}")

            
            # 1. Amount check (up to 50 points)
            if extracted_amount and expected_amount:
                amount_diff = abs(extracted_amount - expected_amount)
                if amount_diff == 0:
                    amount_match = True
                    confidence += 50
                    match_details.append(f"Amount matches exactly: {extracted_amount}")
                elif amount_diff <= 5:
                    amount_match = True
                    confidence += 45
                    match_details.append(f"Amount within 5 Birr: expected {expected_amount}, got {extracted_amount}")
                elif amount_diff <= 10:
                    confidence += 35
                    match_details.append(f"Amount off by {amount_diff} Birr")
                else:
                    match_details.append(f"Amount mismatch: expected {expected_amount}, got {extracted_amount}")
            else:
                match_details.append("Could not extract amount from slip")
            
            # 2. Bank name check (up to 25 points)
            if extracted_bank and expected_bank_name:
                if extracted_bank.lower() in expected_bank_name.lower() or expected_bank_name.lower() in extracted_bank.lower():
                    bank_match = True
                    confidence += 25
                    match_details.append(f"Bank matches: {extracted_bank}")
                else:
                    match_details.append(f"Bank mismatch: {extracted_bank} vs {expected_bank_name}")
            else:
                match_details.append("Bank name not extracted or not provided")
            
            # 3. Student ID check (up to 15 points)
            if extracted_student_id and expected_student_id:
                if extracted_student_id == expected_student_id or expected_student_id in extracted_student_id:
                    student_id_match = True
                    confidence += 15
                    match_details.append(f"Student ID matches: {extracted_student_id}")
                else:
                    match_details.append(f"Student ID mismatch: {extracted_student_id} vs {expected_student_id}")
            else:
                match_details.append("Student ID not found in slip")
            
            # 4. Reference number found (up to 10 points)
            reference_found = bool(extracted_reference)
            if reference_found:
                confidence += 10
                match_details.append(f"Reference number found: {extracted_reference}")
            else:
                match_details.append("No reference number found")
            
            message = "; ".join(match_details)
            auto_verified = False
            success = True
            
            # Auto-verify only if ALL critical checks pass with high confidence
            if amount_match and bank_match and confidence >= 85:
                auto_verified = True
                success = True
                message = f"AUTO-VERIFIED ✓ {message}"
            elif amount_match and confidence >= 70:
                auto_verified = False
                success = True
                message = f"PENDING REVIEW ⏳ {message}"
            else:
                auto_verified = False
                success = False
                message = f"VERIFICATION FAILED ✗ {message}"
            
            return {
                'success': success,
                'confidence': confidence,
                'auto_verified': auto_verified,
                'message': message,
                'extracted_amount': extracted_amount,
                'extracted_bank': extracted_bank,
                'extracted_reference': extracted_reference,
                'extracted_account': extracted_account,
                'extracted_student_id': extracted_student_id,
                'extracted_date': extracted_date,
                'amount_match': amount_match,
                'bank_match': bank_match,
                'student_id_match': student_id_match,
                'reference_found': reference_found,
                'extracted_text': text[:300] + '...' if len(text) > 300 else text
            }
            
        except Exception as e:
            logger.error(f"Slip verification error: {e}")
            return {
                'success': False, 'confidence': 0, 'auto_verified': False,
                'message': f'Error processing image: {str(e)}',
                'extracted_amount': None, 'extracted_bank': None,
                'extracted_reference': None, 'extracted_account': None,
                'extracted_student_id': None, 'extracted_date': None,
                'amount_match': False, 'bank_match': False,
                'student_id_match': False, 'reference_found': False,
                'extracted_text': ''
            }