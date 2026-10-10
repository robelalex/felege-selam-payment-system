# backend/students/services/bulk_import.py
"""
Bulk student import.

Accepts either this system's own template or the Ministry's "Student
Registration Form" exactly as it is: the importer finds the right sheet,
matches columns by header name (see import_mapping.py), cleans the values,
and creates all students in a few database round trips.

Nothing about a particular school or form is hard-coded: fees, academic year
and section defaults come from the upload options or the school's own data.
"""
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

import pandas as pd
from django.db import IntegrityError, transaction

from schools.models import School
from students.models import Student
from .import_mapping import (
    EXTRA_PATTERNS, FIELD_PATTERNS, REQUIRED_FIELDS, SKIPPED_PATTERNS,
)

BATCH_SIZE = 200


def _norm(header):
    return re.sub(r'[^a-z0-9]', '', str(header).lower())


def _match(norm_header, patterns):
    return any(re.search(p, norm_header) for p in patterns)


def map_columns(columns):
    """
    Return (field_map, extra_map, ignored) for a list of column headers.
    field_map: {'first_name': 'Firstname', ...}   (real Student fields)
    extra_map: {'shift': 'Shift', ...}            (kept in extra_info)
    ignored:   headers that matched nothing or are deliberately skipped
    """
    field_map, extra_map, ignored = {}, {}, []
    for col in columns:
        n = _norm(col)
        if not n or n.startswith('unnamed'):
            continue
        if _match(n, SKIPPED_PATTERNS):
            ignored.append(str(col).strip())
            continue
        placed = False
        for field, pats in FIELD_PATTERNS.items():
            if field not in field_map and _match(n, pats):
                field_map[field] = col
                placed = True
                break
        if placed:
            continue
        for key, pats in EXTRA_PATTERNS.items():
            if key not in extra_map and _match(n, pats):
                extra_map[key] = col
                placed = True
                break
        if not placed:
            ignored.append(str(col).strip())
    return field_map, extra_map, ignored


def clean_text(value):
    if value is None:
        return ''
    if isinstance(value, float):
        if value != value:  # NaN
            return ''
        if value.is_integer():
            return str(int(value))
    if isinstance(value, (datetime, date)):
        return value.strftime('%d/%m/%Y')
    return re.sub(r'\s+', ' ', str(value)).strip()


