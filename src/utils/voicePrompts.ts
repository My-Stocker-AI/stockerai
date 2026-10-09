export function directionRetryPrompt(machineName?: string | null): string {
  const target = machineName?.trim() ? ` for ${machineName.trim()}` : '';
  return `No problem. When you're ready, say top or bottom${target}.`;
}
