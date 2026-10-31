// normalizeCompanyName(name): reduces a company name to the form Companies House
// compares when deciding whether two names are the "same as" each other.
//
// Implements Schedule 3 of The Company, Limited Liability Partnership and Business
// (Names and Trading Disclosures) Regulations 2015 (SI 2015/17), applied in the
// order the Schedule sets out:
//   https://www.legislation.gov.uk/uksi/2015/17/schedule/3
// Words in paragraph 3 come from Schedule 2; punctuation in paragraph 6 comes from
// regulation 2(2)(c) and Schedule 1, table 2.
//
// Two names are "the same" when their normalised forms are equal. This is a
// screening tool: Companies House makes the final decision when a name is filed.
//
// Shared by the monthly index builder and the site's Worker, so both always agree.

// Paragraph 2: accented characters and the letters they are treated as.
const ACCENT_GROUPS: [string, string][] = [
  ['ÀÁÂÃÄÅĀĂĄǺ', 'A'], ['àáâãäåāăąǻ', 'a'],
  ['ÆǼ', 'AE'],        ['æǽ', 'ae'],
  ['ÇĆĈĊČ', 'C'],      ['çćĉċč', 'c'],
  ['ÞĎĐ', 'D'],        ['þďđ', 'd'],
  ['ÈÉÊËĒĔĖĘĚ', 'E'],  ['èéêëēĕėęě', 'e'],
  ['ĜĞĠĢ', 'G'],       ['ĝğġģ', 'g'],
  ['ĤĦ', 'H'],         ['ĥħ', 'h'],
  ['ÌÍÎÏĨĪĬĮİ', 'I'],  ['ìíîïĩīĭįı', 'i'],
  ['Ĵ', 'J'],          ['ĵ', 'j'],
  ['Ķ', 'K'],          ['ķ', 'k'],
  ['ĹĻĽĿŁ', 'L'],      ['ĺļľŀł', 'l'],
  ['ÑŃŅŇŊ', 'N'],      ['ñńņňŋ', 'n'],
  ['ÒÓÔÕÖØŌŎŐǾ', 'O'], ['òóôõöøōŏőǿ', 'o'],
  ['Œ', 'OE'],         ['œ', 'oe'],
  ['ŔŖŘ', 'R'],        ['ŕŗř', 'r'],
  ['ŚŜŞŠ', 'S'],       ['śŝşš', 's'],
  ['ŢŤŦ', 'T'],        ['ţťŧ', 't'],
  ['ÙÚÛÜŨŪŬŮŰŲ', 'U'], ['ùúûüũūŭůűų', 'u'],
  ['ŴẀẂẄ', 'W'],       ['ŵẁẃẅ', 'w'],
  ['ỲÝŶŸ', 'Y'],       ['ỳýŷÿ', 'y'],
  ['ŹŻŽ', 'Z'],        ['źżž', 'z'],
];
const ACCENT_MAP = new Map<string, string>(
  ACCENT_GROUPS.flatMap(([chars, base]) => [...chars].map((c): [string, string] => [c, base])),
);

// Paragraph 3: Schedule 2 words disregarded at the end of the name.
// Abbreviations count "with or without full stops".
const SCHEDULE_2 = [
  'LIMITED', 'L\\.?T\\.?D\\.?', 'CYFYNGEDIG', 'C\\.?Y\\.?F\\.?', 'UNLIMITED', 'ANGHYFYNGEDIG',
  'PUBLIC LIMITED COMPANY', 'P\\.?L\\.?C\\.?',
  'CWMNI CYFYNGEDIG CYHOEDDUS', 'C\\.?C\\.?C\\.?',
  'COMMUNITY INTEREST COMPANY', 'C\\.?I\\.?C\\.?',
  'CWMNI BUDDIANT CYMUNEDOL', 'C\\.?B\\.?C\\.?',
  'COMMUNITY INTEREST PUBLIC LIMITED COMPANY', 'COMMUNITY INTEREST P\\.?L\\.?C\\.?',
  'CWMNI BUDDIANT CYMUNEDOL CYHOEDDUS CYFYNGEDIG', 'CWMNI BUDDIANT CYMUNEDOL C\\.?C\\.?C\\.?',
  'RIGHT TO ENFRANCHISEMENT', 'R\\.?T\\.?E\\.?', 'HAWL I RYDDFREINIAD',
  'RIGHT TO MANAGE', 'R\\.?T\\.?M\\.?', 'CWMNI RTM CYFYNGEDIG',
  'EUROPEAN ECONOMIC INTEREST GROUPING', 'E\\.?E\\.?I\\.?G\\.?',
  'INVESTMENT COMPANY WITH VARIABLE CAPITAL', 'CWMNI BUDDSODDI A CHYFALAF NEWIDIOL',
  'LIMITED PARTNERSHIP', 'PARTNERIAETH CYFYNGEDIG',
  'LIMITED LIABILITY PARTNERSHIP', 'PARTNERIAETH ATEBOLRWYDD CYFYNGEDIG',
  'OPEN-ENDED INVESTMENT COMPANY', 'CWMNI BUDDSODDIAD PENAGORED',
  'CHARITABLE INCORPORATED ORGANISATION', 'SEFYDLIAD ELUSENNOL CORFFOREDIG',
  'INDUSTRIAL AND PROVIDENT SOCIETY', 'CO-OPERATIVE SOCIETY', 'COMMUNITY BENEFIT SOCIETY',
  'L\\.?P\\.?', 'P\\.?C\\.?', 'L\\.?L\\.?P\\.?', 'P\\.?A\\.?C\\.?', 'C\\.?I\\.?O\\.?', 'S\\.?E\\.?C\\.?',
];

