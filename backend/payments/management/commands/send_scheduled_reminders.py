# backend/payments/management/commands/send_scheduled_reminders.py
"""
Item 4: python manage.py send_scheduled_reminders

Meant to run once a day (see render.yaml cron job). For every active,
SMS-enabled school, finds PaymentDeadline rows due in exactly 5 days or
exactly 1 day, finds every student in that deadline's grade (or all
grades, if the deadline applies school-wide) who has NO verified payment
for it yet, and sends them an SMS reminder via that school's own Afro
Message account.

Deliberately a thin wrapper around MultiSchoolSMSService — no new SMS
credentials, quota, or formatting logic here, all of that already lives
in the service and is per-school by design.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from schools.models import School
from students.models import Student
from payments.models import Payment, PaymentDeadline
from payments.services.multi_school_sms_service import MultiSchoolSMSService

# Reminder windows, in days-before-due-date.
REMINDER_WINDOWS = (5, 1)


class Command(BaseCommand):
    help = (
        "Send SMS payment reminders for deadlines due in 5 days or 1 day, "
        "to students with no verified payment yet. Intended to run daily via cron."
    )

    def handle(self, *args, **options):
        today = timezone.now().date()
        target_dates = {today + timedelta(days=n): n for n in REMINDER_WINDOWS}

        total_sms_sent = 0
        total_sms_failed = 0
        total_students_checked = 0

        # ✅ Only schools that are actually allowed to be using the
        # platform at all (mirrors SchoolMiddleware's "active school"
        # definition), AND have SMS turned on with a real API key —
        # MultiSchoolSMSService(school_id) itself would raise if
        # at_api_key were missing, but we want to skip those schools
        # quietly here rather than spam the log with exceptions.
        schools = School.objects.filter(
            subscription_status='approved',
            subscription_active=True,
            sms_enabled=True,
        ).exclude(at_api_key__isnull=True).exclude(at_api_key='')

        self.stdout.write(f"[{today}] Checking {schools.count()} SMS-enabled school(s)...")

        for school in schools:
            deadlines = PaymentDeadline.objects.filter(
                school=school,
                is_active=True,
                due_date__in=target_dates.keys(),
            )

            if not deadlines.exists():
                continue

            try:
                sms_service = MultiSchoolSMSService(school.id)
            except Exception as exc:
                self.stdout.write(self.style.WARNING(
                    f"  [{school.name}] Skipped — SMS service unavailable: {exc}"
                ))
                continue

            for deadline in deadlines:
                days_before = target_dates[deadline.due_date]

                # Students this deadline applies to: a specific grade, or
                # every active student in the school if grade is blank.
                students = Student.objects.filter(school=school, status='active')
                if deadline.grade is not None:
                    students = students.filter(grade=deadline.grade)

                verified_student_ids = set(
                    Payment.objects.filter(
                        deadline=deadline, status='verified'
                    ).values_list('student_id', flat=True)
                )

                unpaid_students = [s for s in students if s.id not in verified_student_ids]
                total_students_checked += len(unpaid_students)

                if not unpaid_students:
                    continue

                month_name = deadline.get_month_display()
                due_phrase = "tomorrow" if days_before == 1 else f"in {days_before} days"

                self.stdout.write(
                    f"  [{school.name}] {month_name} deadline due {due_phrase} "
                    f"({deadline.due_date}) — {len(unpaid_students)} unpaid student(s)"
                )

                for student in unpaid_students:
                    if not student.parent_phone:
                        self.stdout.write(self.style.WARNING(
                            f"    - {student.student_id}: no parent phone on file, skipped"
                        ))
                        continue

                    # ✅ Fee exceptions (Jimma request #1): don't remind a
                    # waiver student about a month already fully covered,
                    # and quote partial students their real amount.
                    from payments.services.fee_override_service import get_effective_deadline_amount
                    effective_amount = get_effective_deadline_amount(student, deadline)
                    if effective_amount <= 0:
                        continue

                    message = (
                        f"Payment Reminder: {student.full_name}'s tuition for "
                        f"{month_name} (ETB {effective_amount:,.2f}) is due {due_phrase} "
                        f"on {deadline.due_date.strftime('%b %d, %Y')}. "
                        f"Please pay via the parent portal or bank transfer. "
                        f"— {school.name}"
                    )

                    try:
                        sms_service.send_sms(
                            phone_number=student.parent_phone,
                            message=message,
                            related_to=f"scheduled_reminder_{student.student_id}_{deadline.id}_{days_before}d",
                        )
                        total_sms_sent += 1
                        self.stdout.write(
                            f"    ✅ {student.student_id} ({student.parent_phone})"
                        )
                    except Exception as exc:
                        total_sms_failed += 1
                        self.stdout.write(self.style.ERROR(
                            f"    ❌ {student.student_id} ({student.parent_phone}): {exc}"
                        ))

        self.stdout.write(self.style.SUCCESS(
            f"Done. Checked {total_students_checked} student(s), "
            f"sent {total_sms_sent} SMS, {total_sms_failed} failed."
        ))
