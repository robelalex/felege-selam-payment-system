# backend/admin_dashboard/views.py
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from django.contrib.auth import login
import json

from schools.models import School, SchoolAdminProfile
from students.models import Student
from payments.models import Payment, PaymentDeadline, PaymentSlip
from academics.models import AcademicYear, YearPromotionLog
from authentication.models import UserProfile

# ===== DIRECT ACCESS - NO LOGIN REQUIRED =====
def auto_login_and_redirect(request):
    """Direct access to dashboard - bypass all authentication"""
    try:
        user = User.objects.get(username='robelalex')
        login(request, user)
        return redirect('/admin-dashboard/dashboard/')
    except User.DoesNotExist:
        return HttpResponse('Super admin user "robelalex" not found. Please create this user first.')

# ===== DASHBOARD - SIMPLIFIED FOR SUPER ADMIN =====
def dashboard(request):
    # Handle POST actions (approve/reject)
    if request.method == 'POST':
        action = request.POST.get('action')
        user_id = request.POST.get('user_id')
        
        if action == 'approve_school' and user_id:
            try:
                user = User.objects.get(id=user_id)
                user.is_active = True
                user.is_staff = True
                user.save()
                if hasattr(user, 'profile'):
                    user.profile.is_email_verified = True
                    user.profile.role = 'school_admin'
                    user.profile.save()
                return redirect('/admin-dashboard/dashboard/')
            except User.DoesNotExist:
                pass
        
        if action == 'reject_school' and user_id:
            try:
                user = User.objects.get(id=user_id)
                if hasattr(user, 'profile') and user.profile.school_id:
                    try:
                        school = School.objects.get(id=user.profile.school_id)
                        school.delete()
                    except:
                        pass
                user.delete()
                return redirect('/admin-dashboard/dashboard/')
            except User.DoesNotExist:
                pass
    
    # Get pending schools (where user is inactive)
    pending_users = User.objects.filter(is_active=False, profile__role='school_admin').select_related('profile')
    
    pending_schools = []
    for user in pending_users:
        if hasattr(user, 'profile') and user.profile.school_id:
            try:
                school = School.objects.get(id=user.profile.school_id)
                pending_schools.append({
                    'id': school.id,
                    'name': school.name,
                    'code': school.code,
                    'admin_name': f"{user.first_name} {user.last_name}".strip() or user.username,
                    'admin_email': user.email,
                    'admin_phone': user.profile.phone or 'N/A',
                    'admin_id': user.id,
                    'created_at': school.created_at if hasattr(school, 'created_at') else user.date_joined
                })
            except School.DoesNotExist:
                pass
    
    # Get approved schools
    approved_users = User.objects.filter(is_active=True, profile__role='school_admin').select_related('profile')
    approved_schools_list = []
    for user in approved_users:
        if hasattr(user, 'profile') and user.profile.school_id:
            try:
                school = School.objects.get(id=user.profile.school_id)
                approved_schools_list.append({
                    'name': school.name,
                    'code': school.code,
                    'admin_email': user.email,
                    'approved_date': user.date_joined
                })
            except School.DoesNotExist:
                pass
    
    context = {
        'total_schools': len(pending_schools) + len(approved_schools_list),
        'pending_approvals': len(pending_schools),
        'approved_schools': len(approved_schools_list),
        'pending_schools': pending_schools,
        'approved_schools_list': approved_schools_list,
    }
    return render(request, 'admin_dashboard/dashboard.html', context)

# ===== USER MANAGEMENT (KEPT FOR REFERENCE - YOU MAY NOT NEED) =====
def users_list(request):
    users = User.objects.all().select_related('profile').order_by('-date_joined')
    return render(request, 'admin_dashboard/users.html', {'users': users})

def user_edit(request, user_id):
    user = get_object_or_404(User, id=user_id)
    
    if request.method == 'POST':
        user.username = request.POST.get('username')
        user.email = request.POST.get('email')
        user.first_name = request.POST.get('first_name', '')
        user.last_name = request.POST.get('last_name', '')
        user.is_active = request.POST.get('is_active') == 'on'
        user.is_staff = request.POST.get('is_staff') == 'on'
        user.is_superuser = request.POST.get('is_superuser') == 'on'
        
        new_password = request.POST.get('new_password')
        if new_password:
            user.password = make_password(new_password)
        
        user.save()
        
        if hasattr(user, 'profile'):
            user.profile.role = request.POST.get('role', 'staff')
            user.profile.phone = request.POST.get('phone', '')
            user.profile.save()
        
        return redirect('/admin-dashboard/users/')
    
    return render(request, 'admin_dashboard/user_edit.html', {'user': user})

def user_delete(request, user_id):
    user = get_object_or_404(User, id=user_id)
    if request.method == 'POST':
        user.delete()
        return redirect('/admin-dashboard/users/')
    
    return render(request, 'admin_dashboard/user_delete.html', {'user': user})

# ===== SCHOOL MANAGEMENT (FOR APPROVED SCHOOLS - LIMITED ACCESS) =====
def schools_list(request):
    schools = School.objects.all().order_by('-created_at')
    return render(request, 'admin_dashboard/schools.html', {'schools': schools})

def school_edit(request, school_id):
    school = get_object_or_404(School, id=school_id)
    
    if request.method == 'POST':
        school.name = request.POST.get('name')
        school.code = request.POST.get('code')
        school.phone = request.POST.get('phone', '')
        school.email = request.POST.get('email', '')
        school.address = request.POST.get('address', '')
        school.bank_name = request.POST.get('bank_name', '')
        school.bank_account_number = request.POST.get('bank_account_number', '')
        school.subscription_active = request.POST.get('subscription_active') == 'on'
        school.save()
        
        return redirect('/admin-dashboard/schools/')
    
    return render(request, 'admin_dashboard/school_edit.html', {'school': school})

def school_delete(request, school_id):
    school = get_object_or_404(School, id=school_id)
    if request.method == 'POST':
        school.delete()
        return redirect('/admin-dashboard/schools/')
    
    return render(request, 'admin_dashboard/school_delete.html', {'school': school})

def school_create(request):
    if request.method == 'POST':
        school = School.objects.create(
            name=request.POST.get('name'),
            code=request.POST.get('code'),
            phone=request.POST.get('phone', ''),
            email=request.POST.get('email', ''),
            address=request.POST.get('address', ''),
            subscription_active=request.POST.get('subscription_active') == 'on'
        )
        return redirect('/admin-dashboard/schools/')
    
    return render(request, 'admin_dashboard/school_create.html')