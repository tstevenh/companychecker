import { describe, expect, it } from 'vitest';
import { renderRegister, rowsBefore } from './register-view';

const rows = [
  { key: 'KETTLEBARN', name: 'KETTLE BARN LTD' },
  { key: 'KETTLEANDCO', name: 'KETTLE & CO LIMITED' },
  { key: 'KETTLEBAKERY', name: 'KETTLE BAKERY LIMITED', number: '01234567' },
];

describe('renderRegister', () => {
  it('places the name in alphabetical order, before same-name companies', () => {
    const html = renderRegister(rows, { name: 'The Kettle Bakery', key: 'KETTLEBAKERY' }, 'taken');
    const names = [...html.matchAll(/reg__name">([^<]*)</g)].map((m) => m[1]);
    expect(names).toEqual(['KETTLE &amp; CO LIMITED', 'The Kettle Bakery', 'KETTLE BAKERY LIMITED', 'KETTLE BARN LTD']);
    expect(html).toContain('reg__row--same');
    expect(rowsBefore(rows, 'KETTLEBAKERY')).toBe(1);
  });

  it('escapes names', () => {
    expect(renderRegister([], { name: '<b>x</b>', key: 'BX' }, 'pending')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
