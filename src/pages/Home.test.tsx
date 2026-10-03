// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home vendor-neutral PDF messaging", () => {
  it("explains format onboarding without presenting Stocker AI as Parlevel-only", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/vending system's route PDF export into flexible voice guidance/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Keep the Vending System You Already Use" }),
    ).toBeTruthy();
    expect(screen.getByText(/No switch to Parlevel/i)).toBeTruthy();
    expect(screen.queryByText(/We read Parlevel reports today/i)).toBeNull();
  });
});
