import { normalizeOrderNumber } from './order-number';

describe('normalizeOrderNumber', () => {
  it.each([
    ['№123456', '123456'],
    ['#123456', '123456'],
    ['# №123456', '123456'],
    ['No. 123456', '123456'],
    ['  IS-204 ', 'IS-204'],
    ['123456', '123456'],
  ])('%s -> %s', (input, out) => {
    expect(normalizeOrderNumber(input)).toBe(out);
  });
  it('leaves non-strings alone', () => {
    expect(normalizeOrderNumber(undefined)).toBeUndefined();
  });
});
