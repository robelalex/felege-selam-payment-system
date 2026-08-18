# report_cards/services/pdf_service.py
#
# Renders a ReportCard row into a PDF. Nothing here computes numbers —
# it only reads the already-frozen snapshot_data and the model fields.
# Re-rendering the same row twice always produces the same document.
import io
from django.core.files.base import ContentFile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image,
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.utils import ImageReader

PRIMARY  = colors.HexColor('#0f4c81')
LIGHT_BG = colors.HexColor('#eef3f8')
GREY     = colors.HexColor('#6b7280')
WATERMARK_GREEN = colors.HexColor('#15803d')

A4_WIDTH_MM = 210   # inner usable width after margins (approx 174 mm at 18 mm each side)
USABLE_MM   = 174

# The consolidated cumulative "big plate" table (quarter-structure schools:
# Subject + 4 quarters + 2 semesters + Year Average = 8 columns) is too wide
# for portrait A4 alongside a readable subject name column, so that one
# report gets rendered landscape instead. Every other report (term,
# semester, and semester-structure-school cumulative) keeps the original
# portrait layout untouched.
LANDSCAPE_USABLE_MM = 261   # 297mm landscape width - 18mm margins each side


def _load_image_bytes(field_file):
    """
    Returns the raw bytes of a Django ImageField/FileField (School.logo /
    director_signature / school_stamp), or None if the field is empty or
    the file can't be read. Uses the field's own storage backend (local
    filesystem in dev, Cloudinary in production) via Django's File API, so
    this works the same regardless of which storage is configured. Raw
    bytes (rather than a single shared reader/stream) so the same image can
    be safely turned into a fresh ImageReader (for canvas drawing) and a
    fresh flowable Image (for the signature/stamp block) without either
    consuming the other's stream position.

    A report card must still render even if a branding image is
    temporarily missing or unreachable — a bad logo upload should never
    block generating a student's report card.
    """
    if not field_file:
        return None
    try:
        field_file.open('rb')
        try:
            return field_file.read()
        finally:
            field_file.close()
    except Exception:
        return None


def _image_reader(data):
    """ImageReader (for canvas.drawImage) from raw image bytes, or None."""
    if not data:
        return None
    try:
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


def _scaled_image(data, target_height_mm):
    """Flowable Image scaled to a fixed height, preserving aspect ratio, from raw image bytes."""
    reader = ImageReader(io.BytesIO(data))
    iw, ih = reader.getSize()
    h = target_height_mm * mm
    w = h * iw / ih if ih else h
    return Image(io.BytesIO(data), width=w, height=h)


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle('SchoolName', parent=styles['Title'],   fontSize=18, textColor=PRIMARY, spaceAfter=2))
    styles.add(ParagraphStyle('SchoolMeta', parent=styles['Normal'],  fontSize=9,  textColor=GREY))
    styles.add(ParagraphStyle('SectionHeading', parent=styles['Heading3'], fontSize=11, textColor=PRIMARY, spaceBefore=10, spaceAfter=4))
    styles.add(ParagraphStyle('Small',     parent=styles['Normal'],   fontSize=9))
    styles.add(ParagraphStyle('SmallGrey', parent=styles['Normal'],   fontSize=8.5, textColor=GREY))
    styles.add(ParagraphStyle('SmallRight',parent=styles['Normal'],   fontSize=9,   alignment=TA_RIGHT))
    return styles


def _fmt_pct(value):
    if value is None:
        return 'N/A'        # ← was '—'. N/A makes clear the term wasn't taken,
    return f"{float(value):.1f}%"   # not that the result is unknown.


def _fmt_rank(rank, total):
    if rank is None:
        return '—'
    return f"{rank} / {total}" if total else str(rank)


def _pass_fail_text(is_passing):
    if is_passing is None:
        return '—'
    return 'PASS' if is_passing else 'FAIL'


