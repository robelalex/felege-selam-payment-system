# backend/schools/management/commands/fix_school_admin_profiles.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from schools.models import SchoolAdminProfile
from authentication.models import UserProfile

User = get_user_model()

class Command(BaseCommand):
    help = 'Create missing SchoolAdminProfile for users who have UserProfile with school_id'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually doing it',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        self.stdout.write(self.style.SUCCESS('🔍 Checking for missing SchoolAdminProfiles...'))
        
        migrated = 0
        skipped = 0
        errors = 0
        
        profiles = UserProfile.objects.filter(school_id__isnull=False).select_related('user')
        
        for profile in profiles:
            user = profile.user
            
            if hasattr(user, 'school_profile'):
                skipped += 1
                continue
            
            if dry_run:
                self.stdout.write(f"  [DRY RUN] Would create SchoolAdminProfile for {user.username} → school {profile.school_id}")
            else:
                try:
                    SchoolAdminProfile.objects.create(
                        user=user,
                        school_id=profile.school_id,
                        is_active=True
                    )
                    migrated += 1
                    self.stdout.write(self.style.SUCCESS(f"  ✅ Created for {user.username} → school {profile.school_id}"))
                except Exception as e:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"  ❌ Error for {user.username}: {e}"))
        
        self.stdout.write(self.style.SUCCESS(f"\n📊 Summary:"))
        self.stdout.write(f"   Migrated: {migrated}")
        self.stdout.write(f"   Already had profile: {skipped}")
        self.stdout.write(f"   Errors: {errors}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f"\nRun without --dry-run to apply changes."))