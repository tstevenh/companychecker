// Business name ideas from a few keywords, each checked against the company
// index. Word lists avoid endings the "same as" rules ignore (Co, UK, Company...)
// and words that usually need Companies House permission (Group, Holdings,
// British, National, Trust, Institute...), so ideas don't collapse into each
// other or need approval.

import { normalizeCompanyName } from './company-name/normalize.ts';
import type { IndexManifest } from './company-index/format.ts';
import { lookupName, type LoadText } from './company-index/lookup.ts';

const SUFFIXES = [
  'Studio', 'Works', 'Labs', 'Collective', 'Partners', 'Solutions', 'Ventures', 'Digital', 'Design',
  'Consulting', 'Hub', 'House', 'Forge', 'Craft', 'Lane', 'Point', 'Bridge', 'Field', 'Path', 'Nest',
  'Supply', 'Makers', 'Square', 'Yard', 'Atelier', 'Kitchen', 'Assist', 'Rise',
];
const PREFIXES = [
  'Bright', 'True', 'North', 'Clear', 'Bold', 'Prime', 'Blue', 'Green', 'Silver', 'Golden', 'Swift', 'Peak',
  'Oak', 'Urban', 'Kind', 'Next', 'Smart', 'Little', 'Grand', 'Copper', 'Maple', 'Harbour', 'Summit', 'Fern',
];

export const MAX_KEYWORDS = 3;
export const MAX_IDEAS = 30;

export interface NameIdea {
  name: string;
  key: string;
  available: boolean;
  takenBy?: string;
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function parseKeywords(input: string): string[] {
  return [...new Set(
    input
      .split(/[\s,]+/)
      .map((w) => w.replace(/[^\p{L}\p{N}&'-]/gu, ''))
      .filter((w) => w.length >= 2)
      .map(titleCase),
  )].slice(0, MAX_KEYWORDS);
}

// A deterministic spread of candidates: the same keywords give the same ideas,
// and a "more ideas" page number moves through the lists.
export function candidateNames(keywords: string[], page = 0): string[] {
  if (keywords.length === 0) return [];
  const [first, second] = keywords;
  const out: string[] = [];
  const rotate = <T,>(list: T[], by: number) => list.map((_, i) => list[(i + by) % list.length]);
  const suffixes = rotate(SUFFIXES, page * 7);
  const prefixes = rotate(PREFIXES, page * 5);
  if (second && page === 0) out.push(`${first} ${second}`, `${second} ${first}`, `${first}${second.toLowerCase()}`);
  for (let i = 0; out.length < MAX_IDEAS * 2 && i < Math.max(suffixes.length, prefixes.length); i++) {
    const keyword = keywords[i % keywords.length];
    if (i < suffixes.length) out.push(`${keyword} ${suffixes[i]}`);
    if (i < prefixes.length) out.push(`${prefixes[i]} ${keyword}`);
  }
  return out;
}

export async function nameIdeas(
  keywords: string[],
  manifest: IndexManifest,
  loadText: LoadText,
  page = 0,
): Promise<NameIdea[]> {
  const seen = new Set<string>();
  const ideas: NameIdea[] = [];
  for (const name of candidateNames(keywords, page)) {
    const key = normalizeCompanyName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const match = await lookupName(manifest, key, loadText);
    ideas.push({ name: `${name} Ltd`, key, available: match.exact.length === 0, takenBy: match.exact[0]?.name });
    if (ideas.length >= MAX_IDEAS) break;
  }
  return ideas.sort((a, b) => Number(b.available) - Number(a.available));
}
