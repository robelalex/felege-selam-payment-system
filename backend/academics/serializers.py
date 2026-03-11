from rest_framework import serializers
from .models import AcademicYear, YearPromotionLog

class AcademicYearSerializer(serializers.ModelSerializer):
    statistics = serializers.SerializerMethodField()
    
    class Meta:
        model = AcademicYear
        fields = '__all__'
    
    def get_statistics(self, obj):
        return obj.get_statistics()

class YearPromotionLogSerializer(serializers.ModelSerializer):
    from_year_name = serializers.CharField(source='from_year.name', read_only=True)
    to_year_name = serializers.CharField(source='to_year.name', read_only=True)
    promoted_by_username = serializers.CharField(source='promoted_by.username', read_only=True)
    
    class Meta:
        model = YearPromotionLog
        fields = '__all__'