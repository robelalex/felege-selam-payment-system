# backend/payments/views/slip_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
from ..models import PaymentSlip, Student, PaymentDeadline, Payment
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from ..services.ocr_service import OCRService
from academics.models import AcademicYear
from schools.models import School
from django.db import models

@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def upload_slip(request):
    try:
        student_id = request.data.get('student_id')
        deadline_id = request.data.get('deadline_id')
        amount = request.data.get('amount')
        bank_name = request.data.get('bank_name', '')
        slip_image = request.FILES.get('slip_image')
        transaction_reference = request.data.get('transaction_reference', '')

        if not all([student_id, deadline_id, amount, slip_image]):
            return Response({'error': 'Missing required fields'}, status=400)

        student = Student.objects.get(student_id=student_id)
        deadline = PaymentDeadline.objects.get(id=deadline_id)

        school_id = request.headers.get('X-School-ID')
        school = None
        if school_id:
            try:
                school = School.objects.get(id=int(school_id))
                if str(student.school_id) != school_id:
                    return Response({'error': 'Student does not belong to your school'}, status=403)
            except Exception:
                pass

        # Read image bytes once
        image_bytes = slip_image.read()

        # Save to Cloudinary (production) or local disk (development)
        file_name = f'slips/{student.student_id}_{deadline.id}_{slip_image.name}'
        file_path = default_storage.save(file_name, ContentFile(image_bytes))

        # OCR only works locally where file exists on disk
        # In production Cloudinary stores the file so we skip OCR
        expected_bank_name = school.bank_name if school else None
        local_path = os.path.join(settings.MEDIA_ROOT, file_path)

        if os.path.exists(local_path):
            # Local development: run OCR
            try:
                ocr = OCRService()
                ai_result = ocr.verify_slip(
                    local_path,
                    float(amount),
                    expected_student_id=student.student_id,
                    expected_bank_name=expected_bank_name
                )
            except Exception as ocr_error:
                print(f"⚠️ OCR failed: {ocr_error}")
                ai_result = {
                    'success': False,
                    'confidence': 0,
                    'auto_verified': False,
                    'message': 'OCR failed, manual review required',
                    'extracted_amount': None,
                    'extracted_reference': '',
                    'extracted_bank': None,
                    'amount_match': False,
                    'bank_match': False,
                    'student_id_match': False,
                }
        else:
            # Production: Cloudinary stores file, OCR not available
            ai_result = {
                'success': False,
                'confidence': 0,
                'auto_verified': False,
                'message': 'Manual review required',
                'extracted_amount': None,
                'extracted_reference': '',
                'extracted_bank': None,
                'amount_match': False,
                'bank_match': False,
                'student_id_match': False,
            }

        # Determine status based on AI result
        auto_verified = False
        status_value = 'pending'

        if ai_result.get('auto_verified'):
            auto_verified = True
            status_value = 'verified'

        slip = PaymentSlip.objects.create(
            student=student,
            deadline=deadline,
            amount=amount,
            bank_name=bank_name,
            slip_image=file_path,
            uploaded_by=request.data.get('uploaded_by', 'Parent'),
            status=status_value,
            ai_confidence=ai_result.get('confidence', 0),
            ai_extracted_amount=ai_result.get('extracted_amount'),
            ai_message=ai_result.get('message', ''),
            ai_reviewed=True,
            auto_verified=auto_verified,
            transaction_reference=transaction_reference
        )

        if auto_verified:
            Payment.objects.create(
                student=student,
                deadline=deadline,
                amount=amount,
                payment_method='bank_transfer',
                transaction_reference=f'SLIP-AI-{slip.id}-{ai_result.get("extracted_reference", "")}',
                status='verified',
                verified_by=None,
                paid_by=request.data.get('uploaded_by', 'Parent'),
                paid_by_phone=''
            )

        return Response({
            'success': True,
            'message': 'Slip uploaded successfully',
            'slip_id': slip.id,
            'status': status_value,
            'ai_confidence': ai_result.get('confidence', 0),
            'auto_verified': auto_verified,
            'ai_details': {
                'extracted_amount': ai_result.get('extracted_amount'),
                'extracted_bank': ai_result.get('extracted_bank'),
                'extracted_reference': ai_result.get('extracted_reference'),
                'amount_match': ai_result.get('amount_match', False),
                'bank_match': ai_result.get('bank_match', False),
                'student_id_match': ai_result.get('student_id_match', False),
            },
            'requires_admin_review': not auto_verified
        }, status=201)

    except Student.DoesNotExist:
        return Response({'error': 'Student not found'}, status=404)
    except PaymentDeadline.DoesNotExist:
        return Response({'error': 'Deadline not found'}, status=404)
    except Exception as e:
        print(f"❌ Upload error: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_slips(request):
    """Get all pending slips for admin, filtered by school, grade, month, and student search"""

    school_id = request.headers.get('X-School-ID')
    print(f"📱 pending_slips - X-School-ID: {school_id}")

    if not school_id:
        return Response([], status=200)

    # Base query
    slips = PaymentSlip.objects.filter(status='pending')

    # Filter by school
    try:
        slips = slips.filter(student__school_id=int(school_id))
        print(f"📱 Filtered slips by school ID: {school_id}")
    except ValueError:
        print(f"📱 Invalid school ID: {school_id}")
        return Response([], status=200)

    # Filter by grade
    grade = request.query_params.get('grade')
    if grade and grade != 'all' and grade != 'None':
        try:
            slips = slips.filter(student__grade=int(grade))
            print(f"📱 Filtered by grade: {grade}")
        except (ValueError, TypeError):
            pass

    # Filter by month
    month = request.query_params.get('month')
    if month and month != 'all' and month != 'None':
        try:
            slips = slips.filter(deadline__month=int(month))
            print(f"📱 Filtered by month: {month}")
        except (ValueError, TypeError):
            pass

    # Search by student ID or name
    student_search = request.query_params.get('student_search')
    if student_search and student_search.strip():
        slips = slips.filter(
            models.Q(student__student_id__icontains=student_search) |
            models.Q(student__first_name__icontains=student_search) |
            models.Q(student__last_name__icontains=student_search)
        )
        print(f"📱 Search by: {student_search}")

    # Filter by academic year
    year_id = request.query_params.get('academic_year_id')
    year_param = request.query_params.get('academic_year')
    year_alt = request.query_params.get('year')
    year_value = year_id or year_alt or year_param

    if year_value:
        try:
            year = AcademicYear.objects.get(id=int(year_value))
            slips = slips.filter(student__academic_year=year.name)
            print(f"📱 Filtered by academic year: {year.name}")
        except (ValueError, AcademicYear.DoesNotExist):
            try:
                year = AcademicYear.objects.get(year_ec=int(year_value))
                slips = slips.filter(student__academic_year=year.name)
                print(f"📱 Filtered by academic year: {year.name}")
            except (ValueError, AcademicYear.DoesNotExist):
                slips = slips.filter(student__academic_year=year_value)
                print(f"📱 Filtered by academic year string: {year_value}")

    # Order by latest first
    slips = slips.select_related('student', 'deadline').order_by('-uploaded_at')

    data = []
    for s in slips:
        try:
            image_url = s.slip_image.url if s.slip_image else None
        except Exception:
            image_url = None

        data.append({
            'id': s.id,
            'student_id': s.student.student_id,
            'student_name': s.student.full_name,
            'grade': s.student.grade,
            'month': s.deadline.get_month_display(),
            'month_value': s.deadline.month,
            'amount': float(s.amount),
            'bank_name': s.bank_name,
            'slip_image': image_url,
            'uploaded_by': s.uploaded_by,
            'uploaded_at': s.uploaded_at,
            'ai_confidence': s.ai_confidence,
            'ai_extracted_amount': float(s.ai_extracted_amount) if s.ai_extracted_amount else None,
            'ai_message': s.ai_message,
            'auto_verified': s.auto_verified,
            'transaction_reference': s.transaction_reference if hasattr(s, 'transaction_reference') else '',
        })

    print(f"📱 Returning {len(data)} pending slips")
    return Response(data)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_slip(request, slip_id):
    """Verify or reject a slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)

        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass

        action = request.data.get('action')

        if action == 'verify':
            slip.status = 'verified'
            slip.verified_by = None
            slip.verified_at = timezone.now()
            slip.save()

            # Check if payment already exists
            existing_payment = Payment.objects.filter(
                student=slip.student,
                deadline=slip.deadline,
                status='verified'
            ).exists()

            if not existing_payment:
                Payment.objects.create(
                    student=slip.student,
                    deadline=slip.deadline,
                    amount=slip.amount,
                    payment_method='bank_transfer',
                    transaction_reference=slip.transaction_reference or f'SLIP-{slip.id}',
                    status='verified',
                    verified_by=None,
                    paid_by=slip.uploaded_by,
                    paid_by_phone='',
                    is_from_slip=True,
                    slip=slip
                )

        elif action == 'reject':
            slip.status = 'rejected'
            slip.save()

        else:
            return Response({'error': 'Invalid action'}, status=400)

        return Response({'success': True, 'status': slip.status})

    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def delete_slip(request, slip_id):
    """Delete a single slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)

        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass

        # Try to delete local file if it exists (development only)
        if slip.slip_image:
            local_path = os.path.join(settings.MEDIA_ROOT, slip.slip_image.name)
            if os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass

        slip.delete()

        print(f"🗑️ Deleted slip ID: {slip_id}")
        return Response({'success': True, 'message': 'Slip deleted successfully'}, status=200)

    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)


