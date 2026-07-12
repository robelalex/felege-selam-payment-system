// utils/imageUrl.js
//
// Every image field coming from the backend (School.logo, Student.photo,
// StaffMember.photo, PaymentSlip.slip_image...) needs the SAME logic to
// become a real, loadable URL in the browser:
//   - In production, Cloudinary storage returns an already-absolute
//     https://res.cloudinary.com/... URL — just use it as-is.
//   - In local dev, Django's default file storage returns a relative
//     path like /media/student_photos/2026/07/x.jpg — prefix it with
//     the backend's own origin.
//
// Centralizing this in one place means fixing a URL bug once fixes it
// everywhere, instead of every page reinventing its own version.

export const getMediaUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  if (process.env.NODE_ENV === 'development') {
    return `http://127.0.0.1:8000${path.startsWith('/') ? path : `/${path}`}`;
  }

  const backendUrl = process.env.REACT_APP_API_URL || 'https://felege-selam-payment-system.onrender.com';
  const root = backendUrl.replace(/\/api\/?$/, '');
  return `${root}${path.startsWith('/') ? path : `/${path}`}`;
};
