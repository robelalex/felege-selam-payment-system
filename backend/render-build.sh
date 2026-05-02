#!/bin/bash
# Exit on error
set -o errexit

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create superuser automatically (if not exists)
echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='robelalex').exists() or User.objects.create_superuser('robelalex', 'robelalex95@gmail.com', 'Ru1744/15robel')" | python manage.py shell

echo "✅ Build completed successfully!"