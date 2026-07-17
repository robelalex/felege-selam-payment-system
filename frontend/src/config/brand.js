// src/config/brand.js
//
// Single source of truth for the PLATFORM's own name — the multi-tenant
// SaaS product itself (shown on the login screen before any school is
// identified, browser tab title, etc.) — as opposed to an individual
// SCHOOL's name (which comes dynamically from that school's own data via
// the API, e.g. schoolInfo.name in AdminLayout — that part was already
// correctly per-tenant and needs no change).
//
// To rebrand the whole platform: change the values below. Nothing else
// in the codebase should ever hardcode the platform name again — import
// PLATFORM_NAME from here instead.

export const PLATFORM_NAME = 'SchoolPay Ethiopia';
export const PLATFORM_TAGLINE = 'School Management & Payments, Simplified';
export const PLATFORM_SHORT_NAME = 'SchoolPay';
