const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error || '');

export const isConnectionError = (error: unknown) => {
  const message = messageOf(error).toLowerCase();
  return message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('offline');
};

export const uploadConnectionMessage = (error: unknown, online = navigator.onLine) => {
  if (!online || isConnectionError(error)) {
    return "Couldn't reach StockerAI. Check Wi-Fi or mobile data. The route was not uploaded; try again when you're connected.";
  }
  return "The route was not uploaded. Please try again. If it keeps failing, contact support with the time and route name.";
};

export const uploadResponseMessage = (status: number, detail?: string) => {
  if (status === 401 || status === 403) {
    return 'Your sign-in expired or does not allow this upload. Sign in again, then retry.';
  }
  if (status === 413) {
    return 'This PDF is too large. Export a smaller PDF and try again.';
  }
  if (status >= 500) {
    return "StockerAI couldn't process this PDF. The route was not added. Try again in a moment.";
  }
  return detail || 'The route was not uploaded. Check the PDF and selected vending system, then try again.';
};

export const pickingConnectionMessage =
  'Connection lost. Your last command may not have completed. Check the item still shown, reconnect, then try again.';
