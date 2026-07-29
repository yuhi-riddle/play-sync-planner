import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleMapsDirectionsLink } from "@/components/google-maps-directions-link";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";

describe("GoogleMapsDirectionsLink", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("builds directions without fixing the origin", () => {
    const value = buildGoogleMapsDirectionsUrl(" 渋谷駅 ");
    expect(value).not.toBeNull();
    const url = new URL(value!);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("渋谷駅");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(url.searchParams.has("origin")).toBe(false);
  });

  it("renders a safe external link only when a destination exists", () => {
    const { rerender } = render(<GoogleMapsDirectionsLink destination="新宿駅" />);
    const link = screen.getByRole("link", { name: "現在地からの経路を見る" });

    expect(link).toHaveAttribute("href", buildGoogleMapsDirectionsUrl("新宿駅"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    rerender(<GoogleMapsDirectionsLink destination="   " />);
    expect(screen.queryByRole("link", { name: "現在地からの経路を見る" })).not.toBeInTheDocument();
  });
});
