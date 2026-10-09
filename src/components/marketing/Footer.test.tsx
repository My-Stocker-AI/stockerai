// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";

describe("Footer", () => {
  it("uses the visually centered square logo inside a centered white tile", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const logo = screen.getByRole("img", { name: "Stocker AI" });
    expect(logo.getAttribute("src")).toBe("/stocker-ai-logo-square.jpg");
    expect(Array.from(logo.parentElement?.classList ?? [])).toEqual(
      expect.arrayContaining([
        "flex",
        "items-center",
        "justify-center",
        "overflow-hidden",
        "bg-white",
      ]),
    );
  });
});
