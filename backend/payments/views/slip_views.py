# backend/payments/views/slip_views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
from django_q.tasks import async_task
from ..models import PaymentSlip, Student, PaymentDeadline, Payment
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from ..services.ocr_service import OCRService
from academics.models import AcademicYear
from schools.models import School
from django.db import models


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def upload_slip(request):
    """
    Upload bank slip → AI extracts reference → Queue async Verify.ET check
    NO auto-approval. Verification happens in background.
    """
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
        expected_bank_name = school.bank_name if school else None
        local_path = os.path.join(settings.MEDIA_ROOT, file_path)

        ai_result = {
            'success': False,
            'confidence': 0,
            'message': 'Manual review required',
            'extracted_amount': None,
            'extracted_reference': '',
            'extracted_bank': None,
            'amount_match': False,
            'bank_match': False,
            'student_id_match': False,
        }

        if os.path.exists(local_path):
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

        # ✅ ALWAYS create slip as pending — AI NEVER auto-verifies
        slip = PaymentSlip.objects.create(
            student=student,
            deadline=deadline,
            amount=amount,
            bank_name=bank_name,
            slip_image=file_path,
            uploaded_by=request.data.get('uploaded_by', 'Parent'),
            status='pending',
            ai_confidence=ai_result.get('confidence', 0),
            ai_extracted_amount=ai_result.get('extracted_amount'),
            ai_message=ai_result.get('message', ''),
            ai_reviewed=True,
            # Use AI-extracted reference if user didn't provide one
            transaction_reference=transaction_reference or ai_result.get('extracted_reference', ''),
            verification_status='pending',  # ✅ NEW async workflow field
        )

        # ✅ QUEUE BACKGROUND VERIFICATION TASK
        if school_id and slip.transaction_reference:
            task_id = async_task(
                'payments.tasks.verify_slip_async',
                slip.id,
                int(school_id)
            )
            slip.verify_et_task_id = task_id
            slip.verification_status = 'queued'
            slip.save(update_fields=['verify_et_task_id', 'verification_status'])
            print(f"[UPLOAD] 📤 Queued verify task #{task_id} for slip #{slip.id}")
        elif not slip.transaction_reference:
            slip.verification_status = 'manual_review'
            slip.verification_error = 'No transaction reference detected'
            slip.save(update_fields=['verification_status', 'verification_error'])

        return Response({
            'success': True,
            'message': 'Slip uploaded successfully. Verification started in background.',
            'slip_id': slip.id,
            'verification_status': slip.verification_status,
            'ai_confidence': ai_result.get('confidence', 0),
            'ai_details': {
                'extracted_amount': ai_result.get('extracted_amount'),
                'extracted_bank': ai_result.get('extracted_bank'),
                'extracted_reference': ai_result.get('extracted_reference'),
                'amount_match': ai_result.get('amount_match', False),
                'bank_match': ai_result.get('bank_match', False),
                'student_id_match': ai_result.get('student_id_match', False),
            },
            'requires_admin_review': slip.verification_status == 'manual_review',
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
def slip_status(request, slip_id):
    """
    Lightweight status check for frontend polling.
    Returns current verification state without heavy queries.
    """
    try:
        slip = PaymentSlip.objects.only(
            'id', 'verification_status', 'verify_et_status',
            'verify_et_payer_name', 'verify_et_amount', 'verification_error',
            'status', 'verified_at_system'
        ).get(id=slip_id)

        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Unauthorized'}, status=403)
            except Exception:
                pass

        return Response({
            'slip_id': slip.id,
            'verification_status': slip.verification_status,
            'verify_et_status': slip.verify_et_status,
            'payer_name': slip.verify_et_payer_name,
            'bank_amount': str(slip.verify_et_amount) if slip.verify_et_amount else None,
            'error': slip.verification_error,
            'payment_status': slip.status,
            'verified_at': slip.verified_at_system.isoformat() if slip.verified_at_system else None,
        })

    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_slips(request):
    """Get slips needing attention, filtered by school, grade, month, and student search"""
    school_id = request.headers.get('X-School-ID')
    print(f"📱 pending_slips - X-School-ID: {school_id}")

    if not school_id:
        return Response([], status=200)

    # ✅ Filter by verification_status instead of old status
    slips = PaymentSlip.objects.filter(
        verification_status__in=['pending', 'queued', 'failed', 'manual_review', 'timeout']
    )

    # Filter by school
    try:
        slips = slips.filter(student__school_id=int(school_id))
        print(f" Filtered slips by school ID: {school_id}")
    except ValueError:
        print(f" Invalid school ID: {school_id}")
        return Response([], status=200)

    # Filter by grade
    grade = request.query_params.get('grade')
    if grade and grade != 'all' and grade != 'None':
        try:
            slips = slips.filter(student__grade=int(grade))
        except (ValueError, TypeError):
            pass

    # Filter by month
    month = request.query_params.get('month')
    if month and month != 'all' and month != 'None':
        try:
            slips = slips.filter(deadline__month=int(month))
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

    # Filter by academic year
    year_value = request.query_params.get('academic_year_id') or \
                 request.query_params.get('academic_year') or \
                 request.query_params.get('year')

    if year_value:
        try:
            year = AcademicYear.objects.get(id=int(year_value))
            slips = slips.filter(student__academic_year=year.name)
        except (ValueError, AcademicYear.DoesNotExist):
            try:
                year = AcademicYear.objects.get(year_ec=int(year_value))
                slips = slips.filter(student__academic_year=year.name)
            except (ValueError, AcademicYear.DoesNotExist):
                slips = slips.filter(student__academic_year=year_value)

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
            'transaction_reference': s.transaction_reference or '',
            # ✅ NEW async fields
            'verification_status': s.verification_status,
            'verify_et_status': s.verify_et_status,
            'verify_et_payer_name': s.verify_et_payer_name,
            'verify_et_amount': str(s.verify_et_amount) if s.verify_et_amount else None,
            'verification_error': s.verification_error,
            'verified_at_system': s.verified_at_system.isoformat() if s.verified_at_system else None,
        })

    print(f"📱 Returning {len(data)} slips needing attention")
    return Response(data)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_slip(request, slip_id):
    """Manual verify or reject by admin (override async result)"""
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
            slip.verification_status = 'verified'
            slip.auto_verified_by_system = False  # Manual override
            slip.cbe_verification_status = 'cbe_verified'
            slip.cbe_check_method = 'manual'
            slip.cbe_verified_by = request.user if request.user.is_authenticated else None
            slip.cbe_verified_at = timezone.now()
            slip.save()

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
                    slip=slip,
                    verified_at=timezone.now(),
                )

        elif action == 'reject':
            slip.status = 'rejected'
            slip.verification_status = 'failed'
            slip.verification_error = request.data.get('reason', 'Rejected by admin')
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


