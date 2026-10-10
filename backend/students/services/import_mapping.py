"""
Column mapping for the bulk student importer.

This file is DATA, not logic. To support a new spreadsheet layout, add a
header pattern here - no change to the importer is needed.

Headers are normalised before matching: lower-case, letters and digits only.
So 'First Name', 'Firstname' and 'first_name' all become 'firstname', and
'Grade (1-8)' becomes 'grade18'. Each entry is a list of regular expressions
tested against that normalised header (first match wins, one column per field).
"""

# Columns that map to real Student fields.
FIELD_PATTERNS = {
    'first_name':       [r'^firstname$', r'^givenname$'],
    'last_name':        [r'^lastname$', r'^surname$', r'^familyname$'],
    'father_name':      [r'^fathername$', r'^fathersname$'],
    'grandfather_name': [r'^grandfathername$', r'^grandfathersname$'],
    'mother_name':      [r'^mothername$', r'^mothersname$'],
    'grade':            [r'^grade', r'^class$'],
    'section':          [r'^section$'],
    'academic_year':    [r'^academicyear$', r'^schoolyear$'],
    'student_id':       [r'^studentid$', r'^idnumber$', r'^studentnumber$'],
    'parent_full_name': [r'^parentfullname$', r'^parentname$', r'^guardianname$', r'^guardianfullname$'],
    'parent_phone':     [r'^parentphone$', r'^phonenumber$', r'^phone$', r'^guardianphone$',
                         r'^parentmobile$', r'^mobile$', r'^contactphone$'],
    'alternative_phone': [r'^alternativephone$', r'^alternatephone$', r'^parentalternativephone$',
                          r'^secondaryphone$'],
    'parent_email':     [r'^parentemail$', r'^email$'],
    'monthly_fee':      [r'^monthlyfee$', r'^fee$', r'^schoolfee$', r'^tuition'],
    'city':             [r'^city$'],
    'subcity':          [r'^subcity$'],
    'kebele':           [r'^kebele$'],
    'house_number':     [r'^housenumber$'],
    'gender':           [r'^sex$', r'^gender$'],
    'date_of_birth':    [r'^dateofbirth$', r'^dob$', r'^birthdate$'],
}

# Columns kept in Student.extra_info under a readable key.
EXTRA_PATTERNS = {
    'organisation_unit':        [r'^organisationunit$', r'^organizationunit$'],
    'ministry_enrollment_date': [r'^enrollmentdate$', r'^enrolmentdate$'],
    'age':                      [r'^age$'],
    'enrolment_status':         [r'^enrolmentstatus$', r'^enrollmentstatus$'],
    'entry_year':               [r'^entryyear$'],
    'program':                  [r'^program'],
    'shift':                    [r'^shift$'],
    'disability_status':        [r'^disabilitystatus$'],
    'orphan':                   [r'^orphan$'],
    'language':                 [r'^language'],
    'can_go_home_alone':        [r'^cangohomealone$'],
    'transport_assistant_name': [r'^nameoftransportassistant$', r'^transportassistantname$'],
    'transport_assistant_phone': [r'^transportassistantphone$'],
    'average_score':            [r'^studentaveragescore$', r'^averagescore$'],
}

# Sensitive columns that are deliberately NOT imported (children's national
# ID numbers should not be copied into a payment system).
SKIPPED_PATTERNS = [r'^nationalid$']

# A sheet must map at least these fields to be accepted as the student list
# (this is how the importer ignores helper sheets such as the form's 'List').
REQUIRED_FIELDS = ['first_name', 'grade']

# ---------------------------------------------------------------------------
# WHICH VALUES MUST EXIST ON EVERY ROW (mandatory vs optional)
# Everything not listed here is optional: used when present, ignored when empty.
# To make a column mandatory add its field name below (for example
# 'parent_phone', 'father_name', 'gender', 'date_of_birth'); to make a column
# optional again, remove it. 'monthly_fee' is handled by the upload screen.
# ---------------------------------------------------------------------------
REQUIRED_VALUES = ['first_name', 'grade']

# How a real Excel date cell is turned into text. Excel's default date format
# shows the month first (a US-locale Excel), which is the order the person
# typed, so 'month_first' reproduces exactly what they see. Use 'day_first'
# if your files come from a day-first Excel.
EXCEL_DATE_ORDER = 'month_first'
