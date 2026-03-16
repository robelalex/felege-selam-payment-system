# backend/test_ocr.py
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from payments.services.ocr_service import OCRService

def test_ocr():
    # Path to a test bank slip image
    # Replace this with the path to an actual bank slip image on your computer
    # test_image = r"C:\path\to\your\bank_slip.jpg"
    test_image = r"C:\Users\owner\Desktop\test_slip.png"
    expected_amount = 2000  # Matches the amount in your screenshot
    
    if not os.path.exists(test_image):
        print(f"❌ Test image not found at: {test_image}")
        print("Please put a bank slip image and update the path")
        return
    
    expected_amount = 2000  # Change this to match your test slip
    
    print("🔍 Testing OCR on bank slip...")
    ocr = OCRService()
    result = ocr.verify_slip(test_image, expected_amount)
    
    print("\n📄 Extracted Text Preview:")
    print(result.get('extracted_text', '')[:500])
    
    print("\n📊 Results:")
    print(f"Success: {result['success']}")
    print(f"Confidence: {result['confidence']}%")
    print(f"Message: {result['message']}")
    if result.get('extracted_amount'):
        print(f"Extracted Amount: {result['extracted_amount']} Birr")
    if result.get('account_number'):
        print(f"Account Number: {result['account_number']}")
    if result.get('transaction_date'):
        print(f"Transaction Date: {result['transaction_date']}")

if __name__ == "__main__":
    test_ocr()