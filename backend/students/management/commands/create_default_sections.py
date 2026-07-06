# backend/students/management/commands/create_default_sections.py
from django.core.management.base import BaseCommand, CommandError
from schools.models import School
from students.models import Section


class Command(BaseCommand):
    help = 'Bulk-create default sections (e.g. A-E) for a range of grades in a school.'

    def add_arguments(self, parser):
        parser.add_argument('--school-id', type=int, required=True, help='School ID to create sections for')
        parser.add_argument(
            '--grades', type=str, default='1-12',
            help='Grade range like "1-12", or a comma list like "9,10,11,12"'
        )
        parser.add_argument(
            '--letters', type=str, default='A,B,C,D,E',
            help='Comma-separated section letters to create for each grade'
        )

    def parse_grades(self, grades_str):
        if '-' in grades_str:
            start, end = grades_str.split('-')
            return list(range(int(start), int(end) + 1))
        return [int(g.strip()) for g in grades_str.split(',')]

    def handle(self, *args, **options):
        try:
            school = School.objects.get(id=options['school_id'])
        except School.DoesNotExist:
            raise CommandError(f"School with id {options['school_id']} does not exist")

        grades = self.parse_grades(options['grades'])
        letters = [l.strip().upper() for l in options['letters'].split(',')]

        created_count = 0
        skipped_count = 0

        for grade in grades:
            for letter in letters:
                section, created = Section.objects.get_or_create(
                    school=school, grade=grade, name=letter,
                    defaults={'is_active': True}
                )
                if created:
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✅ Created Grade {grade} - Section {letter}'))
                else:
                    skipped_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. Created {created_count} sections, skipped {skipped_count} (already existed)."
        ))