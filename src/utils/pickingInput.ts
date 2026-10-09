/** Unknown picking speech reaches the semantic service only when it is actually a question. */
export function isLikelyPickingQuestion(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(what|which|who|where|when|why|how|is|are|am|do|does|did|can|could|would|should|will)\b/.test(text);
}