@api_view(['POST'])
@permission_classes([AllowAny])
def bulk_delete_slips(request):
    """Delete multiple slips at once"""
    slip_ids = request.data.get('slip_ids', [])
    school_id = request.headers.get('X-School-ID')

    if not slip_ids:
        return Response({'error': 'No slip IDs provided'}, status=400)

    if not school_id:
        return Response({'error': 'School ID required'}, status=400)

    try:
        slips = PaymentSlip.objects.filter(
            id__in=slip_ids,
            student__school_id=int(school_id)
        )

        if slips.count() != len(slip_ids):
            return Response({'error': 'Some slips do not belong to your school'}, status=403)

        # Try to delete local files if they exist (development only)
        for slip in slips:
            if slip.slip_image:
                local_path = os.path.join(settings.MEDIA_ROOT, slip.slip_image.name)
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception:
                        pass

        count = slips.count()
        slips.delete()

        print(f"🗑️ Bulk deleted {count} slips for school ID: {school_id}")
        return Response({
            'success': True,
            'message': f'Successfully deleted {count} slip(s)',
            'deleted_count': count
        }, status=200)

    except Exception as e:
        print(f"❌ Bulk delete error: {e}")
        return Response({'error': str(e)}, status=500)


# ========== TRANSACTION REFERENCE ENDPOINTS ==========