@api_view(['POST'])
@permission_classes([AllowAny])
def update_transaction_reference(request, slip_id):
    """Update transaction reference and re-trigger verification"""
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
        slip.verification_status = 'pending'
        slip.verification_error = ''
        slip.save(update_fields=['transaction_reference', 'verification_status', 'verification_error'])
        
        # ✅ Re-queue verification with new reference
        task_id = async_task('payments.tasks.verify_slip_async', slip.id, int(school_id))
        slip.verify_et_task_id = task_id
        slip.verification_status = 'queued'
        slip.save(update_fields=['verify_et_task_id', 'verification_status'])
        
        return Response({
            'success': True,
            'message': 'Reference updated. Re-verification queued.',
            'transaction_reference': slip.transaction_reference,
            'task_id': task_id,
        })
        
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)


@api_view(['GET'])
@permission_classes([AllowAny])
def ai_stats(request):
    """Get AI extraction statistics (no longer approval stats)"""
    school_id = request.headers.get('X-School-ID')

    slips = PaymentSlip.objects.all()
    if school_id:
        try:
            slips = slips.filter(student__school_id=int(school_id))
        except ValueError:
            pass

    total = slips.count()
    high_conf = slips.filter(ai_confidence__gte=85).count()
    ref_detected = slips.exclude(transaction_reference='').count()

    return Response({
        'total_slips': total,
        'reference_detected': ref_detected,
        'high_confidence_extraction': high_conf,
        'detection_rate': round((ref_detected / total * 100) if total > 0 else 0, 1),
    })


