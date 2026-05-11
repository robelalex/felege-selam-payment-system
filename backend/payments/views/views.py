# payments/views/views.py - COMPLETE FIXED WITH SCHOOL FILTERING
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from payments.models import Payment, PaymentDeadline
from students.models import Student
from payments.serializers import PaymentSerializer, PaymentDeadlineSerializer
from academics.models import AcademicYear


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()  # ✅ REQUIRED for router
    serializer_class = PaymentSerializer
    
    def get_queryset(self):
        """Filter payments by school from header AND academic year"""
        school_id = self.request.headers.get('X-School-ID')
        year_id = self.request.query_params.get('academic_year_id')
        
        print(f"💰 PaymentViewSet.get_queryset - X-School-ID: {school_id}")
        print(f"💰 PaymentViewSet.get_queryset - year_id: {year_id}")
        
        # Start with base queryset
        queryset = Payment.objects.all()
        
        # ✅ FILTER BY SCHOOL (CRITICAL FIX)
        if school_id:
            try:
                school_id_int = int(school_id)
                queryset = queryset.filter(student__school_id=school_id_int)
                print(f"💰 Filtered by school ID: {school_id_int}, count: {queryset.count()}")
            except ValueError:
                print(f"💰 Invalid school ID: {school_id}")
                return Payment.objects.none()
        else:
            print(f"💰 No school header - returning empty")
            return Payment.objects.none()
        
        # ✅ FILTER BY ACADEMIC YEAR
        if year_id:
            try:
                academic_year = AcademicYear.objects.get(id=year_id)
                print(f"💰 Academic year: {academic_year.name}")
                
                # Get student IDs in this academic year for this school
                student_ids = Student.objects.filter(
                    academic_year=academic_year.name,
                    school_id=int(school_id)
                ).values_list('id', flat=True)
                print(f"💰 Student IDs for this school/year: {list(student_ids)}")
                
                # Filter payments by those students
                queryset = queryset.filter(student_id__in=student_ids)
                print(f"💰 Payment count after year filter: {queryset.count()}")
                
            except AcademicYear.DoesNotExist:
                print(f"💰 Academic year not found")
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """List payments with school filtering"""
        print(f"💰 ===== PAYMENT LIST CALLED =====")
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        print(f"💰 Returning {len(serializer.data)} payments")
        return Response(serializer.data)
    
