import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authNav: vi.fn(),
  primaryNav: vi.fn(),
  mobileEventFab: vi.fn(),
  bottomNavSpacer: vi.fn(),
  getCurrentUser: vi.fn(),
  hasSupabaseEnv: vi.fn()
}));

vi.mock("@/components/layout/auth-nav", () => ({
  AuthNav: (props: unknown) => {
    mocks.authNav(props);
    return <div>認証ナビ</div>;
  }
}));
vi.mock("@/components/layout/mobile-event-fab", () => ({
  MobileEventFab: (props: unknown) => {
    mocks.mobileEventFab(props);
    return null;
  }
}));
vi.mock("@/components/layout/primary-nav", () => ({
  PrimaryNav: (props: unknown) => {
    mocks.primaryNav(props);
    return null;
  }
}));
vi.mock("@/components/layout/bottom-nav-spacer", () => ({
  BottomNavSpacer: (props: unknown) => {
    mocks.bottomNavSpacer(props);
    return <div data-mock="bottom-nav-spacer" />;
  }
}));
vi.mock("@/components/ui/web-vitals-reporter", () => ({
  WebVitalsReporter: () => null
}));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  hasSupabaseEnv: mocks.hasSupabaseEnv
}));

import RootLayout from "@/app/layout";

describe("RootLayout responsive header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com", user_metadata: {} });
  });

  it("keeps the brand and account controls on one row at every width", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const markup = renderToStaticMarkup(layout);
    const parsedDocument = new DOMParser().parseFromString(markup, "text/html");
    document.body.innerHTML = parsedDocument.body.innerHTML;

    const headerInner = document.querySelector("header > div");
    const classNames = headerInner?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classNames).toEqual(
      expect.arrayContaining(["flex", "flex-row", "items-center", "justify-between"])
    );
    expect(classNames).not.toContain("flex-col");
  });

  // self-startは縦積みレイアウト時代の名残。items-centerな1行構成の中では
  // align-selfがalign-itemsに勝ってロゴだけ行の上端に張り付いてしまう。
  it("does not pin the brand logo to the top of the row with a leftover self-start", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const markup = renderToStaticMarkup(layout);
    const parsedDocument = new DOMParser().parseFromString(markup, "text/html");
    document.body.innerHTML = parsedDocument.body.innerHTML;

    const brandLink = document.querySelector('header a[href="/"]');
    const classNames = brandLink?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classNames).not.toContain("self-start");
  });

  it("gives <main> a minimum height so the footer stays off-screen while the route Suspense boundary resolves", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const markup = renderToStaticMarkup(layout);
    const parsedDocument = new DOMParser().parseFromString(markup, "text/html");
    document.body.innerHTML = parsedDocument.body.innerHTML;

    const mainClasses = document.querySelector("main")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainClasses).toEqual(expect.arrayContaining(["min-h-[calc(100vh-10rem)]"]));
  });

  it("gets authentication once and shares the result with every signed-in navigation", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    renderToStaticMarkup(layout);

    const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.authNav).toHaveBeenCalledWith({ user });
    expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: true });
    expect(mocks.mobileEventFab).toHaveBeenCalledWith({ isSignedIn: true });
    expect(mocks.bottomNavSpacer).toHaveBeenCalledWith({ isSignedIn: true });
  });

  it("leaves the fixed-navigation clearance to BottomNavSpacer instead of padding every page", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const document = new DOMParser().parseFromString(renderToStaticMarkup(layout), "text/html");

    const mainWrapperClasses = document.querySelector("main")?.parentElement?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainWrapperClasses).toContain("pb-10");
    expect(mainWrapperClasses).not.toContain("pb-36");

    const footer = document.querySelector("footer");
    const footerClasses = footer?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(footerClasses).toContain("pb-8");
    expect(footerClasses).not.toContain("pb-36");
    expect(footer?.nextElementSibling?.getAttribute("data-mock")).toBe("bottom-nav-spacer");
  });
});
