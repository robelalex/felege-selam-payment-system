# exams/serializers.py
from rest_framework import serializers
from .models import Term, AssessmentType, Mark, DailyAttendance, SubjectAttendance


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = ['id', 'school', 'academic_year', 'name', 'order', 'is_active', 'created_at']
        read_only_fields = ['school']


class AssessmentTypeSerializer(serializers.ModelSerializer):
    term_name = serializers.CharField(source='term.name', read_only=True, default=None)

    class Meta:
        model = AssessmentType
        fields = ['id', 'school', 'academic_year', 'term', 'term_name', 'name', 'max_score', 'weight_percent', 'order', 'is_active', 'created_at']
        read_only_fields = ['school']


class MarkSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    assessment_type_name = serializers.CharField(source='assessment_type.name', read_only=True)
    max_score = serializers.DecimalField(source='assessment_type.max_score', max_digits=6, decimal_places=2, read_only=True)
    entered_by_name = serializers.CharField(source='entered_by.full_name', read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)

    class Meta:
        model = Mark
        fields = [
            'id', 'school', 'academic_year', 'student', 'student_name', 'student_id_display',
            'subject', 'subject_name', 'assessment_type', 'assessment_type_name', 'max_score',
            'grade', 'section', 'score', 'entered_by', 'entered_by_name', 'status',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'homeroom_note',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['school', 'academic_year', 'entered_by', 'status', 'reviewed_by', 'reviewed_at']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class DailyAttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True, default=None)

    class Meta:
        model = DailyAttendance
        fields = [
            'id', 'school', 'academic_year', 'student', 'student_name', 'student_id_display',
            'grade', 'section', 'date', 'status', 'recorded_by', 'recorded_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['school', 'academic_year', 'recorded_by']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class SubjectAttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True, default=None)

    class Meta:
        model = SubjectAttendance
        fields = [
            'id', 'school', 'academic_year', 'student', 'student_name', 'student_id_display',
            'subject', 'subject_name', 'grade', 'section', 'date', 'status',
            'recorded_by', 'recorded_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['school', 'academic_year', 'recorded_by']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"
