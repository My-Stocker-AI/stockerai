export const STRIPE_API_VERSION = "2025-08-27.basil" as const;
export const MINIMUM_BILLABLE_SEATS = 2;
export const MAXIMUM_BILLABLE_SEATS = 999;

const PRODUCTION_ORIGINS = new Set([
  "https://www.stocker-ai.com",
  "https://my-stocker-ai.com",
  "https://stockerai.pages.dev",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BillingMembership {
  accountId: string;
  role: string;
  canUploadRoutes: boolean;
}

export interface SubscriptionItemLike {
  quantity?: number | null;
  current_period_end?: number | null;
  price?: { id?: string | null; unit_amount?: number | null } | null;
}

export interface SubscriptionLike {
  id: string;
  status: string;
  items: { data: SubscriptionItemLike[] };
}

export function requirePrimaryAdministrator(membership: BillingMembership): void {
  if (membership.role !== "primary_admin") {
    throw new BillingContractError(403, "A primary administrator must manage billing.");
  }
}

export function parseRequestedSeatCount(value: unknown, minimum = MINIMUM_BILLABLE_SEATS): number {
  if (!Number.isInteger(value)) {
    throw new BillingContractError(400, "Driver count must be a whole number.");
  }
  const count = value as number;
  const effectiveMinimum = Math.max(MINIMUM_BILLABLE_SEATS, minimum);
  if (count < effectiveMinimum || count > MAXIMUM_BILLABLE_SEATS) {
    throw new BillingContractError(
      400,
      `Driver count must be between ${effectiveMinimum} and ${MAXIMUM_BILLABLE_SEATS}.`,
    );
  }
  return count;
}

export function parseOperationId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new BillingContractError(400, "A valid checkout operation ID is required.");
  }
  return value.toLowerCase();
}

export function checkoutIdempotencyKey(accountId: string, operationId: string): string {
  return `stockerai-checkout:${accountId}:${operationId}`;
}

export function customerIdempotencyKey(accountId: string): string {
  return `stockerai-customer:${accountId}`;
}

export function getRequestOrigin(requestOrigin: string | null, configuredOrigin?: string): string {
  const canonical = normalizeConfiguredOrigin(configuredOrigin);
  if (!requestOrigin) return canonical;

  let parsed: URL;
  try {
    parsed = new URL(requestOrigin);
  } catch {
    throw new BillingContractError(403, "This site is not allowed to start a billing session.");
  }

  const normalized = parsed.origin;
  const isPagesPreview =
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(".stockerai.pages.dev") &&
    parsed.hostname !== ".stockerai.pages.dev";
  if (!PRODUCTION_ORIGINS.has(normalized) && normalized !== canonical && !isPagesPreview) {
    throw new BillingContractError(403, "This site is not allowed to start a billing session.");
  }
  return normalized;
}

export function subscriptionSnapshot(subscription: SubscriptionLike, priceId: string) {
  const items = subscription.items.data.filter((item) => item.price?.id === priceId);
  if (items.length === 0) {
    throw new BillingContractError(
      409,
      "The subscription does not contain the configured StockerAI price.",
    );
  }
  const quantity = items.reduce((total, item) => total + Math.max(0, item.quantity ?? 0), 0);
  const periodEnds = items
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const periodEnd = periodEnds.length > 0 ? Math.min(...periodEnds) : null;
  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    quantity,
    periodEnd: periodEnd === null ? null : new Date(periodEnd * 1000).toISOString(),
  };
}

export function isSubscriptionBlockingCheckout(status: string): boolean {
  return !["canceled", "incomplete_expired"].includes(status);
}

function normalizeConfiguredOrigin(value?: string): string {
  if (!value) return "https://www.stocker-ai.com";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Billing application URL must use HTTPS.");
    }
    return parsed.origin;
  } catch {
    throw new BillingContractError(500, "Billing application URL is not configured correctly.");
  }
}

export class BillingContractError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BillingContractError";
  }
}
