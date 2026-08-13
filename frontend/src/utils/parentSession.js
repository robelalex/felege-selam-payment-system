// src/utils/parentSession.js
// ✅ NEW: shared parent-session helpers. Before this, `parentSession` was
// read/written directly by three different pages with no logout and no
// expiry — a session lived forever in localStorage until manually
// cleared, and there was no way for a parent to sign out on a shared
// device. This is the one place session lifetime rules live now.

const SESSION_KEY = 'parentSession';
const STUDENT_KEY = 'selectedStudent';

// 24 hours — long enough that a parent checking back later the same day
// isn't annoyingly logged out, short enough that a lost or shared device
// (a school office computer, a borrowed phone) doesn't stay signed in
// indefinitely.
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function getParentSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * True only if a session exists, was actually verified via OTP, and is
 * younger than SESSION_MAX_AGE_MS. Every page that gates on "is this
 * parent logged in" should use this instead of a raw
 * `localStorage.getItem('parentSession')` truthiness check.
 */
export function isParentSessionValid() {
  const session = getParentSession();
  if (!session || !session.verified || !session.verifiedAt) return false;
  const age = Date.now() - new Date(session.verifiedAt).getTime();
  return age >= 0 && age < SESSION_MAX_AGE_MS;
}

/**
 * Clears the session AND the currently selected student — logging out
 * without also clearing selectedStudent would let the next person on
 * this device land straight back on a dashboard for the previous
 * parent's child without re-verifying anything.
 */
export function clearParentSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STUDENT_KEY);
}
