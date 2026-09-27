/**Rarity tiers for passport stamps, decided by the order stamps are found.

Each place has a supply of 1000 numbered stamps. The serial alone decides the
tier, so there is no randomness to rig: the first finders get the rarest
stamps. Once a place is "found out", every later finder still gets a stamp,
tiered Late Explorer, because the reward is paid before the stamp is minted.
*/

/** Number of numbered stamps each place has before it is found out. */
export const STAMP_SUPPLY_PER_PLACE = 1000;

/** Tier names, rarest first. */
export type StampTier = 'Legendary' | 'Epic' | 'Rare' | 'Common' | 'Late Explorer';

/** Highest serial in each tier, rarest first. Serials above the last one are Late Explorer. */
export const RARITY_TIERS: ReadonlyArray<{ tier: StampTier; maxSerial: number }> = [
  { tier: 'Legendary', maxSerial: 10 },
  { tier: 'Epic', maxSerial: 100 },
  { tier: 'Rare', maxSerial: 400 },
  { tier: 'Common', maxSerial: STAMP_SUPPLY_PER_PLACE },
];

/** Pick the tier for a stamp's serial number.

Args:
    serial (number): The stamp's position among stamps for its place, from 1.

Returns:
    StampTier: The tier for that serial.

Raises:
    RangeError: If serial is not a positive whole number.
*/
export function tierForSerial(serial: number): StampTier {
  if (!Number.isInteger(serial) || serial < 1) {
    throw new RangeError(`stamp serial must be a positive whole number, got ${serial}`);
  }
  return RARITY_TIERS.find((entry) => serial <= entry.maxSerial)?.tier ?? 'Late Explorer';
}

/** Pick the tier for a stamp at a place, honoring a place's fixed tier.

Args:
    place ({ fixedTier?: StampTier }): The place. A place with a fixed tier
        gives that tier to every stamp, whatever its serial.
    serial (number): The stamp's position among stamps for its place, from 1.

Returns:
    StampTier: The place's fixed tier, or the tier for the serial.

Raises:
    RangeError: If serial is not a positive whole number.
*/
export function tierForPlace(place: { fixedTier?: StampTier }, serial: number): StampTier {
  const bySerial = tierForSerial(serial);
  return place.fixedTier ?? bySerial;
}

/** Check whether a string names a tier, such as a tier attribute read from chain.

Args:
    value (string | undefined): The value to check.

Returns:
    boolean: True if the value is one of the tier names.
*/
export function isStampTier(value: string | undefined): value is StampTier {
  return value === 'Late Explorer' || RARITY_TIERS.some((entry) => entry.tier === value);
}

/** Whether every numbered stamp for a place has already been found.

Args:
    stampsFound (number): Stamps already minted for the place.

Returns:
    boolean: True once the place's supply is used up.
*/
export function isFoundOut(stampsFound: number): boolean {
  return stampsFound >= STAMP_SUPPLY_PER_PLACE;
}
