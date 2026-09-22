// Never read arbitrary server exception text aloud (it can contain SQL or identifiers).
// Known state failures get actionable instructions; unknown outcomes require checking
// the saved route before another command, not automatically repeating a mutation.
export function toolFailureMessage(status?: number, detail?: unknown): string {
  if (status === 401) return 'Please sign in again to continue your route.';
  if (status === 403) return 'This action is not available on your account. Check your route access.';
  if (status === 409) return 'Your saved picking progress changed. Reload your route before continuing.';
  if (status === 429) return 'The service is busy. Please wait a moment before continuing.';
  if (status === 400 || status === 404) {
    switch (detail) {
      case 'Machine is already skipped':
        return 'This machine is still skipped. You can return to the unfinished work or pause for now.';
      case 'Machine is already completed':
      case 'Machine already completed. Nothing left to stock here.':
        return 'This machine is already finished. Check your route screen to select unfinished work.';
      case 'No active session found':
        return 'There is no active route. Open your routes and resume the one you want.';
      case 'No skipped machines found':
        return 'There are no skipped machines to return to.';
      case 'No machine selected yet. Say a route to start.':
      case 'Session has no current machine. Select a route first.':
        return 'Select a route and machine before continuing.';
      case 'No items found for machine':
        return 'This machine has no items available. Check the route screen before continuing.';
    }
  }
  return "I couldn't confirm that action. Check your saved route before trying again.";
}
