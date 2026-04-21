# backend/schools/signals.py
from django.db.models.signals import post_save
from django.contrib.auth.models import User
from django.dispatch import receiver
from .models import SchoolAdminProfile

@receiver(post_save, sender=User)
def create_school_admin_profile(sender, instance, created, **kwargs):
    """Auto-create SchoolAdminProfile when a user is marked as staff"""
    # This is optional - you can also create manually
    pass