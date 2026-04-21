# backend/users/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers
from django.contrib.auth.models import User
from schools.models import SchoolAdminProfile


class UserSerializer(serializers.ModelSerializer):
    school_id = serializers.SerializerMethodField()
    school_name = serializers.SerializerMethodField()
    user_type = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 
                  'school_id', 'school_name', 'user_type', 'is_staff', 'is_superuser']
    
    def get_school_id(self, obj):
        try:
            profile = SchoolAdminProfile.objects.filter(user=obj, is_active=True).first()
            if profile:
                return profile.school.id
        except:
            pass
        return None
    
    def get_school_name(self, obj):
        try:
            profile = SchoolAdminProfile.objects.filter(user=obj, is_active=True).first()
            if profile:
                return profile.school.name
        except:
            pass
        return None
    
    def get_user_type(self, obj):
        if obj.is_superuser:
            return 'super_admin'
        try:
            if SchoolAdminProfile.objects.filter(user=obj).exists():
                return 'school_admin'
        except:
            pass
        return 'user'


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)