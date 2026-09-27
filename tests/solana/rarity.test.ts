/**Tests for stamp rarity tiers decided by serial number.*/

import { STAMP_SUPPLY_PER_PLACE, isFoundOut, tierForSerial } from '../../src/solana/rarity';

describe('stamp rarity', () => {
  it.each([
    [1, 'Legendary'],
    [10, 'Legendary'],
    [11, 'Epic'],
    [100, 'Epic'],
    [101, 'Rare'],
    [400, 'Rare'],
    [401, 'Common'],
    [1000, 'Common'],
    [1001, 'Late Explorer'],
    [5000, 'Late Explorer'],
  ])('gives serial %i the %s tier', (serial, tier) => {
    expect(tierForSerial(serial)).toBe(tier);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the invalid serial %p', (serial) => {
    expect(() => tierForSerial(serial)).toThrow(RangeError);
  });

  it('treats a place as found out once its supply is used up', () => {
    expect(STAMP_SUPPLY_PER_PLACE).toBe(1000);
    expect(isFoundOut(999)).toBe(false);
    expect(isFoundOut(1000)).toBe(true);
    expect(isFoundOut(1001)).toBe(true);
  });
});
