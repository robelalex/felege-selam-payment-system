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
            # Upscale the image if it's too small so Tesseract can see characters clearly
            height, width = gray.shape[:2]
            if width < 1000:
                scale_factor = 1.5
                gray = cv2.resize(gray, (int(width * scale_factor), int(height * scale_factor)), interpolation=cv2.INTER_CUBIC)

            # 4. Remove Shadows using Morphological Closing
            # This extracts the background lighting grid and subtracts it to flatten shadows
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
            background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
            normalized_gray = cv2.divide(gray, background, scale=255)

            # 5. Adaptive Thresholding (Instead of hardcoded 150)
            # Calculates threshold locally row-by-row, keeping text sharp under any lighting
            thresh = cv2.adaptiveThreshold(
                normalized_gray, 
                255, 
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 
                15, # Block size (looks at a 15x15 pixel window)
                9   # Constant subtracted from the mean
            )
            
            # 6. Gentle Denoising
            # Cleans up stray smartphone camera sensor noise without blurring the text edges
            denoised = cv2.fastNlMeansDenoising(thresh, None, h=10, templateWindowSize=7, searchWindowSize=21)
            
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
            
            # Extract text with multiple configurations
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
                # Clean the amount
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
            r'(?:1000[\d\s-]{6,15})'  # CBE accounts often start with 1000
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Clean the account number
                account = re.sub(r'[\s-]', '', matches[0])
                if len(account) >= 8:
                    return account
        
        return None
    
    def extract_reference_number(self, text):
        """Extract transaction reference number with enhanced Ethiopian bank logic"""
        if not text:
            return ""

        # 1. High Priority Strategy: Match specific Ethiopian banking reference formats 
        # (e.g., CBE starts with TT or FT followed by digits and letters)
        ethiopian_bank_patterns = [
            r'\b(TT\d+[A-Z0-9]+)\b',   # CBE standard transfers (e.g., TT242851POCT)
            r'\b(FT\d+[A-Z0-9]+)\b',   # Alternative CBE/Dashen funds transfers
            r'\b(NIB\d+[A-Z0-9]+)\b'   # Nib Bank structures
        ]
        
        for pattern in ethiopian_bank_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                return matches[0].strip().upper()

        # 2. Line-by-Line Contextual Strategy: Look for anchor labels first
        lines = text.split('\n')
        label_patterns = [
            r'(?:tr\s*\.?\s*ref|ref|reference|trx|txn)[\s:]*([A-Z0-9\-]{6,30})',
            r'(?:transaction\s+reference)[\s:]*([A-Z0-9\-]{6,30})'
        ]
        
        for line in lines:
            for pattern in label_patterns:
                matches = re.findall(pattern, line, re.IGNORECASE)
                if matches:
                    # Filter out false-positives like raw bank name titles
                    candidate = matches[0].strip().upper()
                    if "COMMERCIAL" not in candidate and "BANK" not in candidate:
                        return candidate

        # 3. Fallback General Pattern (Moved to lowest priority to avoid false matches)
        fallback_patterns = [
            r'([A-Z]{2,}[0-9]{4,}[A-Z0-9\-]*)',
            r'(?:STMT|TRF|PAY)[\s]*[:]?\s*([A-Z0-9\-]+)'
        ]
        
        for pattern in fallback_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                candidate = matches[0].strip().upper()
                if "COMMERCIAL" not in candidate and "BANK" not in candidate:
                    return candidate
        
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
            r'([A-Z]{2,}[0-9\-]{4,15})'  # Matches patterns like FS-2024-001
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                return matches[0].strip()
        
        return None
    
    def verify_slip(self, image_path, expected_amount, expected_student_id=None, expected_bank_name=None):
        """
        Complete slip verification with multi-factor validation
        
        Returns detailed verification results including:
        - Amount match
        - Bank name match  
        - Student ID match
        - Confidence score
        - Auto-verify decision
        """
        try:
            # Extract text from image
            text = self.extract_text(image_path)
            
            if not text:
                return {
                    'success': False,
                    'confidence': 0,
                    'auto_verified': False,
                    'message': 'Could not read text from image',
                    'extracted_text': '',
                    'extracted_amount': None,
                    'extracted_bank': None,
                    'extracted_reference': None,
                    'extracted_account': None,
                    'extracted_student_id': None,
                    'extracted_date': None,
                    'amount_match': False,
                    'bank_match': False,
                    'student_id_match': False,
                    'reference_found': False
                }
            
            # Extract all data
            extracted_amount = self.extract_amount(text)
            extracted_bank = self.extract_bank_name(text)
            extracted_reference = self.extract_reference_number(text)
            extracted_account = self.extract_account_number(text)
            extracted_date = self.extract_date(text)
            extracted_student_id = self.extract_student_reference(text)
            
            # Calculate confidence and matches
            confidence = 0
            amount_match = False
            bank_match = False
            student_id_match = False
            match_details = []
            
            # 1. Amount check (most important - up to 50 points)
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
            
            # Determine verification result
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
                'success': False,
                'confidence': 0,
                'auto_verified': False,
                'message': f'Error processing image: {str(e)}',
                'extracted_amount': None,
                'extracted_bank': None,
                'extracted_reference': None,
                'extracted_account': None,
                'extracted_student_id': None,
                'extracted_date': None,
                'amount_match': False,
                'bank_match': False,
                'student_id_match': False,
                'reference_found': False,
                'extracted_text': ''
            }