def _header_table(report_card, styles, usable_mm=USABLE_MM):
    school = report_card.school

    # ── Right-side title block ────────────────────────────────────
    # FIX: the old code produced "2018 E.C. — Year-End Cumulative · 2018 E.C."
    # because it showed term.name for term cards and a literal plus the
    # academic_year.name for cumulative — duplicating the year. Now:
    # - Term card:       "Report Card\nSemester 1\n2025/2026"
    # - Cumulative card: "Year-End Report Card\n2025/2026"
    year_name = report_card.academic_year.name
    if report_card.report_type == 'term' and report_card.term:
        title_lines = ['REPORT CARD', report_card.term.name, year_name]
    elif report_card.report_type == 'semester' and report_card.semester:
        title_lines = ['SEMESTER REPORT CARD', report_card.semester.name, year_name]
    else:
        title_lines = ['YEAR-END REPORT CARD', year_name]

    right_para = Paragraph(
        '<br/>'.join(f'<b>{l}</b>' if i == 0 else l for i, l in enumerate(title_lines)),
        ParagraphStyle('HeaderRight', parent=styles['Small'], alignment=TA_RIGHT, leading=15),
    )

    left = [Paragraph(school.name, styles['SchoolName'])]
    if school.address:
        left.append(Paragraph(school.address, styles['SchoolMeta']))
    contact_bits = [b for b in [school.phone, school.email] if b]
    if contact_bits:
        left.append(Paragraph(' · '.join(contact_bits), styles['SchoolMeta']))

    left_w, right_w = _scale_col_widths([110, 64], usable_mm)
    t = Table([[left, right_para]], colWidths=[left_w, right_w])
    t.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
    ]))
    return t


def _student_info_table(report_card, styles, usable_mm=USABLE_MM):
    student = report_card.student
    rows = [
        ['Student Name', f"{student.first_name} {student.last_name}", 'Student ID', student.student_id],
        ['Grade / Section',
         f"Grade {report_card.grade}{(' ' + report_card.section) if report_card.section else ''}",
         'Homeroom Teacher', report_card.homeroom_teacher_name or '—'],
    ]
    col_widths = _scale_col_widths([32, 55, 35, 52], usable_mm)
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('FONTNAME',      (0, 0), (0, -1),  'Helvetica-Bold'),
        ('FONTNAME',      (2, 0), (2, -1),  'Helvetica-Bold'),
        ('TEXTCOLOR',     (0, 0), (0, -1),  GREY),
        ('TEXTCOLOR',     (2, 0), (2, -1),  GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('LINEBELOW',     (0, -1), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
    ]))
    return t


def _scale_col_widths(base_widths_mm, target_usable_mm, base_usable_mm=USABLE_MM):
    """
    Scales a list of column widths (in mm, designed against base_usable_mm)
    proportionally to a different usable width — lets the header/student-info/
    summary tables, which were designed for portrait A4, stretch cleanly to
    fill the wider landscape page used for the quarter-structure cumulative
    "big plate" report, instead of leaving a large unused gap on the right.
    Returns widths already multiplied by `mm` (ready for reportlab colWidths).
    """
    factor = target_usable_mm / base_usable_mm
    return [w * factor * mm for w in base_widths_mm]


def _dynamic_col_widths(n_data_cols, subject_col_mm=60, min_data_col_mm=22, usable_mm=USABLE_MM):
    """
    Distribute usable_mm between the subject name column and N equal data
    columns. If there are many terms the data columns shrink to min_data_col_mm
    and the subject column gives up space proportionally — prevents overflow
    on wide cumulative tables with 3+ terms.
    """
    available = usable_mm - subject_col_mm
    data_col  = max(min_data_col_mm, available / max(n_data_cols, 1))
    actual_subj = usable_mm - data_col * n_data_cols
    return [actual_subj * mm] + [data_col * mm] * n_data_cols


def _subjects_table_term(snapshot_subjects, show_letter_grade):
    header = ['Subject', 'Average']
    if show_letter_grade:
        header.append('Grade')
    header.append('Result')

    rows = [header]
    for s in snapshot_subjects:
        row = [s.get('subject_name', ''), _fmt_pct(s.get('average_percentage'))]
        if show_letter_grade:
            row.append(s.get('letter_grade') or '—')
        row.append(_pass_fail_text(s.get('is_passing')))
        rows.append(row)

    n_data = 1 + (1 if show_letter_grade else 0) + 1
    col_widths = _dynamic_col_widths(n_data)
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(_subject_table_style())
    return t


