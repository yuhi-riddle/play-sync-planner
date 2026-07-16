"use client";

import { ImagePlus, Trash2, UserRound } from "lucide-react";
import React, { useActionState, useState } from "react";

import { Card } from "@/components/ui";
import { updateProfileAction } from "@/lib/actions/profile";
import {
  PROFILE_ACTION_INITIAL_STATE,
  type ProfileActionState
} from "@/lib/domain/profile";

type ProfileAction = (
  state: ProfileActionState,
  formData: FormData
) => Promise<ProfileActionState>;

export function ProfileSettingsCard({
  mode,
  initialNickname,
  currentAvatarUrl,
  hasCustomAvatar,
  nextPath = "/",
  action = updateProfileAction
}: {
  mode: "onboarding" | "settings";
  initialNickname: string;
  currentAvatarUrl: string | null;
  hasCustomAvatar: boolean;
  nextPath?: string;
  action?: ProfileAction;
}) {
  const [state, formAction, isPending] = useActionState(action, PROFILE_ACTION_INITIAL_STATE);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const isOnboarding = mode === "onboarding";
  const showCurrentAvatar = Boolean(currentAvatarUrl) && !removeAvatar;

  return (
    <Card id={isOnboarding ? undefined : "profile"} className="max-w-2xl scroll-mt-32">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-skywash text-pine">
          <UserRound aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-title text-ink">{isOnboarding ? "プロフィールを確認" : "プロフィール"}</h2>
          <p className="mt-1 text-caption text-muted">
            {isOnboarding
              ? "イベントで表示する名前を確認してください。"
              : "イベントやヘッダーに表示する情報を変更できます。"}
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-5">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="removeAvatar" value={removeAvatar ? "true" : "false"} />

        <div>
          <label htmlFor="profile-nickname" className="text-sm font-bold text-ink">
            ニックネーム <span className="text-clay-ink">必須</span>
          </label>
          <input
            id="profile-nickname"
            name="nickname"
            type="text"
            aria-label="ニックネーム"
            required
            maxLength={40}
            defaultValue={initialNickname}
            autoComplete="nickname"
            data-field-label="ニックネーム"
            className="mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-clay"
          />
          <p className="mt-1 text-caption text-muted">40文字以内で入力してください。</p>
        </div>

        <fieldset>
          <legend className="text-sm font-bold text-ink">プロフィール画像</legend>
          <p className="mt-1 text-caption text-muted">
            画像は任意です。Googleの画像をそのまま使うこともできます。
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sunken text-pine">
              {showCurrentAvatar ? (
                // External Google images and public Supabase objects are intentionally rendered as-is.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentAvatarUrl!}
                  alt="現在のプロフィール画像"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserRound aria-hidden="true" className="h-8 w-8" />
              )}
            </div>
            <div className="min-w-0 space-y-3">
              <label
                htmlFor="profile-avatar"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2"
              >
                <ImagePlus aria-hidden="true" className="h-4 w-4" />
                画像を選ぶ
              </label>
              <input
                id="profile-avatar"
                name="avatar"
                type="file"
                aria-label="プロフィール画像"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setSelectedFileName(event.currentTarget.files?.[0]?.name ?? null);
                  if (event.currentTarget.files?.length) setRemoveAvatar(false);
                }}
              />
              <p className="break-words text-caption text-muted">
                {selectedFileName ?? "JPEG・PNG・WebP、2MB以下"}
              </p>
              {hasCustomAvatar && !removeAvatar ? (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveAvatar(true);
                    setSelectedFileName(null);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-clay-ink underline decoration-clay/50 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  画像を削除
                </button>
              ) : null}
              {removeAvatar ? <p className="text-caption font-bold text-clay-ink">保存すると画像を削除します。</p> : null}
            </div>
          </div>
        </fieldset>

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "rounded-control border border-clay/30 bg-clay/10 p-3 text-sm text-clay-ink"
                : "rounded-control border border-moss/30 bg-mist p-3 text-sm text-pine"
            }
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? "保存中..." : isOnboarding ? "この内容で始める" : "プロフィールを保存"}
        </button>
      </form>
    </Card>
  );
}
