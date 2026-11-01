// Renders the "register" column: a name placed among its alphabetical
// neighbours in the company index. Used by the server (result page, homepage
// first paint) and by the homepage script as the visitor types, so both draw
// exactly the same markup.

export interface RegisterRow {
  key: string;
  name: string;
  number?: string;
}

export type RegisterState = 'pending' | 'available' | 'taken' | 'unknown';

// Row heights in px; the stylesheet in Register.astro uses the same values.
export const ROW_HEIGHT = 44;
export const YOU_HEIGHT = 76;
export const YOU_MARGIN = 8;

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const YOU_LABEL: Record<RegisterState, string> = {
  pending: 'Your name',
  available: 'Your name, free',
  taken: 'Your name, taken',
  unknown: 'Your name',
};

// Rows before the visitor's name, so the column can be centred on it.
export function rowsBefore(rows: RegisterRow[], key: string): number {
  return rows.filter((r) => r.key < key).length;
}

// Vertical offset that puts the middle of the visitor's row at `centre` px.
export function registerOffset(rows: RegisterRow[], key: string, centre: number): number {
  return Math.round(centre - (rowsBefore(rows, key) * ROW_HEIGHT + YOU_MARGIN + YOU_HEIGHT / 2));
}

export function renderRegister(rows: RegisterRow[], you: { name: string; key: string }, state: RegisterState): string {
  const sorted = [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const row = (r: RegisterRow) =>
    `<li class="reg__row${r.key === you.key ? ' reg__row--same' : ''}">` +
    `<span class="reg__key">${escape(r.key)}</span>` +
    `<span class="reg__name">${escape(r.name)}</span>` +
    (r.number ? `<span class="reg__num">${escape(r.number)}</span>` : '') +
    `</li>`;
  const youRow =
    `<li class="reg__row reg__row--you" data-state="${state}" aria-current="true">` +
    `<span class="reg__key">${escape(you.key || 'nothing left')}</span>` +
    `<span class="reg__name">${escape(you.name)}</span>` +
    `<span class="reg__label">${YOU_LABEL[state]}</span>` +
    `</li>`;
  const before = sorted.filter((r) => r.key < you.key);
  const after = sorted.filter((r) => r.key >= you.key);
  return [...before.map(row), youRow, ...after.map(row)].join('');
}

// Browser only: centre the visitor's row in the column's visible window,
// measured from the DOM so it holds at every column height.
export function centreRegister(figure: HTMLElement) {
  const win = figure.querySelector<HTMLElement>('.reg__window');
  const list = figure.querySelector<HTMLElement>('.reg__list');
  const you = figure.querySelector<HTMLElement>('.reg__row--you');
  if (!win || !list || !you) return;
  list.style.transform = `translateY(${Math.round(win.clientHeight / 2 - (you.offsetTop + you.offsetHeight / 2))}px)`;
}