def _subjects_table_cumulative(snapshot_subjects, term_names):
    """
    Columns: Subject | Term1 | Term2 | ... | Year Average
    Missing term values show 'N/A' (student wasn't enrolled or marks not
    submitted for that term) instead of '—' which looks like an error.
    """
    header = ['Subject'] + term_names + ['Year Average']
    rows   = [header]
    for s in snapshot_subjects:
        per_term = s.get('per_term', {})
        row = [s.get('subject_name', '')]
        for tn in term_names:
            row.append(_fmt_pct(per_term.get(tn)))   # N/A when absent
        row.append(_fmt_pct(s.get('year_average')))
        rows.append(row)

    n_data = len(term_names) + 1   # term columns + year average
    col_widths = _dynamic_col_widths(n_data)
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(_subject_table_style())
    return t


def _subjects_table_cumulative_quarter(snapshot_subjects, quarter_names, semester_names):
    """
    Consolidated "big plate" layout for quarter-structure schools only:
    one row per subject showing every quarter, both semester averages,
    and the year average, side by side — Subject | Q1 | Q2 | Q3 | Q4 |
    Sem 1 | Sem 2 | Year Average. Rendered landscape (see LANDSCAPE_USABLE_MM)
    since 4 quarters + 2 semesters + year average is too wide for portrait
    alongside a readable subject name column.

    Missing values (a quarter not yet taken, a semester not yet computed)
    show 'N/A', same convention as the existing per-term cumulative table.
    """
    header = ['Subject'] + quarter_names + semester_names + ['Year Average']
    rows = [header]
    for s in snapshot_subjects:
        per_quarter = s.get('per_term', {})
        per_semester = s.get('per_semester', {})
        row = [s.get('subject_name', '')]
        for qn in quarter_names:
            row.append(_fmt_pct(per_quarter.get(qn)))
        for sn in semester_names:
            row.append(_fmt_pct(per_semester.get(sn)))
        row.append(_fmt_pct(s.get('year_average')))
        rows.append(row)

    n_data = len(quarter_names) + len(semester_names) + 1
    col_widths = _dynamic_col_widths(
        n_data, subject_col_mm=52, min_data_col_mm=24, usable_mm=LANDSCAPE_USABLE_MM,
    )
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    style = _subject_table_style()
    # Visually separate the quarter columns from the semester/year columns
    # with a slightly heavier vertical rule, so the "big plate" reads as
    # quarters -> semesters -> year rather than one undifferentiated block.
    n_quarters = len(quarter_names)
    if n_quarters:
        divider_col = n_quarters  # 0 = subject col, so this is right after the last quarter col
        style.add('LINEAFTER', (divider_col, 0), (divider_col, -1), 1.0, PRIMARY)
    if semester_names:
        divider_col2 = n_quarters + len(semester_names)
        style.add('LINEAFTER', (divider_col2, 0), (divider_col2, -1), 1.0, PRIMARY)
    t.setStyle(style)
    return t


def _subject_table_style():
    return TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0),  PRIMARY),
        ('TEXTCOLOR',     (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',      (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('ALIGN',         (1, 0), (-1, -1), 'CENTER'),
        ('ALIGN',         (0, 0), (0, -1),  'LEFT'),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('GRID',          (0, 0), (-1, -1), 0.25, colors.HexColor('#e5e7eb')),
    ])


def _summary_table(report_card, styles, usable_mm=USABLE_MM):
    rows = [
        ['Overall Average', _fmt_pct(report_card.overall_average)],
        ['Result',          _pass_fail_text(report_card.is_passing)],
    ]
    if report_card.letter_grade:
        rows.append(['Letter Grade', report_card.letter_grade])
    rows.append(['Class Rank (Homeroom)', _fmt_rank(report_card.homeroom_rank, report_card.homeroom_rank_total)])
    if report_card.school_rank is not None:
        rows.append(['School-Wide Rank', _fmt_rank(report_card.school_rank, report_card.school_rank_total)])

    # Show attendance only when actual data exists (not None/zero)
    present = report_card.attendance_present_days
    absent  = report_card.attendance_absent_days
    late    = report_card.attendance_late_days
    if present is not None and (present + (absent or 0) + (late or 0)) > 0:
        rows.append(['Attendance (year-to-date)',
                     f"{present} present · {absent or 0} absent · {late or 0} late"])

    col_widths = _scale_col_widths([65, 109], usable_mm)
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('FONTSIZE',      (0, 0), (-1, -1), 9.5),
        ('FONTNAME',      (0, 0), (0, -1),  'Helvetica-Bold'),
        ('TEXTCOLOR',     (0, 0), (0, -1),  GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.4, colors.HexColor('#eef0f2')),
    ]))
    return t


