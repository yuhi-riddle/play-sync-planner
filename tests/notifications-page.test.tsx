import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/actions/notifications", () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv: () => true
}));

import NotificationsPage from "@/app/notifications/page";

function makeNotification(id: string, readAt: string | null) {
  return {
    id,
    kind: "event_invitation",
    title: `通知${id}`,
    body: "本文",
    href: `/events/${id}`,
    read_at: readAt,
    created_at: "2026-07-15T00:00:00Z"
  };
}

function mockSupabaseWithRows(rows: Array<Record<string, unknown>>) {
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null })
    }))
  });
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  it("shows unread notification cards with a warn-toned unread badge", async () => {
    mockSupabaseWithRows([makeNotification("1", null)]);

    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));

    const card = screen.getByText("通知1").closest("article");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("bg-surface");

    const badge = screen.getByText("未読");
    expect(badge.className).toMatch(/border-clay\/40/);
  });

  it("shows read notification cards on a sunken surface with a neutral badge", async () => {
    mockSupabaseWithRows([makeNotification("2", "2026-07-16T00:00:00Z")]);

    render(await NotificationsPage({ searchParams: Promise.resolve({ status: "read" }) }));

    const card = screen.getByText("通知2").closest("article");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("bg-sunken");

    const badge = screen.getByText("既読");
    expect(badge.className).not.toMatch(/bg-clay\/12/);
    expect(badge.className).not.toMatch(/text-clay-ink/);
  });
});
