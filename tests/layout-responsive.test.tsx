import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authNav: vi.fn(),
  primaryNav: vi.fn(),
  mobileEventFab: vi.fn(),
  getUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  hasSupabaseEnv: vi.fn()
}));

vi.mock("@/components/auth-nav", () => ({
  AuthNav: (props: unknown) => {
    mocks.authNav(props);
    return <div>認証ナビ</div>;
  }
}));
vi.mock("@/components/mobile-event-fab", () => ({
  MobileEventFab: (props: unknown) => {
    mocks.mobileEventFab(props);
    return null;
  }
}));
vi.mock("@/components/primary-nav", () => ({
  PrimaryNav: (props: unknown) => {
    mocks.primaryNav(props);
    return null;
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  hasSupabaseEnv: mocks.hasSupabaseEnv
}));

import RootLayout from "@/app/layout";

describe("RootLayout responsive header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("stacks the brand and account controls on mobile and returns to one row on larger screens", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const markup = renderToStaticMarkup(layout);
    const parsedDocument = new DOMParser().parseFromString(markup, "text/html");
    document.body.innerHTML = parsedDocument.body.innerHTML;

    const headerInner = document.querySelector("header > div");
    const classNames = headerInner?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classNames).toEqual(
      expect.arrayContaining(["flex-col", "gap-3", "sm:flex-row", "sm:items-center", "sm:justify-between"])
    );
    expect(document.querySelector("main")?.parentElement).toHaveClass("pb-28", "sm:pb-10");
    expect(document.querySelector("footer")).toHaveClass("pb-28", "sm:pb-8");
  });

  it("gets authentication once and shares the result with every signed-in navigation", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    renderToStaticMarkup(layout);

    const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.authNav).toHaveBeenCalledWith({ user });
    expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: true });
    expect(mocks.mobileEventFab).toHaveBeenCalledWith({ isSignedIn: true });
  });
});
