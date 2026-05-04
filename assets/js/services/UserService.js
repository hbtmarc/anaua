/**
 * @fileoverview UserService.js — Local user accounts & profile persistence.
 *
 * Storage layout (localStorage):
 *   anaua_accounts  — Array of { email, passwordHash, profile }
 *   anaua_profile   — Last used payer profile (auto-fill on next booking)
 *
 * Storage layout (sessionStorage):
 *   anaua_user      — Current session: { email, name } (same key as cliente.js)
 *
 * This is a mock implementation (no backend). Passwords are stored as a simple
 * hash. Replace with a real auth provider (Firebase Auth, etc.) in production.
 */

// ─── Storage keys ─────────────────────────────────────────────────────────────

const ACCOUNTS_KEY = 'anaua_accounts';
const PROFILE_KEY  = 'anaua_profile';
const SESSION_KEY  = 'anaua_user';

// ─── Simple hash (demo only — NOT cryptographically safe) ─────────────────────

/**
 * Produces a deterministic numeric hash of a string.
 * Only suitable for demo/mock purposes.
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Accounts store (localStorage) ───────────────────────────────────────────

/**
 * @returns {Array<{email:string, passwordHash:string, profile:object}>}
 */
function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]'); }
  catch { return []; }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

// ─── User profile (payer data cache) ─────────────────────────────────────────

/**
 * Saves payer fields so they auto-fill on the next booking.
 * @param {{ fullName:string, cpf:string, email:string, phone:string, birthdate:string }} profile
 */
export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Returns the saved payer profile, or null if none.
 * @returns {{ fullName:string, cpf:string, email:string, phone:string, birthdate:string }|null}
 */
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null'); }
  catch { return null; }
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Returns the active session, or null.
 * @returns {{ email:string, name:string }|null}
 */
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); }
  catch { return null; }
}

/**
 * @param {{ email:string, name:string }} user
 */
export function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Convenience — returns true if there is an active session. */
export function isLoggedIn() {
  return getSession() !== null;
}

// ─── Account operations ───────────────────────────────────────────────────────

/**
 * Creates a new account and immediately starts a session.
 *
 * @param {{ fullName:string, cpf:string, email:string, phone:string, birthdate:string }} profile
 * @param {string} password  Plain-text password (min 6 chars enforced by caller)
 * @returns {{ ok:true } | { ok:false, error:string }}
 */
export function createAccount(profile, password) {
  const accounts = loadAccounts();
  const email = profile.email.trim().toLowerCase();

  if (accounts.find(a => a.email === email)) {
    return { ok: false, error: 'Este e-mail já está cadastrado. Faça login.' };
  }

  const newAccount = {
    email,
    passwordHash: simpleHash(password),
    profile: { ...profile, email },
  };

  accounts.push(newAccount);
  saveAccounts(accounts);
  saveProfile({ ...profile, email });
  setSession({ email, name: profile.fullName });

  return { ok: true };
}

/**
 * Attempts to log in with email + password.
 * On success, starts a session and updates the saved profile.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ ok:true, user:{ email:string, name:string } } | { ok:false, error:string }}
 */
export function login(email, password) {
  const accounts = loadAccounts();
  const normalised = email.trim().toLowerCase();
  const account = accounts.find(a => a.email === normalised);

  if (!account || account.passwordHash !== simpleHash(password)) {
    return { ok: false, error: 'E-mail ou senha incorretos.' };
  }

  const user = { email: normalised, name: account.profile.fullName };
  setSession(user);
  saveProfile(account.profile);

  return { ok: true, user };
}

/**
 * Returns the stored profile for a logged-in email, or null.
 * @param {string} email
 * @returns {object|null}
 */
export function getAccountProfile(email) {
  const accounts = loadAccounts();
  const account = accounts.find(a => a.email === email.trim().toLowerCase());
  return account?.profile ?? null;
}

/**
 * Updates the profile of an existing account (e.g., after a booking).
 * @param {string} email
 * @param {object} profilePatch  Partial profile fields to merge.
 */
export function updateAccountProfile(email, profilePatch) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.email === email.trim().toLowerCase());
  if (idx === -1) return;
  accounts[idx].profile = { ...accounts[idx].profile, ...profilePatch };
  saveAccounts(accounts);
  saveProfile(accounts[idx].profile);
}
