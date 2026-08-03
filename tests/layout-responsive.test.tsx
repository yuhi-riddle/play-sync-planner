import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authNav: vi.fn(),
  primaryNav: vi.fn(),
  mobileEventFab: vi.fn(),
  getCurrentUser: vi.fn(),
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
vi.mock("@/components/web-vitals-reporter", () => ({
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
  });

  it("keeps body content and the footer clear of the fixed mobile navigation", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const document = new DOMParser().parseFromString(renderToStaticMarkup(layout), "text/html");

    const mainWrapperClasses = document.querySelector("main")?.parentElement?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainWrapperClasses).toEqual(expect.arrayContaining(["pb-36", "sm:pb-10"]));

    const footerClasses = document.querySelector("footer")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(footerClasses).toEqual(expect.arrayContaining(["pb-36", "sm:pb-8"]));
  });
});
