// reductionParts(name): splits a name into the parts Companies House compares and
// the parts it ignores, for showing the "same as" rules at work ("The Acme Company
// Ltd." with "The", "Company", "Ltd" and the full stop struck out).
//
// This is a display aid built on normalizeCompanyName, which stays the authority:
// a word is marked ignored when dropping it leaves the normalised name unchanged,
// and a character is marked ignored when it is disregarded punctuation.

import { normalizeCompanyName } from './normalize';

export interface ReductionPart {
  text: string;
  ignored: boolean;
}

// Paragraph 6 punctuation, kept in step with normalize.ts.
const IGNORED_CHARS = /[.,:;\-–—'’‘`()[\]{}<>!«»“”"?\\/*=#]/;

export function reductionParts(name: string): ReductionPart[] {
  const key = normalizeCompanyName(name);
  const tokens = name.split(/(\s+)/).filter((t) => t !== '');
  const words = tokens.map((text, i) => ({ text, i, space: /^\s+$/.test(text) })).filter((t) => !t.space);
  const dropped = new Set<number>();

  // Greedy, left to right: drop each word whose removal keeps the key the same.
  if (key) {
    for (const word of words) {
      const rest = words.filter((w) => w !== word && !dropped.has(w.i)).map((w) => w.text);
      if (rest.length && normalizeCompanyName(rest.join(' ')) === key) dropped.add(word.i);
    }
  }

  const parts: ReductionPart[] = [];
  const push = (text: string, ignored: boolean) => {
    const last = parts.at(-1);
    if (last && last.ignored === ignored) last.text += text;
    else parts.push({ text, ignored });
  };
  tokens.forEach((text, i) => {
    if (/^\s+$/.test(text)) push(' ', false);
    else if (dropped.has(i)) push(text, true);
    else for (const ch of text) push(ch, IGNORED_CHARS.test(ch));
  });
  return parts;
}
