import { z } from "zod";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const PROFILE_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProfileRow = {
  user_id: string;
  nickname: string;
  avatar_path: string | null;
  onboarding_completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const PROFILE_ACTION_INITIAL_STATE: ProfileActionState = { status: "idle" };

export const profileInputSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, "ニックネームを入力してください。")
    .max(40, "ニックネームは40文字以内にしてください。"),
  removeAvatar: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean()
  )
});

type ProfileUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type AvatarFile = {
  name: string;
  type: string;
  size: number;
};

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  statusCode?: string | number | null;
};

function usableMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function usableHttpUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getGoogleProfileDefaults(user: ProfileUser) {
  const metadata = user.user_metadata ?? {};
  const nickname = getUserDisplayName(user, "Madoiユーザー");
  const avatarUrl = usableHttpUrl(
    usableMetadataString(metadata, "avatar_url") ?? usableMetadataString(metadata, "picture")
  );

  return { nickname: nickname || "Madoiユーザー", avatarUrl };
}

export function getUserDisplayName(user: ProfileUser, fallback = "参加者") {
  const metadata = user.user_metadata ?? {};
  return (
    usableMetadataString(metadata, "nickname") ??
    usableMetadataString(metadata, "full_name") ??
    usableMetadataString(metadata, "name") ??
    user.email?.split("@")[0]?.trim() ??
    fallback
  );
}

export function validateAvatarFile(file: AvatarFile): string | null {
  if (!PROFILE_AVATAR_MIME_TYPES.includes(file.type as (typeof PROFILE_AVATAR_MIME_TYPES)[number])) {
    return "プロフィール画像はJPEG、PNG、WebPのいずれかを選んでください。";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "プロフィール画像は2MB以下にしてください。";
  }

  return null;
}

export function getAvatarExtension(mimeType: string) {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
}

export function getProfileAvatarUrl(
  supabaseUrl: string | null | undefined,
  avatarPath: string | null | undefined,
  fallbackUrl: string | null | undefined
) {
  if (supabaseUrl && avatarPath) {
    const encodedPath = avatarPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${encodedPath}`;
  }

  return usableHttpUrl(fallbackUrl ?? null);
}

export function isProfileSchemaUnavailable(error: SupabaseErrorLike | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01") return true;

  const message = error.message?.toLowerCase() ?? "";
  return (error.code === "PGRST204" || error.code === "PGRST205") && message.includes("profile");
}

export function isProfileStorageUnavailable(error: SupabaseErrorLike | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return error.statusCode === 404 || error.statusCode === "404" || message.includes("bucket not found");
}

export function getProfileOnboardingRedirect(
  pathname: string,
  search: string,
  onboardingCompletedAt: string | null | undefined
) {
  if (onboardingCompletedAt || pathname === "/onboarding/profile") {
    return null;
  }

  const nextPath = `${pathname}${search}`;
  return `/onboarding/profile?next=${encodeURIComponent(nextPath)}`;
}

export function getProfileCallbackRedirect(
  nextPath: string,
  onboardingCompletedAt: string | null | undefined,
  error: SupabaseErrorLike | null | undefined
) {
  if (isProfileSchemaUnavailable(error)) {
    return null;
  }

  return getProfileOnboardingRedirect(nextPath, "", onboardingCompletedAt);
}
