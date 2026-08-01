# report_cards/services/pdf_service.py
#
# Renders a ReportCard row into a PDF. Nothing here computes numbers —
# it only reads the already-frozen snapshot_data and the model fields.
# Re-rendering the same row twice always produces the same document.
import io
from django.core.files.base import ContentFile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

PRIMARY  = colors.HexColor('#0f4c81')
LIGHT_BG = colors.HexColor('#eef3f8')
GREY     = colors.HexColor('#6b7280')

A4_WIDTH_MM = 210   # inner usable width after margins (approx 174 mm at 18 mm each side)
USABLE_MM   = 174


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


def _header_table(report_card, styles):
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

    t = Table([[left, right_para]], colWidths=[110 * mm, 64 * mm])
    t.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
    ]))
    return t


def _student_info_table(report_card, styles):
    student = report_card.student
    rows = [
        ['Student Name', f"{student.first_name} {student.last_name}", 'Student ID', student.student_id],
        ['Grade / Section',
         f"Grade {report_card.grade}{(' ' + report_card.section) if report_card.section else ''}",
         'Homeroom Teacher', report_card.homeroom_teacher_name or '—'],
    ]
    t = Table(rows, colWidths=[32 * mm, 55 * mm, 35 * mm, 52 * mm])
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


def _dynamic_col_widths(n_data_cols, subject_col_mm=60, min_data_col_mm=22):
    """
    Distribute USABLE_MM between the subject name column and N equal data
    columns. If there are many terms the data columns shrink to min_data_col_mm
    and the subject column gives up space proportionally — prevents overflow
    on wide cumulative tables with 3+ terms.
    """
    available = USABLE_MM - subject_col_mm
    data_col  = max(min_data_col_mm, available / max(n_data_cols, 1))
    actual_subj = USABLE_MM - data_col * n_data_cols
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


def _summary_table(report_card, styles):
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

    t = Table(rows, colWidths=[65 * mm, 109 * mm])
    t.setStyle(TableStyle([
        ('FONTSIZE',      (0, 0), (-1, -1), 9.5),
        ('FONTNAME',      (0, 0), (0, -1),  'Helvetica-Bold'),
        ('TEXTCOLOR',     (0, 0), (0, -1),  GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.4, colors.HexColor('#eef0f2')),
    ]))
    return t


def render_report_card_pdf(report_card):
    """
    Builds the PDF for one ReportCard from its frozen fields + snapshot_data
    and returns a Django ContentFile. Does NOT save the model — the caller
    decides when to save.
    """
    styles   = _styles()
    buffer   = io.BytesIO()
    doc      = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm,  bottomMargin=16 * mm,
        title='Report Card',
    )

    school       = report_card.school
    show_letters = school.grading_system in ('letter_grade', 'both')
    snapshot     = report_card.snapshot_data or {}
    subjects     = snapshot.get('subjects', [])

    elements = [
        _header_table(report_card, styles),
        Spacer(1, 6),
        HRFlowable(width='100%', thickness=1.2, color=PRIMARY),
        Spacer(1, 10),
        _student_info_table(report_card, styles),
        Spacer(1, 12),
        Paragraph('Academic Results', styles['SectionHeading']),
    ]

    if report_card.report_type == 'term':
        if subjects:
            elements.append(_subjects_table_term(subjects, show_letters))
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
        _summary_table(report_card, styles),
    ]

    if report_card.homeroom_comment:
        elements += [
            Spacer(1, 12),
            Paragraph("Homeroom Teacher's Comment", styles['SectionHeading']),
            Paragraph(report_card.homeroom_comment, styles['Small']),
        ]

    elements += [
        Spacer(1, 20),
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

    doc.build(elements)
    buffer.seek(0)
    filename = f"report_card_{report_card.student.student_id}_{report_card.id or 'new'}.pdf"
    return ContentFile(buffer.read(), name=filename)
