import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShareLinkCard } from "@/components/share-link-card";

describe("ShareLinkCard", () => {
  it("shows a direct answer link for the organizer too", () => {
    render(<ShareLinkCard shareUrl="https://example.com/s/token/answer" />);

    expect(screen.getByRole("link", { name: "自分も回答する" })).toHaveAttribute(
      "href",
      "https://example.com/s/token/answer"
    );
  });
});
