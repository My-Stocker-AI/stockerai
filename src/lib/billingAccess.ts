export interface BillingAccessState {
  is_platform_account?: boolean | null;
  subscription_status?: string | null;
}

export function hasOperationalBillingAccess(account: BillingAccessState | null | undefined): boolean {
  return account?.is_platform_account === true ||
    account?.subscription_status === "trialing" ||
    account?.subscription_status === "active";
}

export function requiresBillingSetup(account: BillingAccessState | null | undefined): boolean {
  return !hasOperationalBillingAccess(account);
}
