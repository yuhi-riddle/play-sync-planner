import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authNav: vi.fn(),
  primaryNav: vi.fn(),
  mobileEventFab: vi.fn(),
  bottomNavSpacer: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  suspendUnreadNav: false,
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
vi.mock("@/components/layout/primary-nav-with-unread", () => ({
  PrimaryNavWithUnread: (props: unknown) => {
    mocks.primaryNav(props);
    if (mocks.suspendUnreadNav) {
      // 件数が返ってこない状態を再現する（Suspense の外なら画面全体の描画が止まる）
      throw new Promise(() => {});
    }
    return null;
  }
}));
vi.mock("@/components/layout/primary-nav", () => ({
  PrimaryNav: (props: { unreadCount?: number }) => (
    <nav data-mock="primary-nav-fallback" data-unread={props.unreadCount} />
  )
}));

type PrimaryNavProps = { isSignedIn: boolean; unreadCount: Promise<number | null> };

function primaryNavProps() {
  return mocks.primaryNav.mock.calls[0][0] as PrimaryNavProps;
}
vi.mock("@/components/layout/bottom-nav-spacer", () => ({
  BottomNavSpacer: (props: unknown) => {
    mocks.bottomNavSpacer(props);
    return <div data-mock="bottom-nav-spacer" />;
  }
}));
vi.mock("@/lib/supabase/notification-count", () => ({
  getUnreadNotificationCount: mocks.getUnreadNotificationCount
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
    mocks.getUnreadNotificationCount.mockResolvedValue(3);
    mocks.suspendUnreadNav = false;
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

  // 最低の高さを <main> に付けると、ログイン画面のように中身が少ない画面でカードの下が大きく空く。
  it("does not stretch <main> on short pages such as the login screen", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const document = new DOMParser().parseFromString(renderToStaticMarkup(layout), "text/html");

    const mainClasses = document.querySelector("main")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainClasses).not.toContain("min-h-[calc(100vh-10rem)]");
  });

  // フッターは常に画面の一番下。短い画面でも、読み込み中からの切り替えでもフッターが動かない。
  it("pins the footer to the bottom of the screen on short pages", async () => {
    vi.stubGlobal("React", React);
    const document = new DOMParser().parseFromString(renderToStaticMarkup(await RootLayout({ children: "本文" })), "text/html");

    const shellClasses = document.querySelector(".app-shell")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(shellClasses).toEqual(expect.arrayContaining(["flex", "min-h-screen", "flex-col"]));
    const main = document.querySelector("main");
    expect(main?.parentElement?.getAttribute("class")?.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-1", "flex-col"]));
    expect(main?.getAttribute("class")?.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-1", "flex-col"]));
  });

  // <main> は「本文へ移動」の着地点として tabIndex=-1 を持つ。クリックでもフォーカスが入るので、
  // 枠を出すと本文全体が赤い枠で囲まれて見える。
  it("does not outline <main> when it receives focus from a click or the skip link", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const document = new DOMParser().parseFromString(renderToStaticMarkup(layout), "text/html");

    const mainClasses = document.querySelector("main")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainClasses).toContain("focus:outline-none");
  });

  it("gets authentication once and shares the result with every signed-in navigation", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    renderToStaticMarkup(layout);

    const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.authNav).toHaveBeenCalledWith({ user });
    expect(mocks.getUnreadNotificationCount).toHaveBeenCalledWith("user-1");
    expect(primaryNavProps().isSignedIn).toBe(true);
    await expect(primaryNavProps().unreadCount).resolves.toBe(3);
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

  it("does not count notifications for signed-out visitors", async () => {
    vi.stubGlobal("React", React);
    mocks.getCurrentUser.mockResolvedValue(null);

    renderToStaticMarkup(await RootLayout({ children: "本文" }));

    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
    expect(primaryNavProps().isSignedIn).toBe(false);
    await expect(primaryNavProps().unreadCount).resolves.toBeNull();
  });

  // 件数をレイアウトで待つと、ヘッダーのプロフィール取得と並ばずに全ページの表示が1往復ぶん遅れる。
  it("does not wait for the unread count before rendering the page", async () => {
    vi.stubGlobal("React", React);
    mocks.getUnreadNotificationCount.mockReturnValue(new Promise(() => {}));

    const layout = await RootLayout({ children: "本文" });

    expect(renderToStaticMarkup(layout)).toContain("本文");
  });

  it("shows the navigation without a badge while the unread count is still loading", async () => {
    vi.stubGlobal("React", React);
    mocks.suspendUnreadNav = true;

    const markup = renderToStaticMarkup(await RootLayout({ children: "本文" }));

    expect(markup).toContain("本文");
    expect(markup).toContain('data-mock="primary-nav-fallback"');
    expect(markup).toContain('data-unread="0"');
  });

  it("still renders the navigation without a badge when the count query throws", async () => {
    vi.stubGlobal("React", React);
    mocks.getUnreadNotificationCount.mockRejectedValue(new Error("network"));

    renderToStaticMarkup(await RootLayout({ children: "本文" }));

    await expect(primaryNavProps().unreadCount).resolves.toBeNull();
  });
});
