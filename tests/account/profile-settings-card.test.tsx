import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfileSettingsCard } from "@/components/account/profile-settings-card";

describe("ProfileSettingsCard", () => {
  it("shows Google profile defaults during onboarding and keeps the image optional", () => {
    render(
      <ProfileSettingsCard
        mode="onboarding"
        initialNickname="山田 太郎"
        currentAvatarUrl="https://example.com/google.jpg"
        hasCustomAvatar={false}
        nextPath="/events"
        action={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "プロフィールを確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("ニックネーム")).toHaveValue("山田 太郎");
    expect(screen.getByText("画像は任意です。Googleの画像をそのまま使うこともできます。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "現在のプロフィール画像" })).toHaveAttribute(
      "src",
      "https://example.com/google.jpg"
    );
    expect(screen.getByRole("button", { name: "この内容で始める" })).toBeInTheDocument();
  });

  it("accepts supported images and lets settings remove a custom avatar", () => {
    render(
      <ProfileSettingsCard
        mode="settings"
        initialNickname="ゆうやん"
        currentAvatarUrl="https://project.supabase.co/storage/avatar.png"
        hasCustomAvatar
        action={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "プロフィール" }).closest("section")).toHaveAttribute("id", "profile");
    expect(screen.getByLabelText("プロフィール画像")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    fireEvent.click(screen.getByRole("button", { name: "画像を削除" }));
    expect(screen.getByDisplayValue("true")).toHaveAttribute("name", "removeAvatar");
    expect(screen.getByText("保存すると画像を削除します。")).toBeInTheDocument();
  });
});
