#!/bin/bash
# Exit on error
set -o errexit

echo "🚀 Starting build process..."

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create superuser (force create if doesn't exist)
python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()

username = 'robelalex'
email = 'robelalex95@gmail.com'
password = 'Ru1744/15robel'

if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username=username, email=email, password=password)
    print(f"✅ Superuser '{username}' created successfully!")
else:
    print(f"⚠️ Superuser '{username}' already exists, skipping creation.")
EOF

echo "✅ Build completed successfully!"