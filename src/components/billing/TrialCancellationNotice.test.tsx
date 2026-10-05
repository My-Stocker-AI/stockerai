// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrialCancellationNotice } from "./TrialCancellationNotice";

afterEach(cleanup);

describe("TrialCancellationNotice", () => {
  it("shows the deadline and an explicit cancellation action to the primary administrator", () => {
    const onManageSubscription = vi.fn();

    render(
      <TrialCancellationNotice
        trialEndsAt="2026-10-12T12:00:00"
        cancelAtPeriodEnd={false}
        isPrimaryAdmin
        isOpeningPortal={false}
        onManageSubscription={onManageSubscription}
      />,
    );

    expect(screen.getByText(/cancel before october 12, 2026/i)).toBeTruthy();
    expect(screen.getByText(/then choose cancel subscription in stripe/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /manage subscription to cancel/i }));
    expect(onManageSubscription).toHaveBeenCalledOnce();
  });

  it("directs non-primary users to their primary administrator", () => {
    render(
      <TrialCancellationNotice
        trialEndsAt="2026-10-12T12:00:00"
        cancelAtPeriodEnd={false}
        isPrimaryAdmin={false}
        isOpeningPortal={false}
        onManageSubscription={vi.fn()}
      />,
    );

    expect(screen.getByText(/ask your company's primary administrator/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("confirms when cancellation is already scheduled", () => {
    render(
      <TrialCancellationNotice
        trialEndsAt="2026-10-12T12:00:00"
        cancelAtPeriodEnd
        isPrimaryAdmin
        isOpeningPortal={false}
        onManageSubscription={vi.fn()}
      />,
    );

    expect(screen.getByText(/trial cancellation scheduled/i)).toBeTruthy();
    expect(screen.getByText(/you will not be charged for the first paid term/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /review cancellation in stripe/i })).toBeTruthy();
  });
});
