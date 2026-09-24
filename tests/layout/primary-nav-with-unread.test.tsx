import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const primaryNav = vi.hoisted(() => vi.fn());

vi.mock("@/components/layout/primary-nav", () => ({
  PrimaryNav: (props: unknown) => {
    primaryNav(props);
    return null;
  }
}));

import { PrimaryNavWithUnread } from "@/components/layout/primary-nav-with-unread";

describe("PrimaryNavWithUnread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
  });

  it("waits for the unread count and hands it to the navigation", async () => {
    renderToStaticMarkup(await PrimaryNavWithUnread({ isSignedIn: true, unreadCount: Promise.resolve(3) }));

    expect(primaryNav).toHaveBeenCalledWith({ isSignedIn: true, unreadCount: 3 });
  });

  it("shows no badge when the count could not be read", async () => {
    renderToStaticMarkup(await PrimaryNavWithUnread({ isSignedIn: true, unreadCount: Promise.resolve(null) }));

    expect(primaryNav).toHaveBeenCalledWith({ isSignedIn: true, unreadCount: 0 });
  });
});
