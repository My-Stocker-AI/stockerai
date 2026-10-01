export interface ConfirmedRouteUpload {
  route_id: string;
  assignment_confirmed: true;
}

export function requireConfirmedRouteUpload(value: unknown): ConfirmedRouteUpload {
  if (!value || typeof value !== 'object') {
    throw new Error('The upload response could not be verified. Refresh the route list before retrying.');
  }

  const result = value as Record<string, unknown>;
  if (typeof result.route_id !== 'string' || !result.route_id.trim() || result.assignment_confirmed !== true) {
    throw new Error('The route was uploaded, but its driver assignment could not be confirmed. Refresh the route list before retrying.');
  }

  return result as unknown as ConfirmedRouteUpload;
}
