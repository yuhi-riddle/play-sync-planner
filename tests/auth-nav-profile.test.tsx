import React from "react";
import { render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/actions/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv: () => true
}));

import { AuthNav } from "@/components/auth-nav";

describe("AuthNav profile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("separates the completed profile entry from general settings", async () => {
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
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === "profiles" ? profileQuery : notificationQuery))
    });

    render(await AuthNav({ user }));

    const profileLink = screen.getByRole("link", { name: "プロフィールを開く（ゆうやん）" });
    expect(profileLink).toHaveAttribute("href", "/settings#profile");
    expect(profileLink).toHaveAttribute("title", "プロフィールを開く");
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");
    expect(screen.getByText("ゆうやん")).toBeInTheDocument();
    expect(screen.getByText("ゆうやん")).not.toHaveClass("hidden");
    expect(screen.getByRole("img", { name: "ゆうやんのプロフィール画像" })).toHaveAttribute(
      "src",
      "https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar.webp"
    );
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
      "grid",
      "w-full",
      "grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)]",
      "sm:flex",
      "sm:w-auto"
    );
  });
});
