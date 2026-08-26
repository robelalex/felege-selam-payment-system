# schools/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    SchoolSMSConfigView, 
    SchoolSMSTestView, 
    SchoolEmailConfigView,   # ✅ NEW
    SchoolEmailTestView,     # ✅ NEW
    fix_missing_profiles, 
    sms_config_preflight,
    verify_et_settings,           
    test_verify_et_connection,
    SchoolChapaConfigView,
    SchoolChapaTestView,
    ChapaReauthView,
)

router = DefaultRouter()
router.register(r'schools', views.SchoolViewSet)
router.register(r'bank-accounts', views.BankAccountViewSet, basename='bank-account')

urlpatterns = [
    # ✅ CRITICAL: Custom paths MUST come BEFORE router.urls
    # The router matches /schools/<pk>/ and will swallow 'chapa-config' as a pk value
    
    # DEBUG endpoint
    path('schools/sms-config-preflight/', sms_config_preflight, name='sms-preflight'),
    
    # TEMPORARY - Remove after running once
    path('schools/fix-missing-profiles/', fix_missing_profiles, name='fix-missing-profiles'),
    
    # SMS endpoints
    path('schools/sms-config/', SchoolSMSConfigView.as_view(), name='school-sms-config'),
    path('schools/sms-test/', SchoolSMSTestView.as_view(), name='school-sms-test'),
    
    # Verify.ET endpoints
    path('schools/verify-et-settings/', verify_et_settings, name='verify-et-settings'),
    path('schools/verify-et-test/', test_verify_et_connection, name='verify-et-test'),
    
    # ✅ Chapa endpoints
    path('schools/chapa-config/', SchoolChapaConfigView.as_view(), name='school-chapa-config'),
    path('schools/chapa-test/', SchoolChapaTestView.as_view(), name='school-chapa-test'),
    # ✅ NEW: password re-confirmation required before chapa-config above
    # will respond — see ChapaReauthView / SchoolChapaConfigView.
    path('schools/chapa/reauth/', ChapaReauthView.as_view(), name='school-chapa-reauth'),

    # ✅ NEW: Email config paths (MUST come before router.urls)
    path('schools/email-config/', SchoolEmailConfigView.as_view(), name='school-email-config'),
    path('schools/email-test/', SchoolEmailTestView.as_view(), name='school-email-test'),


    # ✅ Router LAST — so it never intercepts the custom paths above
    path('', include(router.urls)),
]