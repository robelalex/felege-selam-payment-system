# SchoolPay Ethiopia (formerly Felege Selam Payment System)

A multi-tenant school management and fee payment platform built for Ethiopian schools — combining student/academic records, online and offline fee collection, AI-assisted payment verification, and automated parent communication into a single system.

Originally built and piloted for Felege Selam School in Jimma, Ethiopia, and designed from the ground up to support multiple schools on one platform.

## What this system does

- **Multi-school support** — each school has its own bank details, logo, grading system, and communication settings, so the platform can serve many institutions, not just one.
- **Student & academic records** — student registration, ID generation, bulk import via Excel/CSV, academic years, grade levels, and exam records with configurable grading (percentage, letter grade, or both).
- **Fee payments** — supports Cash, Telebirr, Bank Transfer, and Chapa (Ethiopia's online payment gateway), tracked against monthly deadlines set on the Ethiopian calendar.
- **AI-assisted slip verification** — parents can upload a photo of a bank/Telebirr receipt, and the system uses computer vision (OpenCV) and OCR (Tesseract) to automatically read and verify the payment details, removing manual checking.
- **Automated SMS reminders** — payment due-date reminders sent to parents via Afro Message / Africa's Talking.
- **Role-based dashboards** — dedicated views for Parents, Teachers, Registrars, Payment Managers, and Super Admins (who manage multiple schools).
- **Reporting** — financial and academic reporting dashboards for administrators.

## Architecture

This repository contains two parts of a larger system:

| Part | Location | Tech |
|---|---|---|
| Backend API | `/backend` | Django 5 + Django REST Framework |
| Admin/staff web app | `/frontend` | React |

A companion mobile app for parents and teachers (Flutter) lives in a separate repository and consumes this backend's API.

### Backend structure

```
backend/
├── core/            # Django project settings, URLs
├── schools/         # School model — multi-tenant foundation
├── students/        # Student records, bulk import, ID generation
├── academics/       # Academic years, terms
├── exams/           # Exam records, grading
├── payments/        # Payments, deadlines, Chapa/OCR/SMS/report services
├── authentication/  # JWT-based auth
├── staff/           # Staff management
├── admin_dashboard/ # Super admin views across schools
├── reports/         # Reporting endpoints
└── common/          # Shared middleware, utilities
```

### Key backend services (`payments/services/`)
- `chapa_service.py` — Chapa payment gateway integration and webhooks
- `ocr_service.py` — bank slip OCR/verification pipeline
- `sms_ethiopia.py` — SMS reminder delivery
- `report_service.py` — financial reporting
- `reminder_service.py` — scheduled payment reminders

### Frontend pages (`frontend/src/pages/`)
Includes dedicated views for: Super Admin, Payment Manager, Registrar, Parent, Student, Staff Management, Reporting, SMS Dashboard, School Settings, and the parent-facing payment/receipt flow.

## Tech stack

- **Backend:** Django 5.2, Django REST Framework, Django Q2 (background tasks), PostgreSQL (via `dj-database-url`), JWT auth (`djangorestframework_simplejwt`)
- **Payments:** Chapa API, webhook-based confirmation
- **OCR/Computer Vision:** OpenCV, Tesseract (`pytesseract`)
- **Storage:** Cloudinary (images/files)
- **SMS/Email:** Africa's Talking / Afro Message, Django Anymail
- **Frontend:** React, Tailwind CSS
- **Deployment:** Backend on Render, frontend on Vercel

## Getting started (local development)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env       # fill in your own secrets/keys
python manage.py migrate
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment variables

The backend expects a `.env` file with (at minimum):
- `SECRET_KEY`
- `DATABASE_URL`
- `CHAPA_SECRET_KEY`
- `CLOUDINARY_URL`
- SMS provider credentials (Afro Message / Africa's Talking)

**Never commit your real `.env` file** — keep it in `.gitignore` and share required keys with collaborators separately.

## Deployment

- Backend: configured for Render (`render.yaml`, `build.sh`)
- Frontend: configured for Vercel (`vercel.json`)

## Status

Actively developed. Core payment, student, academic, and reporting flows are built and functional. Currently seeking pilot schools for real-world deployment and feedback.

## License

Not yet specified 

## Author

Robel Alemayehu Bekele — Founder & Lead Developer
