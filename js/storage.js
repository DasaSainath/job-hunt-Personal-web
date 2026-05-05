/**
 * User-scoped localStorage.
 * Every key is prefixed with the logged-in user's email so that
 * different users on the same browser never see each other's data.
 *
 * Usage:
 *   import { store } from './storage.js';
 *   store.set('profile', {...})   →  saves under current user
 *   store.get('profile')          →  reads for current user only
 *   store.remove('profile')
 */

function userPrefix() {
  try {
    const auth = JSON.parse(localStorage.getItem('jh_auth') || '{}');
    const email = (auth.email || '').toLowerCase().replace(/[^a-z0-9@.]/g, '_');
    return email ? `jh__${email}__` : 'jh__guest__';
  } catch { return 'jh__guest__'; }
}

export const store = {
  get(key)         { return localStorage.getItem(userPrefix() + key); },
  set(key, value)  { localStorage.setItem(userPrefix() + key, value); },
  remove(key)      { localStorage.removeItem(userPrefix() + key); },
  getJSON(key)     { try { return JSON.parse(store.get(key) || 'null'); } catch { return null; } },
  setJSON(key, v)  { store.set(key, JSON.stringify(v)); },
};

// Named keys — import these instead of raw strings to avoid typos
export const KEYS = {
  PROFILE:       'profile',
  APPLICATIONS:  'applications',
  MATCH_HISTORY: 'match_history',
  RAPID_API_KEY: 'rapid_api_key',
  AI_API_KEY:    'ai_api_key',
  LOCATION_PREF: 'location_pref',
  RESUME_TEXT:   'resume_text',
};
