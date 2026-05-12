# backend/authentication/migrations/0002_create_super_admin.py
from django.db import migrations
from django.contrib.auth.hashers import make_password

def create_super_admin(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('authentication', 'UserProfile')
    
    # Check if super admin already exists
    if not User.objects.filter(email='robelalex95@gmail.com').exists():
        super_admin = User.objects.create(
            username='robelalex',
            email='robelalex95@gmail.com',
            password=make_password('Ru1744/15robel'),
            is_superuser=True,
            is_staff=True,
            is_active=True,
            first_name='Robel',
            last_name='Alex'
        )
        
        # Create user profile
        UserProfile.objects.create(
            user=super_admin,
            role='super_admin',
            is_email_verified=True
        )
        
        print(f"✅ Super Admin created: {super_admin.email}")

def reverse_migration(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(email='robelalex95@gmail.com').delete()

class Migration(migrations.Migration):
    dependencies = [
        ('authentication', '0001_initial'),  # Make sure this matches your last migration
    ]

    operations = [
        migrations.RunPython(create_super_admin, reverse_migration),
    ]