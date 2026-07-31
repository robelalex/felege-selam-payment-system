# report_cards/services/pdf_service.py
#
# Phase 6 (continued) — draws a ReportCard's already-frozen fields +
# snapshot_data into an actual PDF using reportlab, and saves it onto
# the row's pdf_file. Nothing here computes numbers — that's
# generation_service.py's job. This file only ever reads a ReportCard
# that already exists and renders exactly what's on it, so re-rendering
# the same row twice always produces the same PDF.
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

PRIMARY = colors.HexColor('#0f4c81')
LIGHT_BG = colors.HexColor('#eef3f8')
GREY = colors.HexColor('#6b7280')


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle('SchoolName', parent=styles['Title'], fontSize=18, textColor=PRIMARY, spaceAfter=2))
    styles.add(ParagraphStyle('SchoolMeta', parent=styles['Normal'], fontSize=9, textColor=GREY))
    styles.add(ParagraphStyle('DocTitle', parent=styles['Normal'], fontSize=13, alignment=TA_CENTER,
                              textColor=colors.white, spaceBefore=0, spaceAfter=0))
    styles.add(ParagraphStyle('SectionHeading', parent=styles['Heading3'], fontSize=11, textColor=PRIMARY,
                              spaceBefore=10, spaceAfter=4))
    styles.add(ParagraphStyle('Small', parent=styles['Normal'], fontSize=9))
    styles.add(ParagraphStyle('SmallGrey', parent=styles['Normal'], fontSize=8.5, textColor=GREY))
    styles.add(ParagraphStyle('SmallRight', parent=styles['Normal'], fontSize=9, alignment=TA_RIGHT))
    return styles


def _fmt_pct(value):
    return f"{float(value):.1f}%" if value is not None else "—"


def _fmt_rank(rank, total):
    if rank is None:
        return "—"
    return f"{rank} / {total}" if total else str(rank)


def _pass_fail_text(is_passing):
    if is_passing is None:
        return "—"
    return "PASS" if is_passing else "FAIL"


def _header_table(report_card, styles):
    school = report_card.school
    label = report_card.term.name if report_card.term else f"{report_card.academic_year.name} — Year-End Cumulative"

    left = [Paragraph(school.name, styles['SchoolName'])]
    if school.address:
        left.append(Paragraph(school.address, styles['SchoolMeta']))
    contact_bits = [b for b in [school.phone, school.email] if b]
    if contact_bits:
        left.append(Paragraph(" · ".join(contact_bits), styles['SchoolMeta']))

    right = Paragraph(
        f"<b>REPORT CARD</b><br/>{label}<br/>{report_card.academic_year.name}",
        ParagraphStyle('HeaderRight', parent=styles['Small'], alignment=TA_RIGHT, leading=14),
    )

    t = Table([[left, right]], colWidths=[110 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def _student_info_table(report_card, styles):
    student = report_card.student
    rows = [
        ["Student Name", f"{student.first_name} {student.last_name}", "Student ID", student.student_id],
        ["Grade / Section", f"Grade {report_card.grade}{(' ' + report_card.section) if report_card.section else ''}",
         "Homeroom Teacher", report_card.homeroom_teacher_name or "—"],
    ]
    t = Table(rows, colWidths=[32 * mm, 58 * mm, 32 * mm, 58 * mm])
    t.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), GREY),
        ('TEXTCOLOR', (2, 0), (2, -1), GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
    ]))
    return t


def _subjects_table_term(snapshot_subjects, show_letter_grade):
    header = ["Subject", "Average"]
    if show_letter_grade:
        header.append("Grade")
    header.append("Result")

    rows = [header]
    for s in snapshot_subjects:
        row = [s.get('subject_name', ''), _fmt_pct(s.get('average_percentage'))]
        if show_letter_grade:
            row.append(s.get('letter_grade') or '—')
        row.append(_pass_fail_text(s.get('is_passing')))
        rows.append(row)

    col_widths = [70 * mm, 30 * mm] + ([20 * mm] if show_letter_grade else []) + [30 * mm]
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(_subject_table_style())
    return t


