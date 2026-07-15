import { describe, expect, it } from "vitest";

import {
  MAX_AVATAR_BYTES,
  getGoogleProfileDefaults,
  getUserDisplayName,
  getProfileCallbackRedirect,
  getProfileAvatarUrl,
  getProfileOnboardingRedirect,
  isProfileSchemaUnavailable,
  profileInputSchema,
  validateAvatarFile
} from "@/lib/domain/profile";

describe("profile domain", () => {
  it("uses the saved nickname before provider metadata", () => {
    expect(
      getUserDisplayName({
        email: "fallback@example.com",
        user_metadata: { nickname: "  ゆうやん  ", full_name: "Googleの名前" }
      })
    ).toBe("ゆうやん");
  });

  it("uses the Google name and picture as profile defaults", () => {
    expect(
      getGoogleProfileDefaults({
        email: "fallback@example.com",
        user_metadata: { full_name: "  山田 太郎  ", avatar_url: "https://example.com/google.jpg" }
      })
    ).toEqual({ nickname: "山田 太郎", avatarUrl: "https://example.com/google.jpg" });
  });

  it("falls back to the email local part and Google picture alias", () => {
    expect(
      getGoogleProfileDefaults({
        email: "madoi-user@example.com",
        user_metadata: { picture: "https://example.com/picture.png" }
      })
    ).toEqual({ nickname: "madoi-user", avatarUrl: "https://example.com/picture.png" });
  });

  it("trims and validates a nickname", () => {
    expect(profileInputSchema.parse({ nickname: "  ゆうやん  ", removeAvatar: false })).toEqual({
      nickname: "ゆうやん",
      removeAvatar: false
    });
    expect(() => profileInputSchema.parse({ nickname: " ", removeAvatar: false })).toThrow();
    expect(() => profileInputSchema.parse({ nickname: "あ".repeat(41), removeAvatar: false })).toThrow();
  });

  it("accepts only JPEG, PNG, or WebP avatars up to 2MB", () => {
    expect(validateAvatarFile({ name: "avatar.webp", type: "image/webp", size: MAX_AVATAR_BYTES })).toBeNull();
    expect(validateAvatarFile({ name: "avatar.gif", type: "image/gif", size: 10 })).toBe(
      "プロフィール画像はJPEG、PNG、WebPのいずれかを選んでください。"
    );
    expect(validateAvatarFile({ name: "avatar.png", type: "image/png", size: MAX_AVATAR_BYTES + 1 })).toBe(
      "プロフィール画像は2MB以下にしてください。"
    );
  });

  it("uses a public custom avatar before the Google fallback", () => {
    expect(
      getProfileAvatarUrl("https://project.supabase.co", "user-id/avatar.webp", "https://example.com/google.jpg")
    ).toBe("https://project.supabase.co/storage/v1/object/public/profile-avatars/user-id/avatar.webp");
    expect(getProfileAvatarUrl("https://project.supabase.co", null, "https://example.com/google.jpg")).toBe(
      "https://example.com/google.jpg"
    );
  });

  it("redirects incomplete profiles without looping on onboarding", () => {
    expect(getProfileOnboardingRedirect("/events", "?tab=mine", null)).toBe(
      "/onboarding/profile?next=%2Fevents%3Ftab%3Dmine"
    );
    expect(getProfileOnboardingRedirect("/onboarding/profile", "", null)).toBeNull();
    expect(getProfileOnboardingRedirect("/events", "", "2026-07-15T00:00:00.000Z")).toBeNull();
  });

  it("keeps login usable until the profile migration is applied", () => {
    expect(getProfileCallbackRedirect("/events", null, { code: "PGRST205", message: "profiles missing" })).toBeNull();
    expect(getProfileCallbackRedirect("/events", "2026-07-15T00:00:00Z", null)).toBeNull();
  });

  it("recognizes only missing profiles migration errors as unavailable", () => {
    expect(isProfileSchemaUnavailable({ code: "42P01" })).toBe(true);
    expect(isProfileSchemaUnavailable({ code: "PGRST205", message: "Could not find public.profiles" })).toBe(true);
    expect(isProfileSchemaUnavailable({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