# ========== AUTO-EXTRACTION ENDPOINT (UNCHANGED) ==========
@api_view(['POST'])
@permission_classes([AllowAny])
def extract_slip_data(request):
    """Extract transaction reference and data from slip image without saving"""
    try:
        slip_image = request.FILES.get('slip_image')
        if not slip_image:
            return Response({'error': 'No image provided'}, status=400)
        
        import tempfile, re, os
        
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
        
        invalid_words = ['TRANSACTION', 'REFERENCE', 'RECEIPT', 'PAYMENT', 'BANK', 
                        'CBE', 'ETB', 'BIRR', 'AMOUNT', 'TOTAL', 'DATE', 'TIME',
                        'TRANSACTIONID', 'REFERENCEID', 'RECEIPTNO', 'RECEIPTNUMBER',
                        'REFERENCENO', 'NO', 'NUMBER']
        
        try:
            try:
                import pytesseract
                from PIL import Image
                
                image = Image.open(tmp_path)
                if image.mode != 'L':
                    image = image.convert('L')
                
                text = pytesseract.image_to_string(image)
                extracted_data['raw_text'] = text[:500]
                text_upper = text.upper().replace('O', '0').replace('I', '1').replace('Z', '2')
                
                patterns = [
                    (r'FT[A-Z0-9]{10,}&?\d*', 'FT_REFERENCE'),
                    (r'FT[A-Z0-9]{10,}', 'FT_ONLY'),
                    (r'CBE\d{8,}', 'CBE_REFERENCE'),
                    (r'REF[:\s]*([A-Z0-9]{6,})', 'REF_REFERENCE'),
                    (r'TRX[:\s]*([A-Z0-9]{6,})', 'TRX_REFERENCE'),
                    (r'[A-Z0-9]{10,}&?\d*', 'GENERIC'),
                    (r'\b\d{10,}\b', 'NUMERIC')
                ]
                
                for pattern, pattern_name in patterns:
                    match = re.search(pattern, text_upper, re.IGNORECASE)
                    if match:
                        extracted_ref = match.group(0)
                        if extracted_ref.upper() not in invalid_words and len(extracted_ref) >= 5:
                            if extracted_ref.upper() not in ['TRANSACTION', 'REFERENCE', 'RECEIPT', 'PAYMENT']:
                                extracted_data['transaction_reference'] = extracted_ref
                                extracted_data['confidence'] = 85
                                print(f"✅ Extracted reference ({pattern_name}): {extracted_ref}")
                                break
                
                if not extracted_data['transaction_reference']:
                    ft_match = re.search(r'FT[A-Z0-9]{5,}', text)
                    if ft_match:
                        extracted_data['transaction_reference'] = ft_match.group(0)
                        extracted_data['confidence'] = 70
                
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
                            break
                        except:
                            pass
                
                if 'CBE' in text or 'COMMERCIAL BANK' in text:
                    extracted_data['bank_name'] = 'Commercial Bank of Ethiopia'
                elif 'DASHEN' in text:
                    extracted_data['bank_name'] = 'Dashen Bank'
                elif 'AWASH' in text:
                    extracted_data['bank_name'] = 'Awash Bank'
                    
            except ImportError as e:
                print(f"⚠️ pytesseract not installed: {e}")
            
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


# ========== LEGACY MANUAL VERIFY ENDPOINTS (KEPT FOR OVERRIDE) ==========

