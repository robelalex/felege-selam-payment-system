# core/settings.py
import dj_database_url
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
import cloudinary
import cloudinary.uploader
import cloudinary.api

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
    'felege-selam-payment-system.onrender.com',  # ✅ Add this
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
    'django.middleware.csrf.CsrfViewMiddleware',  # ← Moved to the END
]

ROOT_URLCONF = 'core.urls'

# ===== TEMPLATES CONFIGURATION =====
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'staticfiles_build')],  # ✅ React build folder
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
STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'staticfiles_build'),  # ✅ Different folder from STATIC_ROOT
]
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media files (local fallback)
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===== DJANGO REST FRAMEWORK WITH OPTIMIZED RATE LIMITING =====
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
        # ✅ Increased for normal usage
        'anon': '200/minute',      # Anonymous users: 200 requests per minute
        'user': '500/minute',      # Authenticated users: 500 requests per minute
        'login': '10/hour',        # Login attempts: 10 per hour (security)
    }
}

# ===== SESSION SETTINGS =====
# Session timeout: Auto logout after 30 minutes of inactivity
SESSION_COOKIE_AGE = 1800  # 30 minutes in seconds
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'None'
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_DOMAIN = '.onrender.com'

CSRF_COOKIE_SAMESITE = 'None'
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_DOMAIN = '.onrender.com'

# ===== CORS SETTINGS - PRODUCTION READY =====
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
    "https://felege-selam-payment-system.vercel.app",
    "https://*.vercel.app",
    "https://felege-selam-payment-system.onrender.com",
]

# ✅ Add this for production
CORS_ALLOW_ALL_ORIGINS = False  # Don't allow all, only specified
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
    # ✅ These are required for cross-domain cookies
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

# ===== EMAIL CONFIGURATION - Gmail SMTP =====
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'robelalex95@gmail.com'
EMAIL_HOST_PASSWORD = 'ginz gqid bfxe mjqf'  # Your App Password
DEFAULT_FROM_EMAIL = 'Felege Selam Payment <robelalex95@gmail.com>'

# Frontend URL for password reset links
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# Add this line at the end of settings.py (after FRONTEND_URL)
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://felege-selam-payment-system.onrender.com')