def _signature_stamp_block(school, styles, usable_mm=USABLE_MM):
    """
    Director's signature + official school stamp, side by side, centered —
    placed near the bottom of the document where a real Ethiopian school
    report card would be hand-signed and stamped. Either or both images may
    be missing (school hasn't uploaded them yet); in that case we still draw
    the signature line / label so the layout looks intentional rather than
    broken, just without an image on it.
    """
    signature_data = _load_image_bytes(getattr(school, 'director_signature', None))
    stamp_data = _load_image_bytes(getattr(school, 'school_stamp', None))
    label_style = ParagraphStyle('SigStampLabel', parent=styles['SmallGrey'], alignment=TA_CENTER)

    sig_cell = []
    if signature_data is not None:
        sig_cell.append(_scaled_image(signature_data, 16))
    else:
        sig_cell.append(Spacer(1, 16 * mm))
    sig_cell.append(HRFlowable(width='65%', thickness=0.7, color=GREY, hAlign='CENTER'))
    sig_cell.append(Spacer(1, 2))
    sig_cell.append(Paragraph("Director's Signature", label_style))

    stamp_cell = []
    if stamp_data is not None:
        stamp_cell.append(_scaled_image(stamp_data, 22))
    else:
        # No stamp uploaded yet — a bordered placeholder box reads as
        # "official stamp goes here" rather than looking like a rendering
        # bug (blank space with just a caption underneath).
        placeholder = Table([['']], colWidths=[34 * mm], rowHeights=[22 * mm])
        placeholder.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.7, colors.HexColor('#c7cdd6')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        stamp_cell.append(placeholder)
    stamp_cell.append(Spacer(1, 2))
    stamp_cell.append(Paragraph('Official Stamp', label_style))

    col_w = (usable_mm / 2) * mm
    t = Table([[sig_cell, stamp_cell]], colWidths=[col_w, col_w])
    t.setStyle(TableStyle([
        ('ALIGN',  (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
    ]))
    return t


def _make_page_decorator(report_card, logo_data):
    """
    Canvas-level page decoration, applied to every page: the school logo
    top-center, and — only for a RELEASED report card — a translucent
    "OFFICIALLY RELEASED" watermark stamped diagonally across the page so a
    parent never has to wonder whether the PDF in front of them is final. A
    draft report card gets neither the watermark (by construction, since
    this is only ever called with status checked below) — draft status
    already says "DRAFT — not yet officially released" in the footer text,
    this just makes a released one impossible to mistake for a draft even
    at a glance.
    """
    def _decorate(canvas, doc):
        canvas.saveState()
        page_width, page_height = doc.pagesize

        logo_reader = _image_reader(logo_data)
        if logo_reader is not None:
            try:
                iw, ih = logo_reader.getSize()
                target_h = 20 * mm
                target_w = target_h * iw / ih if ih else target_h
                x = (page_width - target_w) / 2
                y = page_height - 8 * mm - target_h
                canvas.drawImage(
                    logo_reader, x, y, width=target_w, height=target_h,
                    mask='auto', preserveAspectRatio=True, anchor='c',
                )
            except Exception:
                # A corrupt/unreadable logo file should never take down
                # report card generation — just skip drawing it.
                pass

        if report_card.status == 'released':
            canvas.setFont('Helvetica-Bold', 46)
            canvas.setFillColor(WATERMARK_GREEN)
            try:
                canvas.setFillAlpha(0.14)
            except Exception:
                pass  # very old reportlab without alpha support — draw solid instead
            canvas.translate(page_width / 2, page_height / 2)
            canvas.rotate(38)
            canvas.drawCentredString(0, 0, 'OFFICIALLY RELEASED')
            date_str = report_card.released_at.strftime('%d %b %Y') if report_card.released_at else ''
            if date_str:
                canvas.setFont('Helvetica-Bold', 16)
                canvas.drawCentredString(0, -30, date_str)

        canvas.restoreState()
    return _decorate


def render_report_card_pdf(report_card):
    """
    Builds the PDF for one ReportCard from its frozen fields + snapshot_data
    and returns a Django ContentFile. Does NOT save the model — the caller
    decides when to save.
    """
    styles   = _styles()
    buffer   = io.BytesIO()

    school       = report_card.school
    show_letters = school.grading_system in ('letter_grade', 'both')
    snapshot     = report_card.snapshot_data or {}
    subjects     = snapshot.get('subjects', [])

    # ✅ Consolidated cumulative layout — only quarter-structure schools'
    # year-end report gets the wider "big plate" table + landscape page.
    # Every other report (term, semester, and a semester-structure school's
    # own cumulative) keeps the exact original portrait layout.
    is_quarter_cumulative = (
        report_card.report_type == 'cumulative' and school.term_structure == 'quarter'
    )
    pagesize  = landscape(A4) if is_quarter_cumulative else A4
    usable_mm = LANDSCAPE_USABLE_MM if is_quarter_cumulative else USABLE_MM

    doc = SimpleDocTemplate(
        buffer, pagesize=pagesize,
        leftMargin=18 * mm, rightMargin=18 * mm,
        # Extra top margin (vs. the original 16mm) reserves room for the
        # school logo, which is drawn top-center on every page by the page
        # decorator below rather than as a flowable — so it stays in a
        # fixed position even if the letterhead content below it wraps.
        topMargin=34 * mm, bottomMargin=16 * mm,
        title='Report Card',
    )

    elements = [
        _header_table(report_card, styles, usable_mm=usable_mm),
        Spacer(1, 6),
        HRFlowable(width='100%', thickness=1.2, color=PRIMARY),
        Spacer(1, 10),
        _student_info_table(report_card, styles, usable_mm=usable_mm),
        Spacer(1, 12),
        Paragraph('Academic Results', styles['SectionHeading']),
    ]

    if report_card.report_type in ('term', 'semester'):
        # ✅ Item 7 — semester snapshots use the exact same shape as term
        # snapshots ({'subjects': [...], 'term_name': ...}), so the same
        # table renderer applies unchanged.
        if subjects:
            elements.append(_subjects_table_term(subjects, show_letters))
        else:
            elements.append(Paragraph(
                'No subject results were available at the time this report card was generated.',
                styles['SmallGrey'],
            ))
    elif is_quarter_cumulative:
        # ✅ Consolidated "big plate" layout: every quarter + both
        # semester averages + year average, side by side, per subject.
        quarter_names = snapshot.get('term_names', [])
        semester_names = snapshot.get('semester_names', [])
        if subjects:
            elements.append(_subjects_table_cumulative_quarter(subjects, quarter_names, semester_names))
        else:
            elements.append(Paragraph(
                'No subject results were available at the time this report card was generated.',
                styles['SmallGrey'],
            ))
    else:
        term_names = snapshot.get('term_names', [])
        if subjects:
            elements.append(_subjects_table_cumulative(subjects, term_names))
        else:
            elements.append(Paragraph(
                'No subject results were available at the time this report card was generated.',
                styles['SmallGrey'],
            ))

    elements += [
        Spacer(1, 12),
        Paragraph('Summary', styles['SectionHeading']),
        _summary_table(report_card, styles, usable_mm=usable_mm),
    ]

    if report_card.homeroom_comment:
        elements += [
            Spacer(1, 12),
            Paragraph("Homeroom Teacher's Comment", styles['SectionHeading']),
            Paragraph(report_card.homeroom_comment, styles['Small']),
        ]

    # ✅ School branding — director's signature + official stamp, near the
    # bottom of the document, above the release/verification footer.
    elements += [
        Spacer(1, 18),
        _signature_stamp_block(school, styles, usable_mm=usable_mm),
    ]

    elements += [
        Spacer(1, 16),
        HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#e5e7eb')),
        Spacer(1, 6),
    ]

    if report_card.status == 'released' and report_card.released_by_id:
        released_line = (
            f"Released by {report_card.released_by.full_name} on "
            f"{report_card.released_at.strftime('%d %b %Y') if report_card.released_at else ''}"
        )
    else:
        released_line = 'DRAFT — not yet officially released'

    elements.append(Paragraph(
        f"{released_line}<br/>Verification code: {str(report_card.access_token)[:8].upper()}",
        styles['SmallGrey'],
    ))

    logo_data = _load_image_bytes(school.logo)
    page_decorator = _make_page_decorator(report_card, logo_data)

    doc.build(elements, onFirstPage=page_decorator, onLaterPages=page_decorator)
    buffer.seek(0)
    filename = f"report_card_{report_card.student.student_id}_{report_card.id or 'new'}.pdf"
    return ContentFile(buffer.read(), name=filename)
