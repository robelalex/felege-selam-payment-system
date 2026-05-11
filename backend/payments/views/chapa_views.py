# backend/payments/views/chapa_views.py
import json
import uuid
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from ..services.chapa_service import ChapaService
from ..models import Payment, PaymentDeadline
from students.models import Student

@api_view(['POST'])
@permission_classes([AllowAny])
def initiate_chapa_payment(request):
    """Initiate a Chapa payment"""
    try:
        print("📱 Initiate Chapa payment called")
        print(f"📱 Request data: {request.data}")
        
        data = request.data
        student_id = data.get('student_id')
        deadline_id = data.get('deadline_id')
        amount = data.get('amount')
        email = data.get('email', 'parent@example.com')
        first_name = data.get('first_name', 'Parent')
        last_name = data.get('last_name', 'Name')
        tx_ref = data.get('tx_ref')
        
        # Validate required fields
        if not student_id:
            return JsonResponse({
                'success': False, 
                'error': 'Student ID is required'
            }, status=400)
        
        if not deadline_id:
            return JsonResponse({
                'success': False, 
                'error': 'Deadline ID is required'
            }, status=400)
        
        if not amount:
            return JsonResponse({
                'success': False, 
                'error': 'Amount is required'
            }, status=400)
        
        # Verify student and deadline exist
        try:
            student = Student.objects.get(student_id=student_id)
            print(f"📱 Student found: {student.full_name}")
        except Student.DoesNotExist:
            return JsonResponse({
                'success': False, 
                'error': f'Student with ID {student_id} not found'
            }, status=404)
        
        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id)
            print(f"📱 Deadline found: {deadline.get_month_display()}")
        except PaymentDeadline.DoesNotExist:
            return JsonResponse({
                'success': False, 
                'error': f'Deadline with ID {deadline_id} not found'
            }, status=404)
        
        # Generate unique transaction reference if not provided
        if not tx_ref:
            tx_ref = f"tx-{student.student_id}-{deadline.id}-{uuid.uuid4().hex[:8]}"
        
        # Check if payment already exists for this student and deadline (ANY status)
        existing_payment = Payment.objects.filter(
            student=student,
            deadline=deadline
        ).first()

        if existing_payment:
            if existing_payment.status == 'verified':
                return JsonResponse({
                    'success': False,
                    'error': f'Payment for {deadline.get_month_display()} already verified'
                }, status=400)
            else:
                # Payment already pending, don't create another
                return JsonResponse({
                    'success': False,
                    'error': f'Payment for {deadline.get_month_display()} is already pending verification'
                }, status=400)
        
        # ✅ Create payment record (pending) - THIS MUST BE OUTSIDE THE IF BLOCK
        payment = Payment.objects.create(
            student=student,
            deadline=deadline,
            amount=amount,
            payment_method='chapa',
            status='pending',
            paid_by=f"{first_name} {last_name}",
            paid_by_phone=student.parent_phone,
            transaction_reference=tx_ref
        )
        
        print(f"📱 Payment record created with ID: {payment.id}")
        
        # Initialize Chapa payment
        try:
            service = ChapaService()
            
            # Get base URL for webhook
            base_url = request.build_absolute_uri('/').rstrip('/')
            
            # Return URL must point to React frontend
            return_url = f"http://localhost:3000/payment/success?tx_ref={tx_ref}"
            callback_url = f"{base_url}/api/chapa/webhook/"
            
            result = service.initialize_payment(
                amount=float(amount),
                currency='ETB',
                email=email,
                first_name=first_name,
                last_name=last_name,
                tx_ref=tx_ref,
                callback_url=callback_url,
                return_url=return_url,
                title=f"Grade {student.grade} Fee",
                description=f"{deadline.get_month_display()} {deadline.academic_year}"
            )
            
            print(f"📱 Chapa service response: {result}")
            
            if result.get('success'):
                return JsonResponse({
                    'success': True,
                    'checkout_url': result.get('checkout_url'),
                    'tx_ref': tx_ref,
                    'payment_id': payment.id,
                    'message': 'Payment initiated successfully'
                })
            else:
                # Delete the pending payment record
                payment.delete()
                
                error_msg = result.get('error', 'Unknown error from Chapa')
                print(f"❌ Chapa error: {error_msg}")
                
                # Check for specific errors
                if 'secret key' in error_msg.lower() or 'api key' in error_msg.lower():
                    return JsonResponse({
                        'success': False,
                        'error': 'Chapa payment is not configured. Please use "Test Payment" mode.',
                        'fallback_to_test': True
                    }, status=500)
                else:
                    return JsonResponse({
                        'success': False,
                        'error': error_msg
                    }, status=500)
                    
        except Exception as chapa_error:
            print(f"❌ Chapa service exception: {chapa_error}")
            payment.delete()
            return JsonResponse({
                'success': False,
                'error': f'Chapa payment service error: {str(chapa_error)}',
                'fallback_to_test': True
            }, status=500)
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': f'Server error: {str(e)}'
        }, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def test_payment(request):
    """TEST MODE: Redirect to Chapa test payment page"""
    try:
        print("📱 Test payment initiated - Redirecting to Chapa")
        data = request.data
        
        student_id = data.get('student_id')
        deadline_id = data.get('deadline_id')
        amount = data.get('amount')
        paid_by = data.get('paid_by', 'Test User')
        paid_by_phone = data.get('paid_by_phone', '0912345678')
        
        if not student_id or not deadline_id:
            return JsonResponse({
                'success': False,
                'error': 'Student ID and Deadline ID are required'
            }, status=400)
        
        # Get student and deadline
        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Student not found'
            }, status=404)
        
        try:
            deadline = PaymentDeadline.objects.get(id=deadline_id)
        except PaymentDeadline.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Deadline not found'
            }, status=404)
        
        # Check if already paid
        existing = Payment.objects.filter(
            student=student,
            deadline=deadline,
            status='verified'
        ).first()
        
        if existing:
            return JsonResponse({
                'success': False,
                'error': f'Payment for already verified'
            }, status=400)
        
        # ✅ English month names for Chapa API
        english_months = {
            'መስከረም': 'Meskerem', 'ጥቅምት': 'Tikimt', 'ህዳር': 'Hidar', 'ታህሳስ': 'Tahsas',
            'ጥር': 'Tir', 'የካቲት': 'Yekatit', 'መጋቢት': 'Megabit', 'ሚያዝያ': 'Miazia',
            'ግንቦት': 'Ginbot', 'ሰኔ': 'Sene', 'ሐምሌ': 'Hamle', 'ነሐሴ': 'Nehase', 'ጳጉሜ': 'Pagume'
        }
        month_name_amharic = deadline.get_month_display()
        month_english = english_months.get(month_name_amharic, 'Monthly Fee')
        
        # Generate transaction reference
        import uuid
        tx_ref = f"CHAPA-{student.student_id}-{deadline.id}-{uuid.uuid4().hex[:8]}"
        
        # Create payment record (pending)
        payment = Payment.objects.create(
            student=student,
            deadline=deadline,
            amount=amount or deadline.amount,
            payment_method='chapa',
            status='pending',
            paid_by=paid_by,
            paid_by_phone=paid_by_phone,
            transaction_reference=tx_ref
        )
        
        print(f"✅ Payment record created for {student.full_name}")
        
        # Initialize Chapa service
        chapa_service = ChapaService()
        
        # Get parent email
        email = student.parent_email or f"{student.student_id}@parent.com"
        first_name = student.first_name or "Parent"
        last_name = student.last_name or "Name"
        
        # ✅ FIXED: Use PRODUCTION URLs (only these 2 lines changed)
        result = chapa_service.initialize_payment(
            amount=float(amount or deadline.amount),
            currency='ETB',
            email=email,
            first_name=first_name,
            last_name=last_name,
            tx_ref=tx_ref,
            callback_url="https://felege-selam-payment-system.onrender.com/api/chapa/webhook/",
            return_url=f"https://felege-selam-payment-system.vercel.app/payment/success?tx_ref={tx_ref}",
            title=f"{month_english} Fee",
            description=f"Payment for {month_english} {deadline.academic_year}"
        )
        
        print(f"📱 Chapa result: {result}")
        
        if result.get('success'):
            # ✅ Return checkout_url so frontend can redirect
            return JsonResponse({
                'success': True,
                'checkout_url': result.get('checkout_url'),
                'tx_ref': tx_ref,
                'payment_id': payment.id,
                'message': 'Redirecting to Chapa payment page'
            })
        else:
            # If Chapa fails, delete the payment record
            payment.delete()
            return JsonResponse({
                'success': False,
                'error': result.get('error', 'Chapa payment initialization failed')
            }, status=500)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
