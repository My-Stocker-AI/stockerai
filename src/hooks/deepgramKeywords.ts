/** Build Deepgram Nova-2 keyword parameters using the documented repeated
 * `keywords=term:intensifier` form. Comma-joining terms makes Deepgram treat
 * the whole list as one literal keyword, so every term must be separate. */
export const DEEPGRAM_CRITICAL_COMMANDS = ['top', 'bottom', 'beginning', 'end', 'next'] as const;

export function buildDeepgramKeywordParams(
  critical: readonly string[],
  standard: readonly string[],
): string {
  const seen = new Set<string>();
  const append = (term: string, boost: number) => {
    const clean = term.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return '';
    seen.add(key);
    return `&keywords=${encodeURIComponent(`${clean}:${boost}`)}`;
  };
  return [
    ...critical.map(term => append(term, 3)),
    ...standard.map(term => append(term, 1.5)),
  ].join('');
}
