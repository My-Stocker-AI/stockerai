const DIRECTION_ACTIONS = new Set(['machine_ready', 'next_machine']);

/** Expand compact package measurements before text is sent to any TTS provider. */
export function expandSpokenMeasurements(text: string): string {
  return text.replace(
    /(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi,
    (_match, amount: string) => `${amount} ${Number(amount) === 1 ? 'gram' : 'grams'}`,
  );
}

/** A machine handoff is actionable only when the picker hears the two valid choices. */
export function ensureDirectionChoice(action: string | undefined, text: string | undefined): string {
  const spoken = text?.trim() || '';
  if (!DIRECTION_ACTIONS.has(action || '') || /\btop\b[\s\S]*\bbottom\b|\bbottom\b[\s\S]*\btop\b/i.test(spoken)) {
    return spoken;
  }
  return `${spoken.replace(/[.!?]+$/, '')}. Say top or bottom.`;
}
