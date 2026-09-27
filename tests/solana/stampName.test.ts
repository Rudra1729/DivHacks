/**Tests for on-chain stamp names that carry the serial.*/

import { stampName } from '../../src/solana/stamps';

describe('stamp names', () => {
  it('adds the serial after the place name', () => {
    expect(stampName('Apollo Theater', 37)).toBe('Apollo Theater #37');
  });

  it('shortens long place names so the name fits in 32 characters', () => {
    const name = stampName('Schomburg Center for Research in Black Culture', 1000);
    expect(name).toHaveLength(32);
    expect(name.endsWith(' #1000')).toBe(true);
  });

  it('drops a trailing space left by shortening', () => {
    expect(stampName('Abyssinian Baptist Church Harlem', 1000)).toBe('Abyssinian Baptist Church #1000');
  });
});
