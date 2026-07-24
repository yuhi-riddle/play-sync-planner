import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth-nav", () => ({ AuthNav: () => <div>認証ナビ</div> }));
vi.mock("@/components/mobile-event-fab", () => ({ MobileEventFab: () => null }));
vi.mock("@/components/primary-nav", () => ({ PrimaryNav: () => null }));

import RootLayout from "@/app/layout";

describe("RootLayout responsive header", () => {
  it("stacks the brand and account controls on mobile and returns to one row on larger screens", () => {
    vi.stubGlobal("React", React);
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<RootLayout>本文</RootLayout>), "text/html");

    const headerInner = document.querySelector("header > div");
    const classNames = headerInner?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classNames).toEqual(
      expect.arrayContaining(["flex-col", "gap-3", "sm:flex-row", "sm:items-center", "sm:justify-between"])
    );
  });

  it("keeps body content and the footer clear of the fixed mobile navigation", () => {
    vi.stubGlobal("React", React);
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<RootLayout>本文</RootLayout>), "text/html");

    const mainWrapperClasses = document.querySelector("main")?.parentElement?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainWrapperClasses).toEqual(expect.arrayContaining(["pb-28", "sm:pb-10"]));

    const footerClasses = document.querySelector("footer")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(footerClasses).toEqual(expect.arrayContaining(["pb-28", "sm:pb-8"]));
  });
});
