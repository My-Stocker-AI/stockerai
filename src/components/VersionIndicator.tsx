// Version indicator for debugging - shows build timestamp
// Remove or hide in production when stable

export function VersionIndicator() {
  // Format: "v Jan 1, 10:30 PM"
  const buildTime = new Date(__BUILD_TIME__);
  const formatted = buildTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div className="fixed bottom-2 right-2 text-xs text-gray-500 opacity-50 hover:opacity-100 transition-opacity z-50">
      v {formatted}
    </div>
  );
}
