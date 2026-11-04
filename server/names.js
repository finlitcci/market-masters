// Display-name rules. A blocklist can never catch everything: the teacher can also remove a
// name from the lobby, and that is the real safety net.
const BLOCK_SUBSTRINGS = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'rapist', 'hitler', 'nazi', 'porn', 'asshole', 'bastard', 'retard', 'pussy', 'penis', 'vagina'];
const BLOCK_WORDS = ['dick', 'cock', 'sex', 'rape', 'ass', 'damn', 'tits', 'boob', 'boobs', 'kkk'];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export function nameKey(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]/g, '');
}

/** Returns { ok: true, name, key } or { ok: false, error } */
export function validateName(raw) {
  const name = cleanName(raw);
  if (!name) return { ok: false, error: 'Enter a display name.' };
  if (name.length < 2) return { ok: false, error: 'Names need at least 2 characters.' };
  if (name.length > 16) return { ok: false, error: 'Names can be at most 16 characters.' };
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return { ok: false, error: 'Use letters, numbers, spaces, and . _ \' - only.' };
  const key = nameKey(name);
  if (key.length < 2) return { ok: false, error: 'Pick a name with letters or numbers.' };
  const deleet = [...name.toLowerCase()].map((c) => LEET[c] ?? c).join('');
  const squashed = deleet.replace(/[^a-z]/g, '');
  const words = deleet.split(/[^a-z]+/).filter(Boolean);
  if (BLOCK_SUBSTRINGS.some((b) => squashed.includes(b)) || words.some((w) => BLOCK_WORDS.includes(w))) {
    return { ok: false, error: 'Please choose a different name.' };
  }
  return { ok: true, name, key };
}