// Paragraph 4: words, signs and symbols regarded as the same.
// [canonical form, alternatives as a regex alternation]
const EQUIVALENTS: [string, string][] = [
  ['AND', 'AND|&'],
  ['PLUS', 'PLUS|\\+'],
  ['0', '0|ZERO|O'],
  ['1', '1|ONE'],
  ['2', '2|TWO|TOO|TO'],
  ['3', '3|THREE'],
  ['4', '4|FOUR|FOR'],
  ['5', '5|FIVE'],
  ['6', '6|SIX'],
  ['7', '7|SEVEN'],
  ['8', '8|EIGHT'],
  ['9', '9|NINE'],
  ['POUND', '£|POUND'],
  ['EURO', '€|EURO'],
  ['DOLLAR', '\\$|DOLLAR'],
  ['YEN', '¥|YEN'],
  ['PERCENT', '%|PER CENTUM|PERCENTUM|PER CENT|PERCENT'],
  ['AT', '@|AT'],
];

// Paragraph 5: matters disregarded at the end, alone or in combination, when
// preceded by a space, a full stop or "@". Paragraph 5(3) adds bracketed forms.
const TRAILING_MATTERS = [
  '& CO', '& COMPANY', 'AND CO', 'AND COMPANY', 'BIZ', 'CO', 'CO UK', 'CO\\.UK', 'COM',
  'COMPANY', 'EU', 'GB', 'GREAT BRITAIN', 'NET', 'NI', 'NORTHERN IRELAND', 'ORG', 'ORG UK',
  'ORG\\.UK', 'UK', 'UNITED KINGDOM', 'WALES', '& CWMNI', "A['’‘`]R CWMNI", 'CWMNI', 'CYM',
  'CYMRU', 'DU', 'PF', 'PRYDAIN FAWR', 'Y DEYRNAS UNEDIG',
];

// Paragraph 6: punctuation and * = # disregarded anywhere. En and em dashes are not
// permitted characters; they are treated as hyphens for user input.
const DISREGARDED_CHARS = new Set([...'.,:;-–—\'’‘`()[]{}<>!«»“”"?\\/*=#']);

// Lists are joined into single patterns. Matching is anchored at the end and the
// regex engine picks the leftmost start, which is the longest suffix.
const SCHEDULE_2_RE = new RegExp(`\\s(?:${SCHEDULE_2.join('|')})\\s*$`);
const MATTERS = TRAILING_MATTERS.join('|');
const MATTERS_RE = new RegExp(`([ .@])(?:(?:${MATTERS})|[(\\[{<](?:${MATTERS})[)\\]}>])\\s*$`);
const EQUIVALENTS_ANY_RE = new RegExp(`(^| )(?:${EQUIVALENTS.map(([, alt]) => alt).join('|')})(?= )`);
const EQUIVALENT_RES = EQUIVALENTS.map(
  ([canonical, alt]) => [canonical, new RegExp(`(^| )(?:${alt})(?= )`, 'g')] as const,
);

export function normalizeCompanyName(raw: string): string {
  // Paragraph 2
  let s = /[^\x01-\x7F]/.test(raw) ? [...raw].map((c) => ACCENT_MAP.get(c) ?? c).join('') : raw;
  s = s.toUpperCase().replace(/\s+/g, ' ').trim();

  // Paragraph 3: drop the longest Schedule 2 word found at the end (once).
  s = s.replace(SCHEDULE_2_RE, '').trim();

  // Paragraph 4: a match counts when surrounded by spaces, or at the start and
  // followed by a space.
  if (EQUIVALENTS_ANY_RE.test(s)) {
    for (const [canonical, re] of EQUIVALENT_RES) {
      s = s.replace(re, (_match, before: string) => before + canonical);
    }
  }

  // Paragraph 5: strip trailing matters (and combinations), longest first. The
  // preceding space, full stop or "@" is kept: only the matter is disregarded.
  // After a removal, trimming spaces and full stops (disregarded anyway in
  // paragraph 6) lets the next pass see a combination such as "UK.COM". A name
  // that already ends in a full stop ("ACME CO.") is left alone: read literally,
  // the matter is not at the end.
  while (MATTERS_RE.test(s)) {
    const next = s.replace(MATTERS_RE, '$1').replace(/[ .]+$/, '');
    if (next === s) break;
    s = next;
  }

  // Paragraph 6
  s = [...s].filter((c) => !DISREGARDED_CHARS.has(c)).join('').replace(/\s+/g, ' ').trim();

  // Paragraph 7: a final "S".
  if (s.endsWith('S')) s = s.slice(0, -1).trimEnd();

  // Paragraph 8: only the first 60 characters count (spaces included).
  s = [...s].slice(0, 60).join('').trimEnd();

  // Paragraph 9: "@", "THE " and "WWW" at the start, alone or combined.
  for (;;) {
    const next = s.replace(/^(?:@|THE |WWW)/, '').trimStart();
    if (next === s) break;
    s = next;
  }

  // Paragraph 10: spaces.
  return s.replaceAll(' ', '');
}
