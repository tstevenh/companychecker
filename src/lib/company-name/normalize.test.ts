import { describe, expect, it } from 'vitest';
import { normalizeCompanyName as normalize } from './normalize.ts';

function expectSame(a: string, b: string) {
  expect(normalize(a), `"${a}" vs "${b}"`).toBe(normalize(b));
}

function expectDifferent(a: string, b: string) {
  expect(normalize(a), `"${a}" vs "${b}"`).not.toBe(normalize(b));
}

describe('normalizeCompanyName: Schedule 3, SI 2015/17', () => {
  it('ignores case and spacing', () => {
    expectSame('Acme Widgets Ltd', 'ACME   WIDGETS LTD');
    expect(normalize('Acme Widgets Ltd')).toBe('ACMEWIDGET');
  });

  it('para 2: treats accented letters as their base letters', () => {
    expectSame('Café Nero Ltd', 'Cafe Nero Limited');
    expectSame('Ærø Design Ltd', 'Aero Design Ltd');
    expectSame('ŁÓDŹ TRADING LTD', 'Lodz Trading Ltd');
  });

  it('para 3: drops a Schedule 2 word at the end, with or without full stops', () => {
    expectSame('Acme Limited', 'Acme Ltd');
    expectSame('Acme L.T.D.', 'Acme');
    expectSame('Acme PLC', 'Acme Public Limited Company');
    expectSame('Acme Cyfyngedig', 'Acme Cyf');
    expectSame('Acme LLP', 'Acme Limited Liability Partnership');
    expectSame('Acme Community Interest Company', 'Acme C.I.C.');
  });

  it('para 3: does not drop Schedule 2 words in the middle of a name', () => {
    expectDifferent('Limited Edition Prints Ltd', 'Edition Prints Ltd');
  });

  it('para 4: treats equivalent words and symbols as the same', () => {
    expectSame('Smith & Jones Ltd', 'Smith and Jones Ltd');
    expectSame('2 Cool Ltd', 'Two Cool Ltd');
    expectSame('Back 2 Basics Ltd', 'Back To Basics Ltd');
    expectSame('Fit 4 Life Ltd', 'Fit For Life Ltd');
    expectSame('£ Saver Ltd', 'Pound Saver Ltd');
    expectSame('100 % Pure Ltd', '100 Per Cent Pure Ltd');
  });

  it('para 4: only matches whole words', () => {
    expectDifferent('Tooting Bakery Ltd', 'Too Bakery Ltd');
    expectDifferent('Fortune Homes Ltd', '4tune Homes Ltd');
  });

  it('para 5: drops trailing CO, UK, .COM and similar, including combinations and brackets', () => {
    expectSame('Acme Company Limited', 'Acme Ltd');
    expectSame('Acme UK Ltd', 'Acme Ltd');
    expectSame('Acme (UK) Ltd', 'Acme Ltd');
    expectSame('Acme.com Ltd', 'Acme Ltd');
    expectSame('Acme.co.uk Limited', 'Acme Limited');
    expectSame('Acme UK.com Ltd', 'Acme Ltd');
    expectSame('Smith & Co Ltd', 'Smith Ltd');
    expectSame('Acme Great Britain Ltd', 'Acme GB Ltd');
    expectSame("Acme A'r Cwmni Cyf", 'Acme Cyf');
  });

  it('para 5: needs a space, full stop or @ before the trailing word', () => {
    expectDifferent('Telco Ltd', 'Tel Ltd');
  });

  it('para 6: ignores punctuation and * = #', () => {
    expectSame('A.B.C. Services Ltd', 'ABC Services Ltd');
    expectSame("O'Brien's Bakery Ltd", 'OBriens Bakery Ltd');
    expectSame('Hi-Fi (Audio) Ltd', 'HiFi Audio Ltd');
    expectSame('Star*Light = Ltd', 'StarLight Ltd');
  });

  it('para 7: ignores a final S', () => {
    expectSame('Smith & Sons Ltd', 'Smith and Son Ltd');
    expectSame('Green Gardens Ltd', 'Green Garden Ltd');
  });

  it('para 8: compares only the first 60 characters', () => {
    const base = 'A'.repeat(60);
    expectSame(`${base} North Ltd`, `${base} South Ltd`);
  });

  it('para 9: ignores THE, WWW and @ at the start', () => {
    expectSame('The Bakery Ltd', 'Bakery Ltd');
    expectSame('www.bakery.com Ltd', 'Bakery Ltd');
    expectDifferent('Theatre Works Ltd', 'Atre Works Ltd');
  });

  it('keeps genuinely different names apart', () => {
    expectDifferent('Acme Trading Ltd', 'Acme Ltd');
    expectDifferent('North Star Ltd', 'South Star Ltd');
  });

  it('gives known results for sample names', () => {
    expect(normalize('Smith & Co Ltd')).toBe('SMITH');
    expect(normalize('www.bakery.com Ltd')).toBe('BAKERY');
    expect(normalize('100 % Pure Ltd')).toBe('100PERCENTPURE');
    expect(normalize('Hi-Fi (Audio) Ltd')).toBe('HIFIAUDIO');
    expect(normalize('2 Cool Ltd')).toBe('2COOL');
    expect(normalize('Telco Ltd')).toBe('TELCO');
  });
});
