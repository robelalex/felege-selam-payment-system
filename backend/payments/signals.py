# backend/payments/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import PaymentDeadline


@receiver(post_save, sender=PaymentDeadline)
def sync_student_fees_on_deadline_change(sender, instance, created, **kwargs):
    """
    When a PaymentDeadline amount changes, update all matching students' monthly_fee.
    This ensures admin-set deadline amounts propagate to student records immediately.
    """
    if not instance.is_active:
        return
    
    # Find students matching this deadline's grade/school
    from students.models import Student
    
    filters = {
        'school_id': instance.school_id,
        'status': 'active'
    }
    
    # If deadline is grade-specific, only update those students
    if instance.grade is not None:
        filters['grade'] = instance.grade
    
    students_to_update = Student.objects.filter(**filters)
    
    # Bulk update only students whose fee differs from the new deadline amount
    updated_count = students_to_update.exclude(monthly_fee=instance.amount).update(
        monthly_fee=instance.amount
    )
    
    if updated_count > 0:
        print(f"🔄 Synced {updated_count} student(s) monthly_fee to {instance.amount} Birr "
              f"for Grade {instance.grade or 'All'} deadline")