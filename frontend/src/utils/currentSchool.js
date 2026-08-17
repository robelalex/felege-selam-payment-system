// frontend/src/utils/currentSchool.js
//
// GET /api/schools/ always returns a plain array (no pagination — see
// core/settings.py). For a single-school admin that array only ever has
// one element, so grabbing index 0 was harmless. For a super admin
// managing multiple schools it returns EVERY school, and index 0 is
// whatever the DB happens to list first — not necessarily the school
// currently selected in the sidebar (X-School-ID header, sourced from
// localStorage 'selectedSchool'). Settings pages that blindly took
// data[0] were silently reading/writing the wrong school's settings for
// any multi-school admin.
//
// This resolves the same school the rest of the app is scoped to
// (get_verified_school_id() on the backend), so a page that edits "the
// school" always edits the one actually selected.
export function pickCurrentSchool(schoolsResponseData) {
  const list = Array.isArray(schoolsResponseData) ? schoolsResponseData : [schoolsResponseData].filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  try {
    const saved = localStorage.getItem('selectedSchool');
    if (saved) {
      const selected = JSON.parse(saved);
      if (selected?.id) {
        const match = list.find((s) => s.id === selected.id);
        if (match) return match;
      }
    }
  } catch (e) {
    // Fall through to the default below.
  }

  // No selection recorded yet (or it didn't match anything returned) —
  // fall back to the first school rather than failing outright.
  return list[0];
}
