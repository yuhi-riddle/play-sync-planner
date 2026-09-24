import React from "react";
import { render, screen, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/actions/account/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv: () => true
}));

import { AuthNav } from "@/components/layout/auth-nav";

describe("AuthNav profile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a single settings entry with the avatar and no bell or sign-out", async () => {
    vi.stubGlobal("React", React);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { nickname: "ゆうやん", avatar_path: "user-1/avatar.webp", onboarding_completed_at: "2026-07-15T00:00:00Z" },
        error: null
      })
    };
    const notificationQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 0 })
    };
    const user = { id: "user-1", email: "user@example.com", user_metadata: {} } as User;
    const from = vi.fn((table: string) => (table === "profiles" ? profileQuery : notificationQuery));
    createSupabaseServerClient.mockResolvedValue({ from });

    render(await AuthNav({ user }));

    const settingsLink = screen.getByRole("link", { name: "設定（ゆうやん）" });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(settingsLink).toHaveAttribute("title", "設定");
    expect(within(settingsLink).getByText("設定")).not.toHaveClass("hidden");
    const avatar = screen.getByRole("img", { name: "ゆうやんのプロフィール画像" });
    expect(avatar).toHaveAttribute(
      "src",
      "https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar.webp"
    );
    expect(avatar).toHaveClass("h-8", "w-8");
    expect(screen.queryByRole("link", { name: /通知/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログアウト" })).not.toBeInTheDocument();
    expect(from).not.toHaveBeenCalledWith("notifications");
  });

  it("shows the profile onboarding entry at mobile widths when setup is incomplete", async () => {
    vi.stubGlobal("React", React);
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { nickname: null, avatar_path: null, onboarding_completed_at: null },
        error: null
      })
    };
    const notificationQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 0 })
    };
    const user = { id: "user-1", email: "user@example.com", user_metadata: {} } as User;
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === "profiles" ? profileQuery : notificationQuery))
    });

    render(await AuthNav({ user }));

    const profileLink = screen.getByRole("link", { name: "プロフィールを設定" });
    expect(profileLink).toHaveAttribute("href", "/onboarding/profile");
    expect(screen.getByText("プロフィール設定")).not.toHaveClass("hidden");
    expect(profileLink.parentElement).toHaveClass(
      "flex",
      "w-full",
      "items-center",
      "justify-end",
      "gap-1",
      "sm:w-auto",
      "sm:gap-2"
    );
  });
});
