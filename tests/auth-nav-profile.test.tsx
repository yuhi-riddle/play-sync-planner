import React from "react";
import { render, screen } from "@testing-library/react";
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

  it("shows the profile nickname and avatar in the header", async () => {
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
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } } }) },
      from: vi.fn((table: string) => (table === "profiles" ? profileQuery : notificationQuery))
    });

    render(await AuthNav());

    const profileLink = screen.getByRole("link", { name: "プロフィール設定を開く（ゆうやん）" });
    expect(profileLink).toHaveAttribute("href", "/settings");
    expect(profileLink).toHaveAttribute("title", "プロフィール設定を開く");
    expect(screen.getByText("ゆうやん")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ゆうやんのプロフィール画像" })).toHaveAttribute(
      "src",
      "https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar.webp"
    );
  });
});
