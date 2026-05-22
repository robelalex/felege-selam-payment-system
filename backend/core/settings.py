# core/settings.py
import dj_database_url
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
import cloudinary
import cloudinary.uploader
import cloudinary.api
import sys

logging.basicConfig(level=logging.DEBUG)
load_dotenv()

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

# ===== SECURITY =====
# ✅ Use environment variable for secret key
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY environment variable is not set!")

# ✅ Debug must be False in production
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# ✅ Allow all necessary hosts
ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '10.140.190.94',
    '10.146.175.12',
    '10.141.130.95',
    '.onrender.com',
    'felege-selam-api.onrender.com',
    'felege-selam-payment-system.onrender.com',
    'testserver', 
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'corsheaders',
    'anymail',

    # Cloudinary for media storage
    'cloudinary_storage',
    'cloudinary',
    
    # Our apps
    'schools',
    'students',
    'payments',
    'authentication',
    'academics',
    'common',
    'admin_dashboard',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'common.middleware.SchoolMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
]

ROOT_URLCONF = 'core.urls'

# ===== TEMPLATES CONFIGURATION =====
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates'), os.path.join(BASE_DIR, 'staticfiles_build')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# ===== DATABASE CONFIGURATION =====
DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv('DATABASE_URL', 'postgresql://postgres:4178@localhost:5432/felege_selam_db'),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Addis_Ababa'
USE_I18N = True
USE_TZ = True

# ===== STATIC FILES CONFIGURATION =====
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'staticfiles_build'),
]
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media files (local fallback)
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===== DJANGO REST FRAMEWORK =====
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '200/minute',
        'user': '500/minute',
        'login': '10/hour',
    }
}

# ===== SESSION SETTINGS =====
SESSION_COOKIE_AGE = 3600
SESSION_SAVE_EVERY_REQUEST = True  # Keep only one
SESSION_COOKIE_PATH = '/'
SESSION_COOKIE_HTTPONLY = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
# Local vs Production settings
if DEBUG:
    # Local development (HTTP)
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_DOMAIN = None
    CSRF_COOKIE_SECURE = False
    CSRF_COOKIE_SAMESITE = 'Lax'
    CSRF_COOKIE_DOMAIN = None
else:
    # Production (HTTPS on Render)
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_DOMAIN = None
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_SAMESITE = 'Lax'
    CSRF_COOKIE_DOMAIN = None

CSRF_COOKIE_PATH = '/'
CSRF_COOKIE_HTTPONLY = False

# ===== CORS SETTINGS =====
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://felege-selam-payment-system.vercel.app",
    "https://*.vercel.app",
    "https://felege-selam-payment-system.onrender.com",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://felege-selam-payment-system.vercel.app",
    "https://*.vercel.app",
    "https://felege-selam-payment-system.onrender.com",
    "https://*.onrender.com",
]

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization', 'content-type',
    'dnt', 'origin', 'user-agent', 'x-csrftoken', 'x-requested-with',
    'x-school-id',
]

# ===== PRODUCTION SETTINGS =====
RENDER_EXTERNAL_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True

# ===== SMS CONFIGURATION =====
AFRICASTALKING_USERNAME = os.getenv('AFRICASTALKING_USERNAME', 'sandbox')
AFRICASTALKING_API_KEY = os.getenv('AFRICASTALKING_API_KEY', '')
SMS_SANDBOX = os.getenv('SMS_SANDBOX', 'True') == 'True'
SMS_SENDER_ID = os.getenv('SMS_SENDER_ID', 'FELEGE-SELAM')

# ===== CHAPA SETTINGS =====
CHAPA_SECRET_KEY = os.getenv('CHAPA_SECRET_KEY', '')

# ===== CLOUDINARY CONFIGURATION =====
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

CLOUDINARY_STORAGE = {
    'CLOUD_NAME': os.getenv('CLOUDINARY_CLOUD_NAME'),
    'API_KEY': os.getenv('CLOUDINARY_API_KEY'),
    'API_SECRET': os.getenv('CLOUDINARY_API_SECRET'),
}

DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'

RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')

# ===== EMAIL CONFIGURATION =====
# Using Brevo SMTP
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp-relay.brevo.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'abf20c001@smtp-brevo.com'
EMAIL_HOST_PASSWORD = os.getenv('BREVO_SMTP_KEY', '')

# ✅ Use the actual Brevo sender address (matches what Brevo uses)
DEFAULT_FROM_EMAIL = 'Felege Selam <robelalex95@11268620.brevosend.com>'

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://felege-selam-payment-system.onrender.com')

# ===== LOGIN URL FOR ADMIN DASHBOARD =====
LOGIN_URL = '/admin/login/'
LOGIN_REDIRECT_URL = '/admin-dashboard/'

# ===== FIX FOR RENDER STATIC FILES =====
if not DEBUG:
    # Tell WhiteNoise to serve static files from STATIC_ROOT
    WHITENOISE_ROOT = STATIC_ROOT
    
    # Ensure staticfiles directory exists
    import os
    if not os.path.exists(STATIC_ROOT):
        os.makedirs(STATIC_ROOT, exist_ok=True)