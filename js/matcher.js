// Resume ↔ Job-Description matcher.
// Pure client-side. No network calls. No external libraries.
//
// Score = 0.6 * skill_overlap + 0.4 * content_similarity
//   - skill_overlap: fraction of JD skills present in the resume
//   - content_similarity: cosine similarity of TF-IDF vectors of the two texts
//
// Returns rich output: matched/missing skills, JD-only keywords, and
// actionable suggestions for what to add to the resume.

// ---------- Stopwords ----------
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of',
  'in', 'on', 'at', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
  'your', 'our', 'its', 'his', 'her', 'my', 'me', 'us', 'who', 'whom', 'whose',
  'which', 'what', 'where', 'when', 'why', 'how', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'must', 'shall', 'not', 'no', 'nor', 'so',
  'than', 'too', 'very', 'just', 'also', 'more', 'most', 'some', 'such', 'only',
  'own', 'same', 'other', 'any', 'all', 'each', 'every', 'from', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'further', 'here', 'there', 'now',
  'about', 'into', 'through', 'during', 'before', 'after', 'between',
  'job', 'role', 'work', 'team', 'company', 'position', 'responsibilities',
  'requirements', 'years', 'year', 'experience', 'experienced', 'strong',
  'excellent', 'good', 'able', 'ability', 'skills', 'skill', 'knowledge',
  'understanding', 'working', 'proficient', 'familiar', 'including', 'include',
  'preferred', 'required', 'must', 'nice', 'plus', 'bonus', 'day', 'days',
  'apply', 'applying', 'please', 'candidate', 'ideal', 'looking', 'seeking'
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+.#\-\s]/gu, ' ')  // keep letters, numbers, + . # -
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function termFreq(tokens) {
  const tf = new Map();
  tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
  return tf;
}

// Treat the two documents (resume, JD) as our corpus for IDF.
// With only 2 docs IDF is crude but still usefully downweights shared terms.
function idf(termFreqsList) {
  const N = termFreqsList.length;
  const df = new Map();
  termFreqsList.forEach(tf => {
    for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  });
  const idfMap = new Map();
  for (const [term, count] of df) {
    idfMap.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idfMap;
}

function tfidfVec(tf, idfMap) {
  const vec = new Map();
  let norm = 0;
  for (const [term, freq] of tf) {
    const w = (1 + Math.log(freq)) * (idfMap.get(term) || 1);
    vec.set(term, w);
    norm += w * w;
  }
  return { vec, norm: Math.sqrt(norm) };
}

function cosineSim(a, b) {
  if (!a.norm || !b.norm) return 0;
  let dot = 0;
  for (const [term, w] of a.vec) {
    if (b.vec.has(term)) dot += w * b.vec.get(term);
  }
  return dot / (a.norm * b.norm);
}

// ---------- Skill extraction ----------
// Skills may be multi-word ("machine learning"). We do case-insensitive
// substring matching on word boundaries for each alias.
function extractSkills(text, skills) {
  if (!text) return new Set();
  const lower = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}+.#\s-]/gu, ' ') + ' ';
  const found = new Set();
  for (const skill of skills) {
    for (const alias of skill.aliases) {
      // Escape regex metacharacters except the skill alias's own symbols.
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\p{L}\\p{N}+.#])${escaped}([^\\p{L}\\p{N}+.#]|$)`, 'u');
      if (re.test(lower)) {
        found.add(skill.name);
        break;
      }
    }
  }
  return found;
}

// ---------- Main entry point ----------
export function matchResumeToJD(resumeText, jdText, skills) {
  const resumeSkills = extractSkills(resumeText, skills);
  const jdSkills = extractSkills(jdText, skills);

  // Skill overlap: what fraction of JD skills does the resume cover?
  let skillOverlap = 0;
  const matchedSkills = [];
  const missingSkills = [];
  if (jdSkills.size > 0) {
    for (const s of jdSkills) {
      if (resumeSkills.has(s)) matchedSkills.push(s);
      else missingSkills.push(s);
    }
    skillOverlap = matchedSkills.length / jdSkills.size;
  } else {
    // JD has no recognized skills — fall back to pure content similarity
    skillOverlap = null;
  }

  // Content similarity via TF-IDF cosine
  const resumeTokens = tokenize(resumeText);
  const jdTokens = tokenize(jdText);
  const tfR = termFreq(resumeTokens);
  const tfJ = termFreq(jdTokens);
  const idfMap = idf([tfR, tfJ]);
  const vR = tfidfVec(tfR, idfMap);
  const vJ = tfidfVec(tfJ, idfMap);
  const contentSim = cosineSim(vR, vJ);  // 0..1

  // Combined score — one decimal so even small improvements are visible
  let score;
  if (skillOverlap === null) {
    score = Math.round(contentSim * 1000) / 10;
  } else {
    score = Math.round((0.6 * skillOverlap + 0.4 * contentSim) * 1000) / 10;
  }

  // JD-only keywords (not skills, but distinctive terms JD uses heavily)
  const jdOnlyKeywords = [];
  const sortedJD = [...vJ.vec.entries()].sort((a, b) => b[1] - a[1]);
  for (const [term, weight] of sortedJD) {
    if (jdOnlyKeywords.length >= 8) break;
    if (tfR.has(term)) continue;
    if (term.length < 3) continue;
    jdOnlyKeywords.push({ term, weight: +weight.toFixed(2) });
  }

  // Suggestions
  const suggestions = buildSuggestions(matchedSkills, missingSkills, jdOnlyKeywords);

  return {
    score,
    skillOverlapPct: skillOverlap === null ? null : Math.round(skillOverlap * 100),
    contentSimPct: Math.round(contentSim * 100),
    matchedSkills: matchedSkills.sort(),
    missingSkills: missingSkills.sort(),
    jdOnlyKeywords,
    suggestions,
    stats: {
      resumeSkillCount: resumeSkills.size,
      jdSkillCount: jdSkills.size,
      resumeTokens: resumeTokens.length,
      jdTokens: jdTokens.length
    }
  };
}

function buildSuggestions(matched, missing, jdKeywords) {
  const out = [];
  if (missing.length > 0) {
    out.push({
      kind: 'missing-skills',
      title: `Add these skills to your resume if you have them: ${missing.slice(0, 8).join(', ')}`,
      detail: 'If you\'ve used these, work them into a bullet under the most relevant role. If you haven\'t, consider quickly up-skilling — even a small project counts.'
    });
  }
  if (matched.length > 0) {
    out.push({
      kind: 'emphasize',
      title: `Emphasize these matching skills near the top: ${matched.slice(0, 8).join(', ')}`,
      detail: 'Put the most-overlapping skills in your summary line or first bullet so recruiters see them immediately.'
    });
  }
  const topKw = jdKeywords.slice(0, 5).map(k => k.term);
  if (topKw.length > 0) {
    out.push({
      kind: 'language',
      title: `Mirror the JD's language: ${topKw.join(', ')}`,
      detail: 'ATS systems score against the JD\'s own phrasing. Use the same terms (where truthful) instead of synonyms.'
    });
  }
  return out;
}