@api_view(['POST'])
@permission_classes([AllowAny])
def check_receipt_with_verify_et(request, slip_id):
    """
    Manual sync verification (kept for admin override when async fails).
    Same logic as before — blocks request but gives immediate result.
    """
    import requests, json, time
    
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        school_id = request.headers.get('X-School-ID')
        school = None
        
        print(f"🔍 check_receipt_with_verify_et - Slip ID: {slip_id}")
        print(f"🔍 X-School-ID header: {school_id}")
        
        if school_id:
            try:
                school = School.objects.get(id=int(school_id))
                print(f" Found school: {school.name}")
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except School.DoesNotExist:
                return Response({'error': 'School not found'}, status=404)
            except Exception as e:
                return Response({'error': f'School error: {str(e)}'}, status=400)
        else:
            return Response({'error': 'X-School-ID header is required'}, status=400)
        
        if not slip.transaction_reference:
            return Response({
                'success': False, 'error': 'No transaction reference found.'
            }, status=400)
        
        if not school.verify_et_api_key:
            return Response({
                'success': False, 'verified': False, 'needs_configuration': True,
                'message': '⚠️ Verify.ET is NOT configured for this school.',
                'instruction': 'Please go to Settings → Verify.ET Configuration to add your API key.',
                'action_required': 'configure_verify_et',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        if not school.verify_et_enabled:
            return Response({
                'success': False, 'verified': False, 'needs_configuration': True,
                'message': '⚠️ Verify.ET is disabled for this school.',
                'instruction': 'Please go to Settings → Verify.ET Configuration and enable it.',
                'action_required': 'enable_verify_et',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        if not school.cbe_account_suffix:
            return Response({
                'success': False, 'verified': False, 'needs_configuration': True,
                'message': '️ CBE Account Suffix is missing.',
                'instruction': 'Please go to Settings → Verify.ET Configuration and add your CBE account suffix.',
                'action_required': 'add_account_suffix',
                'settings_url': '/school/verify-et-settings'
            }, status=200)
        
        clean_ref = slip.transaction_reference.split('&')[0].strip()
        api_url = "https://verify.et/api/verify"
        headers = {"Content-Type": "application/json", "x-api-key": school.verify_et_api_key}
        payload = {
            "bank": "cbe",
            "referenceNumber": clean_ref,
            "accountSuffix": school.cbe_account_suffix,
            "waitMs": 5000,
        }
        if school.cbe_account_number:
            payload["settlementAccount"] = school.cbe_account_number
        
        print(f"🔍 Verify.ET: Checking transaction {clean_ref} for school {school.name}")
        response = requests.post(api_url, json=payload, headers=headers, timeout=10)
        print(f"📡 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            return process_verify_et_response(slip, data, clean_ref)
        elif response.status_code == 202:
            data = response.json()
            status_url = data.get('links', {}).get('statusUrl') or data.get('statusUrl')
            if not status_url:
                return Response({
                    'success': False, 'verified': False, 'queued': True,
                    'message': 'Request queued but no status URL provided.',
                    'reference': clean_ref
                })
            
            full_url = f"https://verify.et{status_url}" if status_url.startswith('/') else status_url
            print(f" Polling status URL: {full_url}")
            
            delays = [5, 10, 20, 30, 30]
            for attempt, delay in enumerate(delays, 1):
                time.sleep(delay)
                try:
                    poll_response = requests.get(full_url, headers=headers, timeout=10)
                    print(f" Poll attempt {attempt}: Status {poll_response.status_code}")
                    
                    if poll_response.status_code == 200:
                        poll_data = poll_response.json()
                        verification = poll_data.get('verification', {})
                        status = verification.get('status', 'pending')
                        
                        if status == 'verified':
                            return process_verify_et_response(slip, poll_data, clean_ref)
                        elif status == 'failed':
                            return Response({
                                'success': False, 'verified': False,
                                'message': '❌ Transaction verification failed.',
                                'reference': clean_ref
                            })
                        elif status == 'pending':
                            continue
                    elif poll_response.status_code == 404:
                        continue
                except Exception as e:
                    print(f"⚠️ Poll error: {e}")
                    continue
            
            return Response({
                'success': False, 'verified': False, 'queued': True,
                'message': ' Verification timed out. Please try again later.',
                'reference': clean_ref
            })
        else:
            return Response({
                'success': False, 'verified': False,
                'message': f'API returned status {response.status_code}',
                'reference': clean_ref
            })
            
    except requests.exceptions.Timeout:
        return Response({'success': False, 'verified': False, 'error': 'Request timed out.'}, status=408)
    except requests.exceptions.ConnectionError:
        return Response({'success': False, 'verified': False, 'error': 'Cannot connect to Verify.ET API.'}, status=503)
    except PaymentSlip.DoesNotExist:
        return Response({'error': 'Slip not found'}, status=404)
    except Exception as e:
        print(f"❌ Verify.ET error: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=500)


def process_verify_et_response(slip, data, clean_ref):
    """Process successful Verify.ET response and update slip + create payment"""
    try:
        verification = data.get('verification', {})
        tx_data = verification.get('data', {})
        
        payer_name = tx_data.get('senderName') or tx_data.get('payer', '')
        bank_amount = tx_data.get('amount')
        tx_date = tx_data.get('date') or tx_data.get('transactionDate', '')
        receiver = tx_data.get('receiverName') or tx_data.get('receiver', '')
        
        amount_matches = False
        if bank_amount:
            try:
                diff = abs(float(bank_amount) - float(slip.amount))
                amount_matches = diff <= 1.0
            except (ValueError, TypeError):
                pass
        
        slip.verify_et_status = 'verified'
        slip.verify_et_payer_name = payer_name
        slip.verify_et_amount = bank_amount
        slip.verify_et_date = tx_date
        slip.verify_et_receiver = receiver
        slip.verify_et_response_raw = data
        slip.verify_et_checked_at = timezone.now()
        
        if amount_matches:
            slip.verification_status = 'verified'
            slip.status = 'verified'
            slip.verified_at_system = timezone.now()
            slip.cbe_verification_status = 'cbe_verified'
            slip.cbe_check_method = 'api'
            slip.cbe_verified_at = timezone.now()
        else:
            slip.verification_status = 'manual_review'
            slip.verification_error = f'Amount mismatch: declared={slip.amount}, bank={bank_amount}'
        
        slip.save()
        
        if slip.verification_status == 'verified':
            existing = Payment.objects.filter(
                student=slip.student, deadline=slip.deadline, status='verified'
            ).exists()
            
            if not existing:
                Payment.objects.create(
                    student=slip.student,
                    deadline=slip.deadline,
                    amount=bank_amount or slip.amount,
                    payment_method='bank_transfer',
                    transaction_reference=clean_ref,
                    status='verified',
                    verified_by=None,
                    paid_by=payer_name or slip.uploaded_by,
                    paid_by_phone='',
                    is_from_slip=True,
                    slip=slip,
                    verified_at=timezone.now(),
                )
        
        return Response({
            'success': True,
            'verified': slip.verification_status == 'verified',
            'message': '✅ Payment VERIFIED by CBE!' if slip.verification_status == 'verified' else '️ Amount mismatch - needs review',
            'details': {
                'payer_name': payer_name,
                'amount': str(bank_amount),
                'date': tx_date,
                'receiver': receiver,
                'reference': clean_ref,
                'amount_matches': amount_matches,
                'declared_amount': str(slip.amount),
            }
        })
    except Exception as e:
        print(f"❌ Error processing response: {e}")
        return Response({'success': False, 'verified': False, 'message': f'Error: {str(e)}'})


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_slip_from_api(request, slip_id):
    """Create payment record after manual API check succeeded"""
    try:
        slip = PaymentSlip.objects.get(id=slip_id)
        school_id = request.headers.get('X-School-ID')
        if school_id:
            try:
                if str(slip.student.school_id) != school_id:
                    return Response({'error': 'Slip does not belong to your school'}, status=403)
            except Exception:
                pass
        
        if slip.verify_et_status != 'verified':
            return Response({
                'error': 'Cannot verify: API verification has not succeeded.'
            }, status=400)
        
        slip.status = 'verified'
        slip.verified_by = None
        slip.verified_at = timezone.now()
        slip.verification_status = 'verified'
        slip.cbe_verification_status = 'cbe_verified'
        slip.cbe_check_method = 'api'
        slip.cbe_verification_notes = f"Verified via Verify.ET API - Payer: {slip.verify_et_payer_name}, Amount: {slip.verify_et_amount}"
        slip.save()
        
        existing_payment = Payment.objects.filter(
            student=slip.student, deadline=slip.deadline, status='verified'
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
                slip=slip,
                verified_at=timezone.now(),
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