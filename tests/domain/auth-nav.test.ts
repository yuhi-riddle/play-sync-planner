import { describe, expect, it } from "vitest";

import { getAuthNavState } from "@/lib/domain/auth-nav";

describe("getAuthNavState", () => {
  it("shows a login link when the user is signed out", () => {
    expect(getAuthNavState(null)).toEqual({
      isSignedIn: false,
      displayEmail: null,
      primaryLabel: "ログイン",
      primaryHref: "/login"
    });
  });

  it("shows account actions when the user is signed in", () => {
    expect(getAuthNavState("user@example.com")).toEqual({
      isSignedIn: true,
      displayEmail: "user@example.com",
      primaryLabel: "設定",
      primaryHref: "/settings"
    });
  });
});
