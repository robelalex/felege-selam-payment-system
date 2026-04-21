# backend/schools/management/commands/link_school_admins.py
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from schools.models import School, SchoolAdminProfile

class Command(BaseCommand):
    help = 'Link existing users to schools as school admins'
    
    def add_arguments(self, parser):
        parser.add_argument('--username', type=str, help='Username to link')
        parser.add_argument('--school-id', type=int, help='School ID to link to')
        parser.add_argument('--all', action='store_true', help='Link all staff users')
    
    def handle(self, *args, **options):
        if options['username'] and options['school_id']:
            try:
                user = User.objects.get(username=options['username'])
                school = School.objects.get(id=options['school_id'])
                profile, created = SchoolAdminProfile.objects.get_or_create(
                    user=user,
                    defaults={'school': school}
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f'Linked {user.username} to {school.name}'))
                else:
                    self.stdout.write(self.style.WARNING(f'Profile already exists for {user.username}'))
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User {options["username"]} not found'))
            except School.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'School {options["school_id"]} not found'))
        
        elif options['all']:
            staff_users = User.objects.filter(is_staff=True)
            for user in staff_users:
                if not hasattr(user, 'school_profile'):
                    # You need to manually assign which school
                    self.stdout.write(f'User {user.username} needs school assignment')