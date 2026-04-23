// Shared utilities for all pages.
// Uses the Fetch API to load JSON from data/ so the site works on GitHub Pages
// without any build step.

export async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export async function loadResume() {
  // Always prefer user-scoped profile — return it even if name is blank
  try {
    const auth = JSON.parse(localStorage.getItem('jh_auth') || '{}');
    const email = (auth.email || '').toLowerCase().replace(/[^a-z0-9@.]/g, '_');
    const key = email ? `jh__${email}__profile` : null;
    if (key) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        // Return any saved profile object — not just ones where name was extracted
        if (p && typeof p === 'object') return p;
      }
    }
  } catch (e) { /* fall through */ }
  // Fallback: blank profile (don't try to load data/resume.json which may 404)
  return { name:'', title:'', summary:'', skills:{}, experience:[], education:[], projects:[], publications:[] };
}

export async function loadAllJobs() {
  const [feed, manual] = await Promise.all([
    loadJSON('data/jobs.json').catch(() => ({ jobs: [] })),
    loadJSON('data/manual-jobs.json').catch(() => ({ jobs: [] }))
  ]);
  const feedJobs = (feed.jobs || []).map(j => ({ ...j, _manual: false }));
  const manualJobs = (manual.jobs || [])
    .filter(j => j.id !== 'manual-example-1')  // hide the placeholder
    .map(j => ({ ...j, _manual: true }));
  return {
    updated_at: feed.updated_at || '',
    jobs: [...manualJobs, ...feedJobs]
  };
}

export async function loadSkills() {
  const data = await loadJSON('data/skills.json');
  return data.skills || [];
}

// Flatten resume into a single searchable text blob (used by the matcher).
export function resumeToText(resume) {
  const parts = [
    resume.name || '',
    resume.title || '',
    resume.tagline || '',
    resume.summary || ''
  ];
  const s = resume.skills || {};
  Object.values(s).forEach(arr => {
    if (Array.isArray(arr)) parts.push(arr.join(' '));
  });
  (resume.experience || []).forEach(e => {
    parts.push(e.role || '', e.company || '');
    (e.bullets || []).forEach(b => parts.push(b));
  });
  (resume.projects || []).forEach(p => {
    parts.push(p.title || p.name || '', p.description || '');
    if (Array.isArray(p.tech)) p.tech.forEach(t => parts.push(t));
    else if (typeof p.tech === 'string') parts.push(p.tech);
  });
  (resume.education || []).forEach(ed => {
    parts.push(ed.degree || '', ed.school || '');
  });
  return parts.join(' \n ');
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(s, n = 280) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n).trim() + '…';
}

export function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function scoreClass(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

// Simple router that highlights the active nav link.
export function markActiveNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const target = a.getAttribute('href');
    if (target === here || (target === 'index.html' && here === '')) {
      a.classList.add('active');
    }
  });
}