def _subjects_table_cumulative(snapshot_subjects, term_names):
    header = ["Subject"] + term_names + ["Year Average"]
    rows = [header]
    for s in snapshot_subjects:
        per_term = s.get('per_term', {})
        row = [s.get('subject_name', '')] + [_fmt_pct(per_term.get(tn)) for tn in term_names] + \
              [_fmt_pct(s.get('year_average'))]
        rows.append(row)

    n_terms = len(term_names)
    col_widths = [60 * mm] + [(100 * mm) / max(n_terms, 1)] * n_terms + [30 * mm]
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(_subject_table_style())
    return t


def _subject_table_style():
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e5e7eb')),
    ])


def _summary_table(report_card, styles):
    rows = [
        ["Overall Average", _fmt_pct(report_card.overall_average)],
        ["Result", _pass_fail_text(report_card.is_passing)],
    ]
    if report_card.letter_grade:
        rows.append(["Letter Grade", report_card.letter_grade])
    rows.append(["Class Rank (Homeroom)", _fmt_rank(report_card.homeroom_rank, report_card.homeroom_rank_total)])
    if report_card.school_rank is not None:
        rows.append(["School-Wide Rank", _fmt_rank(report_card.school_rank, report_card.school_rank_total)])

    if any(v is not None for v in [
        report_card.attendance_present_days, report_card.attendance_absent_days, report_card.attendance_late_days,
    ]):
        present = report_card.attendance_present_days or 0
        absent = report_card.attendance_absent_days or 0
        late = report_card.attendance_late_days or 0
        rows.append(["Attendance (year-to-date)", f"{present} present · {absent} absent · {late} late"])

    t = Table(rows, colWidths=[60 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.HexColor('#eef0f2')),
    ]))
    return t


def render_report_card_pdf(report_card):
    """
    Builds the PDF for one ReportCard row from its own frozen fields and
    snapshot_data, and returns a Django ContentFile ready to be assigned
    to report_card.pdf_file. Does NOT save the model — the caller
    decides when to save (generation_service does this right after).
    """
    styles = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title="Report Card",
    )

    school = report_card.school
    show_letters = school.grading_system in ('letter_grade', 'both')
    snapshot = report_card.snapshot_data or {}
    subjects = snapshot.get('subjects', [])

    elements = [
        _header_table(report_card, styles),
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=1.2, color=PRIMARY),
        Spacer(1, 10),
        _student_info_table(report_card, styles),
        Spacer(1, 12),
        Paragraph("Academic Results", styles['SectionHeading']),
    ]

    if report_card.report_type == 'term':
        if subjects:
            elements.append(_subjects_table_term(subjects, show_letters))
        else:
            elements.append(Paragraph("No subject results were available at the time this report card was generated.", styles['SmallGrey']))
    else:
        term_names = snapshot.get('term_names', [])
        if subjects:
            elements.append(_subjects_table_cumulative(subjects, term_names))
        else:
            elements.append(Paragraph("No subject results were available at the time this report card was generated.", styles['SmallGrey']))

    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Summary", styles['SectionHeading']))
    elements.append(_summary_table(report_card, styles))

    if report_card.homeroom_comment:
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("Homeroom Teacher's Comment", styles['SectionHeading']))
        elements.append(Paragraph(report_card.homeroom_comment, styles['Small']))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e5e7eb')))
    elements.append(Spacer(1, 6))

    if report_card.status == 'released' and report_card.released_by_id:
        released_line = (
            f"Released by {report_card.released_by.full_name} on "
            f"{report_card.released_at.strftime('%d %b %Y') if report_card.released_at else ''}"
        )
    else:
        released_line = "DRAFT — not yet officially released"

    footer_text = (
        f"{released_line}<br/>"
        f"Verification code: {str(report_card.access_token)[:8].upper()}"
    )
    elements.append(Paragraph(footer_text, styles['SmallGrey']))

    doc.build(elements)
    buffer.seek(0)

    filename = f"report_card_{report_card.student.student_id}_{report_card.id or 'new'}.pdf"
    return ContentFile(buffer.read(), name=filename)
