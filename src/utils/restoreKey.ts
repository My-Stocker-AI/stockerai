/**
 * Blank-slot-safe key for matching a saved item across a refresh-restore.
 *
 * Mirrors the live Done-card dedup (useStockerSession): prefer the item's
 * sequence position (item_index), and fall back to slot ONLY when it's absent.
 * Without the sequence-first form, two different items that both have a blank
 * slot on the same machine collide — so a restored item could be wrongly
 * treated as already-completed after a page refresh.
 */
export function pickKey(it: {
  machineName?: string;
  item_index?: number | null;
  slot?: string | null;
  product?: string;
}): string {
  const pos = it.item_index != null ? 'i' + it.item_index : 's' + (it.slot || '');
  return `${it.machineName}:${pos}:${it.product}`;
}