@api_view(['POST'])
@permission_classes([AllowAny])
def update_transaction_reference(request, slip_id):
    """Update transaction reference for a slip"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass
        
        transaction_reference = request.data.get('transaction_reference', '')
        slip.transaction_reference = transaction_reference
        slip.save()
        
        return Response({
            'success': True,
            'message': 'Transaction reference updated successfully',
            'transaction_reference': slip.transaction_reference
        })
        
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)


@api_view(['GET'])
@permission_classes([AllowAny])
def ai_stats(request):
    """Get AI verification statistics for the current school"""

    school_id = request.headers.get('X-School-ID')
    print(f"📊 ai_stats - X-School-ID: {school_id}")

    slips = PaymentSlip.objects.all()

    if school_id:
        try:
            slips = slips.filter(student__school_id=int(school_id))
        except ValueError:
            pass

    total         = slips.count()
    auto_verified = slips.filter(auto_verified=True).count()
    pending_ai    = slips.filter(ai_reviewed=False).count()
    high_conf     = slips.filter(ai_confidence__gte=85).count()

    return Response({
        'total_slips': total,
        'auto_verified': auto_verified,
        'pending_ai_review': pending_ai,
        'high_confidence': high_conf,
        'accuracy_rate': round((auto_verified / total * 100) if total > 0 else 0, 1)
    })


# ========== AUTO-EXTRACTION ENDPOINT (FIXED) ==========

@api_view(['POST'])
@permission_classes([AllowAny])
def extract_slip_data(request):
    """Extract transaction reference and data from slip image without saving"""
    try:
        slip_image = request.FILES.get('slip_image')
        if not slip_image:
            return Response({'error': 'No image provided'}, status=400)
        
        # Save temporarily for OCR
        import tempfile
        import re
        
        # Create temp file
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
            for chunk in slip_image.chunks():
                tmp_file.write(chunk)
            tmp_path = tmp_file.name
        
        extracted_data = {
            'transaction_reference': '',
            'amount': None,
            'bank_name': '',
            'transaction_date': '',
            'confidence': 0,
            'raw_text': ''
        }
        
        # Words that are NOT valid transaction references
        invalid_words = ['TRANSACTION', 'REFERENCE', 'RECEIPT', 'PAYMENT', 'BANK', 
                        'CBE', 'ETB', 'BIRR', 'AMOUNT', 'TOTAL', 'DATE', 'TIME',
                        'TRANSACTIONID', 'REFERENCEID', 'RECEIPTNO', 'RECEIPTNUMBER',
                        'TRANSACTIONID', 'REFERENCENO', 'NO', 'NUMBER']
        
        try:
            # Try to use pytesseract for OCR
            try:
                import pytesseract
                from PIL import Image
                
                # Preprocess image for better OCR
                image = Image.open(tmp_path)
                # Convert to grayscale for better OCR
                if image.mode != 'L':
                    image = image.convert('L')
                
                text = pytesseract.image_to_string(image)
                extracted_data['raw_text'] = text[:500]
                
                # Clean the text - remove common OCR errors
                text_upper = text.upper().replace('O', '0').replace('I', '1').replace('Z', '2')
                
                # Extract transaction reference (CBE patterns) - PRIORITIZED
                # Order matters: most specific first
                patterns = [
                    (r'FT[A-Z0-9]{10,}&?\d*', 'FT_REFERENCE'),      # FT26161RMPYN&13772679
                    (r'FT[A-Z0-9]{10,}', 'FT_ONLY'),                  # FT26161RMPYN
                    (r'CBE\d{8,}', 'CBE_REFERENCE'),                  # CBE123456789
                    (r'REF[:\s]*([A-Z0-9]{6,})', 'REF_REFERENCE'),    # REF123456
                    (r'TRX[:\s]*([A-Z0-9]{6,})', 'TRX_REFERENCE'),    # TRX123456
                    (r'[A-Z0-9]{10,}&?\d*', 'GENERIC'),               # Any alphanumeric with optional &
                    (r'\b\d{10,}\b', 'NUMERIC')                       # Any 10+ digit number
                ]
                
                for pattern, pattern_name in patterns:
                    match = re.search(pattern, text_upper, re.IGNORECASE)
                    if match:
                        extracted_ref = match.group(0)
                        # Skip if the extracted text is an invalid word
                        if extracted_ref.upper() not in invalid_words and len(extracted_ref) >= 5:
                            # Also skip if it's just the word "TRANSACTION" or similar
                            if extracted_ref.upper() not in ['TRANSACTION', 'REFERENCE', 'RECEIPT', 'PAYMENT']:
                                extracted_data['transaction_reference'] = extracted_ref
                                extracted_data['confidence'] = 85
                                print(f"✅ Extracted reference ({pattern_name}): {extracted_ref}")
                                break
                
                # If still no reference found, try looking for FT pattern specifically in original text
                if not extracted_data['transaction_reference']:
                    ft_match = re.search(r'FT[A-Z0-9]{5,}', text)
                    if ft_match:
                        extracted_data['transaction_reference'] = ft_match.group(0)
                        extracted_data['confidence'] = 70
                        print(f"✅ Extracted FT reference: {extracted_data['transaction_reference']}")
                
                # Extract amount
                amount_patterns = [
                    r'Amount[:\s]*([\d,]+\.?\d*)',
                    r'Birr[:\s]*([\d,]+\.?\d*)',
                    r'ETB[:\s]*([\d,]+\.?\d*)',
                    r'Total[:\s]*([\d,]+\.?\d*)',
                    r'ድምር[:\s]*([\d,]+\.?\d*)',
                    r'([\d,]+\.?\d*)\s*ETB',
                    r'([\d,]+\.?\d*)\s*Birr',
                ]
                for pattern in amount_patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        try:
                            amount_str = match.group(1).replace(',', '')
                            extracted_data['amount'] = float(amount_str)
                            if extracted_data['confidence'] < 85:
                                extracted_data['confidence'] = 70
                            print(f"✅ Extracted amount: {extracted_data['amount']}")
                            break
                        except:
                            pass
                
                # Extract bank name
                if 'CBE' in text or 'COMMERCIAL BANK' in text:
                    extracted_data['bank_name'] = 'Commercial Bank of Ethiopia'
                elif 'DASHEN' in text:
                    extracted_data['bank_name'] = 'Dashen Bank'
                elif 'AWASH' in text:
                    extracted_data['bank_name'] = 'Awash Bank'
                
            except ImportError as e:
                print(f"⚠️ pytesseract not installed: {e}")
                extracted_data['transaction_reference'] = ''
                extracted_data['confidence'] = 0
                extracted_data['message'] = 'OCR not available - please install pytesseract'
            
            # Clean up temp file
            os.unlink(tmp_path)
            
        except Exception as ocr_error:
            print(f"OCR extraction error: {ocr_error}")
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            extracted_data['message'] = f'OCR failed: {str(ocr_error)[:100]}'
        
        return Response({
            'success': True,
            'extracted': extracted_data,
            'message': 'Data extracted successfully' if extracted_data['transaction_reference'] else 'Could not detect reference number. Please enter manually.'
        })
        
    except Exception as e:
        print(f"Extraction error: {e}")
        return Response({'error': str(e)}, status=500)


# ========== VERIFIER API AUTO-VERIFICATION ==========

@api_view(['POST'])
@permission_classes([AllowAny])
def auto_verify_with_api(request, slip_id):
    """
    Automatically verify a bank slip using Verifier API
    This checks the transaction with CBE's official system
    """
    import requests
    import json
    
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass
        
        if not slip.transaction_reference:
            return Response({
                'verified': False,
                'error': 'No transaction reference found. Please ensure the slip has a reference number.'
            }, status=400)
        
        # Get API key from settings
        api_key = getattr(settings, 'VERIFIER_API_KEY', '')
        
        if not api_key:
            return Response({
                'verified': False,
                'error': 'Verifier API key not configured. Please contact administrator.'
            }, status=500)
        
        # Prepare request to Verifier API
        api_url = f"{getattr(settings, 'VERIFIER_API_URL', 'https://verify.leul.et')}/verify-cbe"
        
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key
        }
        
        payload = {
            'reference': slip.transaction_reference,
            'accountSuffix': ''
        }
        
        # Try to get account suffix from school
        if hasattr(slip.student.school, 'cbe_account_suffix') and slip.student.school.cbe_account_suffix:
            payload['accountSuffix'] = slip.student.school.cbe_account_suffix
        
        print(f"🔍 Verifying transaction: {slip.transaction_reference}")
        print(f"📡 Calling Verifier API: {api_url}")
        
        # Make API call
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        print(f"📡 API Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get('success') or result.get('verified'):
                # Transaction is VALID - Auto-verify
                slip.cbe_verification_status = 'verified'
                slip.status = 'verified'
                slip.cbe_check_method = 'verifier_api'
                slip.cbe_verification_notes = json.dumps({
                    'method': 'verifier_api',
                    'payer_name': result.get('payerName', 'Unknown'),
                    'amount': result.get('amount'),
                    'payment_date': result.get('paymentDate'),
                    'verified_at': timezone.now().isoformat()
                })
                slip.cbe_verified_at = timezone.now()
                slip.save()
                
                # Create payment record if not exists
                existing_payment = Payment.objects.filter(
                    student=slip.student,
                    deadline=slip.deadline,
                    status='verified'
                ).exists()
                
                if not existing_payment:
                    Payment.objects.create(
                        student=slip.student,
                        deadline=slip.deadline,
                        amount=float(result.get('amount', slip.amount)),
                        payment_method='bank_transfer',
                        transaction_reference=slip.transaction_reference,
                        status='verified',
                        verified_by=None,
                        paid_by=result.get('payerName', slip.uploaded_by),
                        paid_by_phone='',
                        is_from_slip=True,
                        slip=slip
                    )
                
                return Response({
                    'verified': True,
                    'message': '✅ Payment verified successfully via Verifier API!',
                    'details': {
                        'payer_name': result.get('payerName'),
                        'amount': result.get('amount'),
                        'payment_date': result.get('paymentDate'),
                        'reference': slip.transaction_reference
                    }
                })
            else:
                # Transaction is INVALID
                return Response({
                    'verified': False,
                    'message': f"❌ Transaction not found or invalid. {result.get('message', 'Please check the reference number.')}",
                    'reference': slip.transaction_reference
                })
        else:
            # API error
            return Response({
                'verified': False,
                'message': f"Verifier API error (Status {response.status_code}). Please verify manually.",
                'reference': slip.transaction_reference
            })
            
    except requests.exceptions.Timeout:
        return Response({
            'verified': False,
            'error': 'Verification request timed out. Please try again or verify manually.'
        }, status=408)
    except requests.exceptions.ConnectionError:
        return Response({
            'verified': False,
            'error': 'Cannot connect to Verifier API. Please check your internet connection.'
        }, status=503)
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)
    except Exception as e:
        print(f"❌ Auto-verify error: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)
    

# ========== VERIFY.ET API INTEGRATION (WORKING) ==========

@api_view(['POST'])
@permission_classes([AllowAny])
def check_receipt_with_verify_et(request, slip_id):
    """
    Check receipt using Verify.ET API (REAL working solution)
    This calls the official Verify.ET API that works inside Ethiopia
    """
    import requests
    import json
    from datetime import datetime
    
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        
        school_id = request.headers.get('X-School-ID')
        school = None
        
        print(f"🔍 check_receipt_with_verify_et - Slip ID: {slip_id}")
        print(f"🔍 X-School-ID header: {school_id}")
        
        if school_id:
            try:
                school = School.objects.get(id=int(school_id))
                print(f"🔍 Found school: {school.name}")
                print(f"🔍 School has verify_et_api_key: {bool(school.verify_et_api_key)}")
                print(f"🔍 School verify_et_enabled: {school.verify_et_enabled}")
                print(f"🔍 School cbe_account_suffix: {school.cbe_account_suffix}")
                
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except School.DoesNotExist:
                return Response({'error': 'School not found'}, status=404)
            except Exception as e:
                print(f"🔍 School lookup error: {e}")
                return Response({'error': f'School error: {str(e)}'}, status=400)
        else:
            return Response({'error': 'X-School-ID header is required'}, status=400)
        
        if not slip.transaction_reference:
            return Response({
                'success': False,
                'error': 'No transaction reference found. Please ensure the slip has a reference number.'
            }, status=400)
        
        # ========== CHECK IF SCHOOL HAS VERIFY.ET CONFIGURED ==========
        # If not configured, show user-friendly message with instructions
        if not school.verify_et_api_key:
            return Response({
                'success': False,
                'verified': False,
                'needs_configuration': True,
                'message': '⚠️ Verify.ET is NOT configured for this school.',
                'instruction': 'Please go to Settings → Verify.ET Configuration to add your API key.',
                'action_required': 'configure_verify_et',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        if not school.verify_et_enabled:
            return Response({
                'success': False,
                'verified': False,
                'needs_configuration': True,
                'message': '⚠️ Verify.ET is disabled for this school.',
                'instruction': 'Please go to Settings → Verify.ET Configuration and enable it.',
                'action_required': 'enable_verify_et',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        if not school.cbe_account_suffix:
            return Response({
                'success': False,
                'verified': False,
                'needs_configuration': True,
                'message': '⚠️ CBE Account Suffix is missing.',
                'instruction': 'Please go to Settings → Verify.ET Configuration and add your CBE account suffix (last 8 digits).',
                'action_required': 'add_account_suffix',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        # Clean the reference number (remove &suffix if present)
        clean_ref = slip.transaction_reference.split('&')[0].strip()
        account_suffix = school.cbe_account_suffix
        
        # Prepare request to Verify.ET API
        api_url = "https://verify.et/api/verify"
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": school.verify_et_api_key,
        }
        
        payload = {
            "bank": "cbe",
            "referenceNumber": clean_ref,
            "accountSuffix": account_suffix,
            "waitMs": 8000,
        }
        
        # Add settlement account if available (optional)
        if school.cbe_account_number:
            payload["settlementAccount"] = school.cbe_account_number
        
        print(f"🔍 Verify.ET: Checking transaction {clean_ref} for school {school.name}")
        print(f"📡 API URL: {api_url}")
        print(f"📦 Payload: {payload}")
        
        # Make API call
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        print(f"📡 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Save the raw response for debugging
            slip.verify_et_response_raw = data
            slip.verify_et_checked_at = timezone.now()
            
            if data.get("success"):
                verification = data.get("verification", {})
                status = verification.get("status", "unknown")
                tx_data = verification.get("data", {})
                
                # Update slip with verification results
                slip.verify_et_status = status
                slip.verify_et_payer_name = tx_data.get("senderName") or tx_data.get("payer", "")
                slip.verify_et_amount = tx_data.get("amount")
                slip.verify_et_date = tx_data.get("date") or tx_data.get("transactionDate", "")
                slip.verify_et_receiver = tx_data.get("receiverName") or tx_data.get("receiver", "")
                
                # Check if amount matches
                amount_matches = False
                if slip.verify_et_amount:
                    diff = abs(float(slip.verify_et_amount) - float(slip.amount))
                    amount_matches = diff <= 1.0
                
                slip.save()
                
                # Prepare response for admin
                if status == "verified":
                    return Response({
                        'success': True,
                        'verified': True,
                        'message': f'✅ Payment VERIFIED by CBE!',
                        'details': {
                            'payer_name': slip.verify_et_payer_name,
                            'amount': str(slip.verify_et_amount),
                            'date': slip.verify_et_date,
                            'receiver': slip.verify_et_receiver,
                            'reference': clean_ref,
                            'amount_matches': amount_matches,
                            'declared_amount': str(slip.amount)
                        }
                    })
                elif status == "queued":
                    return Response({
                        'success': True,
                        'verified': False,
                        'queued': True,
                        'message': '⏳ Verification queued. Please check again in a few moments.',
                        'details': {
                            'reference': clean_ref,
                            'status': 'queued'
                        }
                    })
                else:
                    return Response({
                        'success': True,
                        'verified': False,
                        'message': f'❌ Transaction {status}. Could not verify this payment.',
                        'details': {
                            'status': status,
                            'reference': clean_ref,
                            'api_response': data
                        }
                    })
            else:
                # API returned success=False
                error_msg = data.get("message", "Unknown error")
                slip.verify_et_status = 'error'
                slip.verify_et_error = error_msg
                slip.save()
                
                return Response({
                    'success': False,
                    'verified': False,
                    'message': f'❌ Verification failed: {error_msg}',
                    'error': error_msg
                })
        else:
            # HTTP error
            error_msg = f"API returned status {response.status_code}"
            slip.verify_et_status = 'error'
            slip.verify_et_error = error_msg
            slip.save()
            
            return Response({
                'success': False,
                'verified': False,
                'message': f'❌ API Error: {error_msg}',
                'error': error_msg
            })
            
    except requests.exceptions.Timeout:
        return Response({
            'success': False,
            'verified': False,
            'error': 'Request timed out. Please try again.'
        }, status=408)
    except requests.exceptions.ConnectionError:
        return Response({
            'success': False,
            'verified': False,
            'error': 'Cannot connect to Verify.ET API. Please check your internet connection.'
        }, status=503)
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)
    except Exception as e:
        print(f"❌ Verify.ET error: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_slip_from_api(request, slip_id):
    """
    Verify the slip after API check succeeded
    This creates the payment record
    """
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass
        
        # Check if API verification succeeded
        if slip.verify_et_status != 'verified':
            return Response({
                'error': 'Cannot verify: API verification has not succeeded. Please check receipt first.'
            }, status=400)
        
        # Mark slip as verified
        slip.status = 'verified'
        slip.verified_by = None
        slip.verified_at = timezone.now()
        slip.cbe_verification_status = 'cbe_verified'
        slip.cbe_check_method = 'api'
        slip.cbe_verification_notes = f"Verified via Verify.ET API - Payer: {slip.verify_et_payer_name}, Amount: {slip.verify_et_amount}"
        slip.save()
        
        # Check if payment already exists
        existing_payment = Payment.objects.filter(
            student=slip.student,
            deadline=slip.deadline,
            status='verified'
        ).exists()
        
        if not existing_payment:
            Payment.objects.create(
                student=slip.student,
                deadline=slip.deadline,
                amount=slip.verify_et_amount or slip.amount,
                payment_method='bank_transfer',
                transaction_reference=slip.transaction_reference,
                status='verified',
                verified_by=None,
                paid_by=slip.verify_et_payer_name or slip.uploaded_by,
                paid_by_phone='',
                is_from_slip=True,
                slip=slip
            )
        
        return Response({
            'success': True,
            'message': '✅ Payment verified and recorded successfully!',
            'slip_id': slip.id
        })
        
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)
    except Exception as e:
        print(f"❌ Verify error: {e}")
        return Response({'error': str(e)}, status=500)