def chapa_webhook(request):
    """Handle Chapa webhook notification"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            print(f"📥 Webhook received: {data}")
            
            tx_ref = data.get('tx_ref')
            status = data.get('status')
            
            if tx_ref and status == 'success':
                payment = Payment.objects.filter(transaction_reference=tx_ref).first()
                
                if payment and payment.status != 'verified':
                    payment.status = 'verified'
                    payment.verified_at = timezone.now()
                    payment.save()
                    print(f"✅ Payment {tx_ref} verified successfully")
                    
                    return JsonResponse({'status': 'success'})
            
            return JsonResponse({'status': 'received'})
            
        except Exception as e:
            print(f"❌ Webhook error: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@api_view(['GET'])
@permission_classes([AllowAny])
def verify_chapa_payment(request):
    """Verify a payment status"""
    tx_ref = request.GET.get('tx_ref')
    
    if not tx_ref:
        return JsonResponse({'error': 'Missing tx_ref'}, status=400)
    
    try:
        # First check local database
        payment = Payment.objects.filter(transaction_reference=tx_ref).first()
        
        if payment and payment.status == 'verified':
            return JsonResponse({
                'success': True,
                'status': 'success',
                'verified': True,
                'payment_id': payment.id
            })
        
        # If not in local DB, try Chapa API
        try:
            service = ChapaService()
            result = service.verify_payment(tx_ref)
            
            if result.get('success'):
                payment_data = result.get('data', {}).get('data', {})
                status = payment_data.get('status')
                
                if payment and status == 'success' and payment.status != 'verified':
                    payment.status = 'verified'
                    payment.verified_at = timezone.now()
                    payment.save()
                
                return JsonResponse({
                    'success': True,
                    'status': status,
                    'verified': status == 'success'
                })
            else:
                return JsonResponse({'error': result.get('error')}, status=500)
                
        except Exception as api_error:
            # If Chapa API fails, return local status if payment exists
            if payment:
                return JsonResponse({
                    'success': True,
                    'status': payment.status,
                    'verified': payment.status == 'verified',
                    'from_local': True
                })
            else:
                raise api_error
            
    except Exception as e:
        print(f"❌ Verify error: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_chapa_banks(request):
    """Get list of supported banks"""
    try:
        service = ChapaService()
        result = service.get_banks()
        
        if result.get('success'):
            return JsonResponse({'success': True, 'banks': result.get('data')})
        else:
            # Return mock banks as fallback
            mock_banks = [
                {'id': '1', 'name': 'Commercial Bank of Ethiopia'},
                {'id': '2', 'name': 'Dashen Bank'},
                {'id': '3', 'name': 'Awash Bank'},
            ]
            return JsonResponse({'success': True, 'banks': mock_banks, 'mock': True})
            
    except Exception as e:
        # Return mock banks on error
        mock_banks = [
            {'id': '1', 'name': 'Commercial Bank of Ethiopia'},
            {'id': '2', 'name': 'Dashen Bank'},
            {'id': '3', 'name': 'Awash Bank'},
        ]
        return JsonResponse({'success': True, 'banks': mock_banks, 'mock': True})


# ========== NEW FUNCTION ADDED ==========
@api_view(['GET'])
@permission_classes([AllowAny])
def payment_status(request, tx_ref):
    """Get payment status by transaction reference"""
    try:
        print(f"🔍 Checking payment status for tx_ref: {tx_ref}")
        
        # Check local database
        payment = Payment.objects.filter(transaction_reference=tx_ref).first()
        
        if payment:
            print(f"🔍 Found payment in database: Status={payment.status}")
            return JsonResponse({
                'success': True,
                'status': payment.status,
                'verified': payment.status == 'verified',
                'amount': str(payment.amount),
                'student_name': payment.student.full_name,
                'month': payment.deadline.get_month_display() if payment.deadline else 'N/A'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'Payment not found'
            }, status=404)
            
    except Exception as e:
        print(f"❌ Payment status error: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)