@action(detail=False, methods=['post'])
def initiate_payment(self, request):
    """Parent initiates a payment for a specific student and deadline (ONE at a time)"""
    student_id = request.data.get('student_id')
    deadline_id = request.data.get('deadline_id')
    amount = request.data.get('amount')
    payment_method = request.data.get('payment_method', 'telebirr')
    paid_by = request.data.get('paid_by')
    paid_by_phone = request.data.get('paid_by_phone')
    school_id = request.headers.get('X-School-ID')
    
    # Validate required fields
    if not student_id:
        return Response({'error': 'student_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    if not deadline_id:
        return Response({'error': 'deadline_id is required (pay one at a time)'}, status=status.HTTP_400_BAD_REQUEST)
    if not amount:
        return Response({'error': 'amount is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        student = Student.objects.get(student_id=student_id)
        
        # Verify student belongs to this school
        if school_id and str(student.school_id) != school_id:
            return Response({'error': 'Student does not belong to your school'}, status=403)
        
        # Get the SPECIFIC deadline (only ONE payment item)
        deadline = PaymentDeadline.objects.get(id=deadline_id)
        
        # Verify deadline belongs to this school
        if school_id and str(deadline.school_id) != school_id:
            return Response({'error': 'Deadline does not belong to your school'}, status=403)
        
        # FIX: Provide a default value for paid_by if not provided
        # Since paid_by is required (not null in model), we must provide a value
        if not paid_by:
            # Use 'Anonymous' or get from request user if available
            if request.user and request.user.is_authenticated:
                paid_by = request.user.get_full_name() or request.user.username
            else:
                paid_by = 'Anonymous User'  # Default value
        
        # Provide default for paid_by_phone if not provided
        if not paid_by_phone:
            paid_by_phone = 'Not provided'
        
        # Create payment for THIS SPECIFIC deadline only (NOT the whole year)
        payment = Payment.objects.create(
            student=student,
            deadline=deadline,  # ← Only ONE specific deadline/payment item
            amount=amount,
            payment_method=payment_method,
            paid_by=paid_by,  # Now this will never be null
            paid_by_phone=paid_by_phone,
            status='pending'
        )
        
        serializer = self.get_serializer(payment)
        return Response({
            'success': True,
            'message': f'Payment initiated successfully for {deadline.description if deadline.description else deadline.get_month_display()} {deadline.academic_year}',
            'payment': serializer.data,
            'instructions': 'Please complete the payment using Telebirr or bank transfer'
        }, status=status.HTTP_201_CREATED)
        
    except Student.DoesNotExist:
        return Response({'error': f'Student with ID {student_id} not found'}, status=404)
    except PaymentDeadline.DoesNotExist:
        return Response({'error': f'Payment deadline with ID {deadline_id} not found'}, status=404)
    except Exception as e:
        return Response({'error': f'Payment initiation failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def verify_payment(self, request, pk=None):
        """Admin verifies a payment"""
        payment = self.get_object()
        school_id = request.headers.get('X-School-ID')
        
        # ✅ Verify payment belongs to this school
        if school_id and str(payment.student.school_id) != school_id:
            return Response({'error': 'Payment does not belong to your school'}, status=403)
        
        payment.status = 'verified'
        payment.verified_at = timezone.now()
        payment.verified_by = request.user
        payment.save()
        
        return Response({'success': True, 'message': 'Payment verified successfully'})
    
    @action(detail=False, methods=['get'])
    def pending_verifications(self, request):
        """Get all payments pending verification for the current school"""
        school_id = request.headers.get('X-School-ID')
        
        if not school_id:
            return Response([], status=200)
        
        pending_payments = Payment.objects.filter(
            status='pending',
            student__school_id=int(school_id)
        )
        serializer = self.get_serializer(pending_payments, many=True)
        return Response(serializer.data)


class PaymentDeadlineViewSet(viewsets.ModelViewSet):
    queryset = PaymentDeadline.objects.all()  # ✅ REQUIRED for router
    serializer_class = PaymentDeadlineSerializer
    
    def get_queryset(self):
        """Filter deadlines by school from header"""
        school_id = self.request.headers.get('X-School-ID')
        
        if not school_id:
            return PaymentDeadline.objects.none()
        
        try:
            return PaymentDeadline.objects.filter(school_id=int(school_id))
        except ValueError:
            return PaymentDeadline.objects.none()
    
    @action(detail=False, methods=['get'])
    def active_deadlines(self, request):
        """Get all active payment deadlines for the current school"""
        school_id = request.headers.get('X-School-ID')
        
        if not school_id:
            return Response([], status=200)
        
        deadlines = PaymentDeadline.objects.filter(
            school_id=int(school_id), 
            is_active=True
        )
        serializer = self.get_serializer(deadlines, many=True)
        return Response(serializer.data)


# ===== STANDALONE FUNCTION =====
@api_view(['GET'])
def payments_filtered_by_year(request):
    """Get payments filtered by academic year AND school"""
    year_id = request.query_params.get('academic_year_id')
    school_id = request.headers.get('X-School-ID')
    
    print(f"💰 ===== PAYMENTS FILTERED BY YEAR =====")
    print(f"💰 year_id: {year_id}")
    print(f"💰 school_id: {school_id}")
    
    if not year_id:
        return Response([], status=200)
    
    if not school_id:
        return Response([], status=200)
    
    try:
        school_id = int(school_id)
        year_id = int(year_id)
    except ValueError:
        return Response([], status=200)
    
    try:
        academic_year = AcademicYear.objects.get(id=year_id, school_id=school_id)
    except AcademicYear.DoesNotExist:
        return Response([], status=200)
    
    print(f"💰 Academic year: {academic_year.name}")
    
    # Get student IDs for this specific school and academic year
    student_ids = Student.objects.filter(
        academic_year=academic_year.name,
        school_id=school_id
    ).values_list('id', flat=True)
    
    print(f"💰 Student IDs found: {list(student_ids)}")
    
    if not student_ids:
        print(f"💰 No students found, returning empty list")
        return Response([], status=200)
    
    # Get payments for these students
    payments = Payment.objects.filter(student_id__in=student_ids)
    print(f"💰 Payment count: {payments.count()}")
    
    serializer = PaymentSerializer(payments, many=True)
    return Response(serializer.data)