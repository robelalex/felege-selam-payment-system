# report_cards/serializers.py
from rest_framework import serializers
from .models import ReportCard


class ReportCardSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    term_name = serializers.CharField(source='term.name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    generated_by_name = serializers.CharField(source='generated_by.full_name', read_only=True, default='')
    released_by_name = serializers.CharField(source='released_by.full_name', read_only=True, default='')
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = ReportCard
        fields = [
            'id', 'student', 'student_name', 'student_id_display',
            'report_type', 'term', 'term_name', 'academic_year', 'academic_year_name',
            'status', 'grade', 'section', 'homeroom_teacher_name',
            'overall_average', 'is_passing', 'letter_grade',
            'homeroom_rank', 'homeroom_rank_total', 'school_rank', 'school_rank_total',
            'attendance_present_days', 'attendance_absent_days', 'attendance_late_days',
            'homeroom_comment', 'pdf_url',
            'generated_at', 'generated_by_name', 'released_at', 'released_by_name',
        ]
        read_only_fields = [f for f in fields if f != 'homeroom_comment']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get('request')
        url = obj.pdf_file.url
        return request.build_absolute_uri(url) if request else url