def clean_extra(value):
    """Keep Excel booleans and numbers as they are, dates/text as clean text."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value:
            return ''
        return int(value) if value.is_integer() else round(value, 2)
    return clean_text(value)


def normalize_phone(value):
    """Return (phone, ok). Accepts 0912345678, 912345678, 251912345678, +251..."""
    p = clean_text(value)
    if not p:
        return '', True
    p = re.sub(r'[\s\-+]', '', p)
    if p.startswith('251') and len(p) == 12:
        p = p[3:]
    if len(p) == 9 and p.isdigit():
        p = '0' + p
    return p, bool(re.fullmatch(r'0[0-9]{9}', p))


def parse_grade(value):
    text = clean_text(value)
    m = re.search(r'\d+', text)
    if not m:
        return None, f"Grade '{text}' is not a number (supported: 1-12)"
    g = int(m.group())
    if g < 1 or g > 12:
        return None, f"Grade {g} is outside the supported range 1-12"
    return g, None


def parse_money(value):
    text = clean_text(value).replace(',', '')
    if not text:
        return None
    try:
        d = Decimal(text)
    except InvalidOperation:
        return None
    return d if d > 0 else None


def current_ethiopian_year(today=None):
    """Current Ethiopian-calendar year, used only to label an academic year when
    the school has no current one set. The Ethiopian year changes on 11 September
    (12 September in the year before a Gregorian leap year); the 11th is accurate
    enough for this fallback label."""
    today = today or date.today()
    return today.year - 7 if (today.month, today.day) >= (9, 11) else today.year - 8


class BulkImportService:
    """Handle bulk import of students from Excel"""

    def __init__(self, school_id):
        self.school = School.objects.get(id=school_id)
        self.results = {
            'total': 0,
            'success': 0,
            'errors': [],
            'warnings': [],
            'students': [],
        }

    # ------------------------------------------------------------------ template
    def download_template(self):
        """Generate Excel template for download"""
        template_data = {
            'First Name': ['Abel'],
            'Last Name': ['Mekonin'],
            'Father Name': ['Mekonin'],
            'Mother Name': ['Tigist'],
            'Gender': ['Male'],
            'Date of Birth': ['15/8/2008'],
            'Grade': [3],
            'Section': ['A'],
            'Academic Year': ['2016 E.C.'],
            'Parent Full Name': ['Mekonin Tesfaye'],
            'Parent Phone': ['0912345678'],
            'Alternative Phone': [''],
            'Parent Email': [''],
            'Monthly Fee': [200],
            'City': ['Jimma'],
            'Subcity': [''],
            'Kebele': [''],
            'House Number': [''],
        }
        df = pd.DataFrame(template_data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Students', index=False)
            instructions = writer.book.create_sheet("Instructions")
            for line in [
                "BULK STUDENT IMPORT INSTRUCTIONS",
                "",
                "You can ALSO upload the Ministry student registration form exactly as it is.",
                "Columns are matched by their header names, so the order does not matter.",
                "Required: First Name, Grade. Grade may be written as 3 or Grade-3.",
                "Monthly Fee: put it in a column, or type a default fee on the upload screen.",
                "Phone format: 0912345678 (9-digit and +251 numbers are fixed automatically).",
                "",
                "After filling, save and upload this file.",
            ]:
                instructions.append([line])
        output.seek(0)
        return output

    # ------------------------------------------------------------------ helpers
    def format_academic_year(self, year_str):
        """Convert any academic year format to standard format"""
        year_str = str(year_str).strip()
        if re.match(r'^\d{4}\s+E\.C\.$', year_str):
            return year_str
        if re.match(r'^\d{4}\s+E\.C$', year_str):
            return year_str.replace('E.C', 'E.C.')
        if re.match(r'^\d{4}$', year_str):
            return f"{year_str} E.C."
        return year_str

    def _default_academic_year(self):
        from academics.models import AcademicYear
        current = AcademicYear.objects.filter(school=self.school, is_current=True).first()
        if current:
            return current.name
        return f"{current_ethiopian_year()} E.C."

    def _pick_sheet(self, file):
        """Read every sheet and return (sheet_name, dataframe, field_map, extra_map, ignored)."""
        sheets = pd.read_excel(file, sheet_name=None, dtype=object)
        best = None
        for name, df in sheets.items():
            field_map, extra_map, ignored = map_columns(df.columns)
            if not all(f in field_map for f in REQUIRED_FIELDS):
                continue
            score = len(field_map) + len(extra_map)
            rows = len(df.dropna(how='all'))
            if best is None or (score, rows) > (best[0], best[1]):
                best = (score, rows, name, df, field_map, extra_map, ignored)
        if best is None:
            found = {n: [str(c) for c in d.columns][:8] for n, d in sheets.items()}
            raise ValueError(
                "Could not find a student list in this file. A sheet needs at least "
                "a First Name column and a Grade column. Sheets found: " + json.dumps(found)
            )
        return best[2:]

    @staticmethod
    def _parse_fee_by_grade(raw):
        if not raw:
            return {}
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError:
                return {}
        out = {}
        for k, v in (raw or {}).items():
            fee = parse_money(v)
            m = re.search(r'\d+', str(k))
            if fee and m:
                out[int(m.group())] = fee
        return out

    # ------------------------------------------------------------------ import
    def process_file(self, file, options=None):
        """Process uploaded Excel file. options: default_monthly_fee,
        fee_by_grade (dict or JSON), academic_year, default_section."""
        options = options or {}
        try:
            sheet_name, df, field_map, extra_map, ignored = self._pick_sheet(file)
        except Exception as e:
            return {'error': f"Failed to read file: {e}", 'total': 0, 'success': 0, 'errors': [str(e)]}

        df = df.dropna(how='all')
        self.results['detected_sheet'] = str(sheet_name)
        self.results['ignored_columns'] = ignored
        self.results['total'] = len(df)

        # ---- fee source (nothing is hard-coded: column, per-grade, or default) ----
        fee_column = field_map.get('monthly_fee')
        default_fee = parse_money(options.get('default_monthly_fee'))
        fee_by_grade = self._parse_fee_by_grade(options.get('fee_by_grade'))
        if not fee_column and default_fee is None and not fee_by_grade:
            return {
                'error': "This file has no monthly fee column. Enter a default monthly fee "
                         "(or fees per grade) on the upload screen and import again.",
                'needs_fee': True, 'total': len(df), 'success': 0,
                'errors': ["Monthly fee not provided"],
            }

        fallback_year = (str(options.get('academic_year') or '').strip()
                         and self.format_academic_year(options['academic_year'])) \
            or self._default_academic_year()
        default_section = str(options.get('default_section') or 'A').strip()

        # ---- what already exists (re-uploading the same file must not duplicate) ----
        existing = {
            (f.lower(), fa.lower(), l.lower(), g, y)
            for f, fa, l, g, y in Student.objects.filter(school=self.school)
            .values_list('first_name', 'father_name', 'last_name', 'grade', 'academic_year')
        }
        school_code = self.school.code if self.school.code else self.school.name[:2].upper()
        seq_next = {}
        taken_ids = set()

        def next_generated_id(year):
            if year not in seq_next:
                prefix = f"{school_code}-{year}-"
                last = (Student.objects.filter(school=self.school, student_id__startswith=prefix)
                        .order_by('-student_id').values_list('student_id', flat=True).first())
                try:
                    seq_next[year] = int(last.split('-')[-1]) + 1 if last else 1
                except (ValueError, IndexError, AttributeError):
                    seq_next[year] = 1
            while True:
                sid = f"{school_code}-{year}-{seq_next[year]:04d}"
                seq_next[year] += 1
                if sid not in taken_ids:
                    return sid

        # the school's own IDs from the sheet, if any (only when not already used)
        provided_ids = [clean_text(r.get(field_map['student_id'])) for _, r in df.iterrows()] \
            if 'student_id' in field_map else []
        used_in_db = set(Student.objects.filter(student_id__in=[i for i in provided_ids if i])
                         .values_list('student_id', flat=True)) if provided_ids else set()

        def get(row, field):
            col = field_map.get(field)
            return row.get(col) if col is not None else None

        to_create = []
        seen_in_file = {}
        for idx, row in df.iterrows():
            excel_row = int(idx) + 2
            first = clean_text(get(row, 'first_name'))
            father = clean_text(get(row, 'father_name'))
            last = clean_text(get(row, 'last_name')) or clean_text(get(row, 'grandfather_name')) or father

            problems = []
            if not first:
                problems.append("First name is required")
            grade, gerr = parse_grade(get(row, 'grade'))
            if gerr:
                problems.append(gerr)

            phone, phone_ok = normalize_phone(get(row, 'parent_phone'))
            if not phone_ok:
                problems.append(f"Invalid phone number '{clean_text(get(row, 'parent_phone'))}'")

            fee = None
            if fee_column:
                fee = parse_money(get(row, 'monthly_fee'))
            if fee is None and grade:
                fee = fee_by_grade.get(grade) or default_fee
            if fee is None:
                problems.append("Monthly fee is missing or not greater than 0")

            year = self.format_academic_year(clean_text(get(row, 'academic_year'))) \
                if clean_text(get(row, 'academic_year')) else fallback_year

            if problems:
                self.results['errors'].append(f"Row {excel_row}: " + "; ".join(problems))
                continue

            key = (first.lower(), father.lower(), last.lower(), grade, year)
            if key in existing:
                self.results['errors'].append(f"Row {excel_row}: {first} {father} (grade {grade}) already exists - skipped")
                continue
            if key in seen_in_file:
                self.results['errors'].append(
                    f"Row {excel_row}: same student as row {seen_in_file[key]} in this file - skipped")
                continue
            seen_in_file[key] = excel_row

            if not phone:
                self.results['warnings'].append(
                    f"Row {excel_row}: {first} {father} has no parent phone - SMS reminders cannot reach this parent")

            sid = clean_text(get(row, 'student_id'))
            if sid and (sid in used_in_db or sid in taken_ids):
                self.results['warnings'].append(
                    f"Row {excel_row}: Student ID '{sid}' is already used - a new ID was generated")
                sid = ''
            if not sid:
                m = re.search(r'(\d{4})', year)
                sid = next_generated_id(m.group(1) if m else str(datetime.now().year))
            taken_ids.add(sid)

            gender_raw = clean_text(get(row, 'gender')).lower()
            gender = 'Male' if gender_raw.startswith('m') else 'Female' if gender_raw.startswith('f') else ''

            extra = {}
            for key_name, col in extra_map.items():
                val = clean_extra(row.get(col))
                if val != '':
                    extra[key_name] = val

            to_create.append((excel_row, Student(
                student_id=sid,
                school=self.school,
                first_name=first,
                last_name=last,
                father_name=father,
                mother_name=clean_text(get(row, 'mother_name')),
                grade=grade,
                section=clean_text(get(row, 'section')) or default_section,
                academic_year=year,
                parent_full_name=clean_text(get(row, 'parent_full_name')),
                parent_phone=phone,
                parent_alternative_phone=normalize_phone(get(row, 'alternative_phone'))[0],
                parent_email=clean_text(get(row, 'parent_email')),
                monthly_fee=fee,
                city=clean_text(get(row, 'city')) or 'Jimma',
                subcity=clean_text(get(row, 'subcity')),
                kebele=clean_text(get(row, 'kebele')),
                house_number=clean_text(get(row, 'house_number')),
                gender=gender,
                date_of_birth=clean_text(get(row, 'date_of_birth'))[:20],
                extra_info=extra,
                status='active',
            )))

        # ---- create in batches (a handful of queries instead of hundreds) ----
        for start in range(0, len(to_create), BATCH_SIZE):
            batch = to_create[start:start + BATCH_SIZE]
            try:
                with transaction.atomic():
                    created = Student.objects.bulk_create([s for _, s in batch])
                self._record(created)
            except IntegrityError:
                # one bad row must not sink the batch: retry row by row
                for excel_row, student in batch:
                    try:
                        with transaction.atomic():
                            student.save()
                        self._record([student])
                    except Exception as e:  # noqa: BLE001
                        self.results['errors'].append(f"Row {excel_row}: could not save - {e}")
            except Exception as e:  # noqa: BLE001
                self.results['errors'].append(f"Batch starting at row {batch[0][0]}: could not save - {e}")

        return self.results

    def _record(self, students):
        for s in students:
            self.results['success'] += 1
            self.results['students'].append({
                'id': s.id,
                'student_id': s.student_id,
                'name': s.formatted_name,
            })
