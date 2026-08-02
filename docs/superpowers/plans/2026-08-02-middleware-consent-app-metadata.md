# middleware 同意チェックの app_metadata 移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** middleware の同意ゲートを `user_consents` テーブルの参照から `app_metadata` の印の参照に変え、全リクエストの往復を2回から1回に減らす。

**Architecture:** 同意の正本は今まで通り `public.user_consents` テーブルに残す。middleware が毎回引いていたのをやめ、代わりに Supabase Auth の `app_metadata` に置いた同意印（`legal_consent_accepted_at`）を見る。`app_metadata` は service role でしか書けないので、本人による偽装が効かない（`user_metadata` との決定的な違い）。同意を記録する2箇所（同意フォームのServer Action・ログインコールバック）で印も書き、既存ユーザーはマイグレーション026で一括バックフィルする。印が無いユーザーは従来通りテーブルを引くフォールバックを残すので、バックフィル漏れがあってもゲートは正しく機能する。

**Tech Stack:** Next.js middleware (Edge Runtime), Supabase Auth (`auth.admin.updateUserById`), PostgreSQL (`auth.users.raw_app_meta_data`), Vitest

## Global Constraints

- 同意の法的な記録は `public.user_consents` から**移さない**。`app_metadata` はゲート判定を速くするための印であって、記録の正本ではない
- 同意印は `app_metadata` に置く。`user_metadata` は本人が `auth.updateUser()` で書き換えられるため使わない
- 規約バージョンによる再同意判定は**導入しない**。現状の middleware は「同意レコードが存在するか」だけを見ており、この移行で挙動を変えない
- 認証チェックは `lib/supabase/server.ts` の `getCurrentUser()` / `getCurrentUserId()` 経由にする。生の `supabase.auth.getUser()` は使わない（`tests/no-raw-auth-getuser.test.ts` がガード。middleware.ts は Edge Runtime のため対象外で、既存の生呼び出しはそのまま）
- `.tsx` では `import React from "react";` を明示する（このプランでは新規 .tsx なし）
- テストは `tests/` 直下のみ。コロケーション不可
- マイグレーションは **026** から。025 は使用済み
- マイグレーションは冪等にする（何度実行しても同じ結果になること）

---

## File Structure

| ファイル | 責務 |
|---|---|
| `lib/domain/legal-consent.ts`（新規） | `app_metadata` に同意印があるかを判定する純粋関数。Edge Runtime から import するのでDB依存を持たせない |
| `lib/auth/legal-consent-mark.ts`（新規） | service role で `app_metadata` に同意印を書く。Node 側専用 |
| `middleware.ts`（変更 145-166行あたり） | 印があれば `user_consents` を引かずに通す |
| `lib/actions/legal.ts`（変更） | 同意フォーム送信時に印も書く |
| `app/auth/callback/route.ts`（変更） | ログイン時の同意記録でも印を書く |
| `supabase/migrations/026_legal_consent_app_metadata.sql`（新規） | 既存ユーザーの一括バックフィル |
| `tests/domain/legal-consent.test.ts`（新規） | 判定関数のテスト。`lib/domain/<name>.ts` は `tests/domain/<name>.test.ts` に対応させるのが既存31モジュールの慣習 |
| `tests/auth/legal-consent-mark.test.ts`（新規） | 書き込み関数のテスト。`tests/auth/` は新設（`lib/auth/` 用のテストディレクトリは未整備） |
| `tests/middleware-consent-onboarding.test.ts`（変更） | 印があるときテーブルを引かないことの検証を追加 |
| `tests/supabase/legal-consent-backfill.test.ts`（新規） | マイグレーションSQLの内容検証 |

---

### Task 1: 同意印の判定関数

**Files:**
- Create: `lib/domain/legal-consent.ts`
- Test: `tests/domain/legal-consent.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `LEGAL_CONSENT_METADATA_KEY: "legal_consent_accepted_at"`, `hasLegalConsentMark(appMetadata: unknown): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/legal-consent.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { hasLegalConsentMark, LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";

describe("hasLegalConsentMark", () => {
  it("app_metadataに同意日時の文字列があればtrueを返す", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: "2026-07-10T00:00:00.000Z" })).toBe(true);
  });

  it("キーが無ければfalseを返す", () => {
    expect(hasLegalConsentMark({ provider: "google" })).toBe(false);
  });

  it("空文字はまだ同意していない扱いにする", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: "" })).toBe(false);
  });

  it("文字列以外が入っていてもfalseを返す", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: 12345 })).toBe(false);
  });

  it("null や オブジェクト以外を渡してもクラッシュしない", () => {
    expect(hasLegalConsentMark(null)).toBe(false);
    expect(hasLegalConsentMark(undefined)).toBe(false);
    expect(hasLegalConsentMark("2026-07-10")).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/domain/legal-consent.test.ts`
Expected: FAIL（`Failed to resolve import "@/lib/domain/legal-consent"`）

- [ ] **Step 3: 最小の実装を書く**

`lib/domain/legal-consent.ts`:

```ts
export const LEGAL_CONSENT_METADATA_KEY = "legal_consent_accepted_at";

/**
 * 同意済みの印が app_metadata にあるか。
 * middleware が user_consents を引かずに同意ゲートを通すために使う。
 * app_metadata は service role でしか書けないので、本人が印を偽装できない。
 */
export function hasLegalConsentMark(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }

  const acceptedAt = (appMetadata as Record<string, unknown>)[LEGAL_CONSENT_METADATA_KEY];
  return typeof acceptedAt === "string" && acceptedAt.length > 0;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/domain/legal-consent.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add lib/domain/legal-consent.ts tests/domain/legal-consent.test.ts
git commit -m "feat: add the legal consent mark helper"
```

---

### Task 2: middleware が印を見てテーブル参照を省く

**Files:**
- Modify: `middleware.ts:144-170`
- Test: `tests/middleware-consent-onboarding.test.ts`

**Interfaces:**
- Consumes: `hasLegalConsentMark` from Task 1
- Produces: なし（middleware の内部変更）

- [ ] **Step 1: 失敗するテストを書く**

`tests/middleware-consent-onboarding.test.ts` の `supabaseClientForUser` は現状 `user_consents` と `profiles` 以外のテーブルで例外を投げる。この作りはそのまま使える。既存の `describe` ブロックの末尾に以下2件を追加する:

```ts
  it("app_metadataに同意印があればuser_consentsを引かずに通過する", async () => {
    const { client, from } = supabaseClientForUser({
      id: userId,
      user_metadata: { profile_onboarding_completed_at: "2026-07-01T00:00:00.000Z" },
      app_metadata: { legal_consent_accepted_at: "2026-07-10T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.headers.get("location")).toBeNull();
    expect(from).not.toHaveBeenCalledWith("user_consents");
  });

  it("app_metadataに印が無ければ従来通りuser_consentsを引いてゲートする", async () => {
    const { client, from } = supabaseClientForUser(
      { id: userId, user_metadata: {}, app_metadata: {} },
      { consent: { data: null, error: null } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(from).toHaveBeenCalledWith("user_consents");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/consent?next=");
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/middleware-consent-onboarding.test.ts`
Expected: 1件目が FAIL（`from` が `"user_consents"` で呼ばれてしまう）。2件目は現状の実装でも PASS する

- [ ] **Step 3: middleware を書き換える**

`middleware.ts` の import に追加:

```ts
import { hasLegalConsentMark } from "@/lib/domain/legal-consent";
```

144行目から166行目（`// 同意チェックとオンボーディングチェックは…` のコメントから同意リダイレクトの `}` まで）を、次で置き換える:

```ts
  // 同意チェックとオンボーディングチェックは互いに独立なので並列で発行する。
  // ただしオンボーディングチェックは本来スキップされる条件（対象パス自身/既にuser_metadataで完了済み）
  // があるため、先にそれを判定してから並列化する。無条件に並列化すると、
  // 引かなくてよいprofilesまで毎回引いてしまい逆効果になる。
  const needsProfileCheck =
    request.nextUrl.pathname !== "/onboarding/profile" &&
    typeof user.user_metadata?.profile_onboarding_completed_at !== "string";

  // 同意印が app_metadata にあれば user_consents は引かない。
  // 印はマイグレーション026でバックフィル済みだが、取りこぼしがあっても
  // ここでテーブルに落ちるので同意ゲート自体は壊れない。
  const needsConsentCheck = !hasLegalConsentMark(user.app_metadata);

  const [consentResult, profileResult] = await Promise.all([
    needsConsentCheck
      ? supabase.from("user_consents").select("user_id").eq("user_id", user.id).maybeSingle()
      : Promise.resolve(null),
    needsProfileCheck
      ? supabase.from("profiles").select("onboarding_completed_at").eq("user_id", user.id).maybeSingle()
      : Promise.resolve(null)
  ]);

  if (needsConsentCheck) {
    const consent = consentResult?.data;
    const consentError = consentResult?.error;
    if (!consentError && !consent) {
      const consentUrl = request.nextUrl.clone();
      consentUrl.pathname = "/consent";
      consentUrl.search = "";
      consentUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return applySecurityHeaders(NextResponse.redirect(consentUrl), cspHeaderName, csp);
    }
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/middleware-consent-onboarding.test.ts tests/middleware-withdrawn.test.ts`
Expected: PASS（既存4件 + 新規2件 + 退会テスト）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: `TypeScript: No errors found`

- [ ] **Step 6: コミット**

```bash
git add middleware.ts tests/middleware-consent-onboarding.test.ts
git commit -m "perf: skip the consent table lookup when app_metadata has the mark"
```

---

### Task 3: 同意フォームから印を書く

**Files:**
- Create: `lib/auth/legal-consent-mark.ts`
- Modify: `lib/actions/legal.ts:20-30`
- Test: `tests/auth/legal-consent-mark.test.ts`（新規。`tests/auth/` ディレクトリごと作る）

**Interfaces:**
- Consumes: `LEGAL_CONSENT_METADATA_KEY` from Task 1
- Produces: `markLegalConsentAccepted(userId: string, acceptedAt: string): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

Task 1 のテストとは別ファイルにする。`lib/domain/legal-consent.ts` は純粋関数、`lib/auth/legal-consent-mark.ts` は service role を叩く副作用ありの関数で、テストの前提（モックの有無）が違うため。

`tests/auth/legal-consent-mark.test.ts`（新規）:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient }));

import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
import { LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";

describe("markLegalConsentAccepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("service roleでapp_metadataに同意日時を書く", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await markLegalConsentAccepted("user-1", "2026-07-10T00:00:00.000Z");

    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      app_metadata: { [LEGAL_CONSENT_METADATA_KEY]: "2026-07-10T00:00:00.000Z" }
    });
  });

  it("更新に失敗したらエラーを投げる", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    await expect(markLegalConsentAccepted("user-1", "2026-07-10T00:00:00.000Z")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/auth/legal-consent-mark.test.ts`
Expected: FAIL（`Failed to resolve import "@/lib/auth/legal-consent-mark"`）

- [ ] **Step 3: 書き込み関数を実装する**

`lib/auth/legal-consent-mark.ts`:

```ts
import { LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 同意済みの印を app_metadata に書く。
 * 記録の正本は user_consents テーブルのままで、これは middleware を1往復で済ませるための印。
 * app_metadata に渡したキーはマージされるので、provider などSupabaseが持つ値は消えない。
 */
export async function markLegalConsentAccepted(userId: string, acceptedAt: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [LEGAL_CONSENT_METADATA_KEY]: acceptedAt }
  });

  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/auth/legal-consent-mark.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: 同意アクションから呼ぶ**

`lib/actions/legal.ts` の import に追加:

```ts
import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
```

20行目からの upsert 部分を次で置き換える:

```ts
  const supabase = await createSupabaseServerClient();
  const agreedAt = new Date().toISOString();
  const { error } = await supabase.from("user_consents").upsert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    agreed_at: agreedAt
  });

  if (error) {
    throw new Error(error.message);
  }

  // 正本を保存できたあとに印を書く。順序が逆だと、記録が無いのにゲートだけ通る状態が生まれる。
  await markLegalConsentAccepted(user.id, agreedAt);
```

- [ ] **Step 6: 全体テストが壊れていないか確認する**

`lib/actions/legal.ts` を直接テストしているファイルは現時点で存在しない（`grep -rln "acceptLegalDocumentsAction" tests/` の結果が空）。そのため既存テストは壊れないはずだが、念のため全体を回す。

Run: `npx vitest run 2>&1 | tail -5`
Expected: 全 PASS。もし落ちたら、そのテストが `createSupabaseAdminClient` をモックしていないことが原因。該当ファイルのモックに `createSupabaseAdminClient: vi.fn(() => ({ auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } } }))` を足して通す。テストの削除・スキップで通してはいけない

- [ ] **Step 7: コミット**

```bash
git add lib/auth/legal-consent-mark.ts lib/actions/legal.ts tests/
git commit -m "feat: write the consent mark to app_metadata on consent"
```

---

### Task 4: ログインコールバックからも印を書く

**Files:**
- Modify: `app/auth/callback/route.ts:30-40`
- Test: `tests/auth-callback-consent.test.ts`（新規。コールバックルートのテストは現時点で存在しない）

**Interfaces:**
- Consumes: `markLegalConsentAccepted` from Task 3
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/auth-callback-consent.test.ts`:

```ts
// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
const { createSupabaseServerClient, createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, createSupabaseAdminClient }));

import { GET } from "@/app/auth/callback/route";
import { PENDING_CONSENT_COOKIE, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

const userId = "33333333-3333-4333-8333-333333333333";

function cookieStoreWith(pendingConsent: string | undefined) {
  return {
    get: vi.fn((name: string) =>
      name === PENDING_CONSENT_COOKIE && pendingConsent ? { value: pendingConsent } : undefined
    ),
    delete: vi.fn()
  };
}

function serverClientMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { onboarding_completed_at: "2026-07-01T00:00:00.000Z" },
    error: null
  });
  const from = vi.fn((table: string) => {
    if (table === "user_consents") return { upsert };
    if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } })
      },
      from
    },
    upsert
  };
}

describe("auth callback: 同意記録", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("同意を記録したらapp_metadataにも印を書く", async () => {
    cookies.mockResolvedValue(cookieStoreWith(`${TERMS_VERSION}:${PRIVACY_VERSION}`));
    const { client, upsert } = serverClientMock();
    createSupabaseServerClient.mockResolvedValue(client);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    const response = await GET(new NextRequest("https://example.com/auth/callback?code=abc"));

    expect(upsert).toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        app_metadata: expect.objectContaining({ legal_consent_accepted_at: expect.any(String) })
      })
    );
    expect(response.status).toBe(307);
  });

  it("同意クッキーが無ければ印を書かず /consent へ送る", async () => {
    cookies.mockResolvedValue(cookieStoreWith(undefined));
    const { client } = serverClientMock();
    createSupabaseServerClient.mockResolvedValue(client);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    const response = await GET(new NextRequest("https://example.com/auth/callback?code=abc"));

    expect(updateUserById).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/consent");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/auth-callback-consent.test.ts`
Expected: 1件目が FAIL（`updateUserById` が呼ばれていない）。2件目は現状の実装でも PASS する

- [ ] **Step 3: （Step 2 の結果を確認してから次へ）**

1件目が期待通り失敗していることを目で見て確認する。エラーメッセージが `updateUserById` 未呼び出し以外（モックの組み立てミスなど）だった場合は、実装に進まずテスト側を直す

- [ ] **Step 4: コールバックを書き換える**

`app/auth/callback/route.ts` の import に追加:

```ts
import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
```

30行目からの同意記録部分を次で置き換える:

```ts
    if (user && pendingConsent === `${TERMS_VERSION}:${PRIVACY_VERSION}`) {
      const agreedAt = new Date().toISOString();
      const { error: consentError } = await supabase.from("user_consents").upsert({
        user_id: user.id,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        agreed_at: agreedAt
      });

      if (consentError) {
        return NextResponse.redirect(new URL("/consent", request.url));
      }

      // 正本を保存できたあとに印を書く。
      await markLegalConsentAccepted(user.id, agreedAt);
```

（以降の profiles 取得からの処理は変更しない）

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/auth-callback-consent.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 6: コミット**

```bash
git add app/auth/callback/route.ts tests/auth-callback-consent.test.ts
git commit -m "feat: write the consent mark from the login callback"
```

---

### Task 5: 既存ユーザーの一括バックフィル

**Files:**
- Create: `supabase/migrations/026_legal_consent_app_metadata.sql`
- Test: `tests/supabase/legal-consent-backfill.test.ts`

**Interfaces:**
- Consumes: `legal_consent_accepted_at` というキー名（Task 1 で決めたもの）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/supabase/legal-consent-backfill.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/026_legal_consent_app_metadata.sql");

describe("legal consent backfill migration", () => {
  it("user_consents の同意日時を auth.users の app_metadata へ移す", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("update auth.users");
    expect(migration).toContain("raw_app_meta_data");
    expect(migration).toContain("legal_consent_accepted_at");
    expect(migration).toContain("public.user_consents");
  });

  it("既に印がある行を上書きしない（再実行しても結果が変わらない）", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("? 'legal_consent_accepted_at'");
  });

  it("同意の正本であるテーブルを消さない", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("delete from public.user_consents");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/supabase/legal-consent-backfill.test.ts`
Expected: FAIL（`ENOENT: no such file or directory ... 026_legal_consent_app_metadata.sql`）

- [ ] **Step 3: マイグレーションを書く**

`supabase/migrations/026_legal_consent_app_metadata.sql`:

```sql
-- 既存ユーザーの同意印を app_metadata に移す。
-- middleware が user_consents を引かずに同意ゲートを通せるようにするための一度きりのバックフィル。
-- 同意の正本は public.user_consents のままで、このマイグレーションはテーブルを一切変更しない。
-- 既に印がある行には触れないので、何度実行しても結果は同じになる。
update auth.users as u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'legal_consent_accepted_at',
       to_char(uc.agreed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     )
from public.user_consents as uc
where u.id = uc.user_id
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'legal_consent_accepted_at');
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/supabase/legal-consent-backfill.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/026_legal_consent_app_metadata.sql tests/supabase/legal-consent-backfill.test.ts
git commit -m "feat: backfill the legal consent mark into app_metadata"
```

- [ ] **Step 6: マイグレーションの適用を依頼する**

REQUIRED SUB-SKILL: `verifying-db-migrations` を使ってユーザーに適用を依頼する。適用前に本番へ流すSQLと、適用後に流す検証クエリの両方を渡すこと。

適用後の検証クエリ:

```sql
-- 同意済みユーザーのうち、印が付いていない人数（0になるはず）
select count(*)
from public.user_consents uc
join auth.users u on u.id = uc.user_id
where not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'legal_consent_accepted_at');
```

**ユーザーが適用を完了したと回答するまで、次のタスクに進んではいけない。**

---

### Task 6: 全体確認

**Files:** なし（検証のみ）

- [ ] **Step 1: テスト全通しを確認する**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 全ファイル PASS（基準線は149ファイル/748テスト。このプランで4〜5件増える）

- [ ] **Step 2: 型チェックと lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: `TypeScript: No errors found` と `Errors: 0 | Warnings: 0`

- [ ] **Step 3: ビルド**

Run: `npm run build 2>&1 | tail -15`
Expected: ビルド成功

- [ ] **Step 4: 実ブラウザで同意導線を確認する**

以下をユーザーに依頼する（ログインが必要でこちらから触れない）:

1. 既存アカウントでログイン → `/events` に入れること（印がある状態で通過できる）
2. ブラウザの開発者ツール Network タブでページ遷移を数回行い、体感が遅くなっていないこと
3. 新規アカウントでログイン → 同意画面が出て、同意後に通過できること

- [ ] **Step 5: 最終レビュー**

REQUIRED SUB-SKILL: `superpowers:requesting-code-review` で全体差分（`git diff main...HEAD`）のレビューを行う。認証ゲートの変更なので、次の観点を明示的に渡すこと:

- 同意記録に失敗したのに印だけ書かれる経路が無いか
- 印が無いユーザーが従来通りゲートされるか
- `app_metadata` の他のキー（provider など）を壊していないか
- `user_metadata` に同意印を書いてしまっている箇所が無いか

---

## 想定リスクと打ち手

| リスク | 打ち手 |
|---|---|
| バックフィル漏れのユーザーがゲートを通れなくなる | 印が無ければ従来通りテーブルを引くフォールバックを残してある（Task 2）。最悪でも現状と同じ2往復に戻るだけ |
| `updateUserById` が `app_metadata` を上書きして provider が消える | Supabase は渡したキーだけをマージする。Task 6 Step 5 のレビュー観点に含めて確認する |
| 同意記録は成功したのに印の書き込みが失敗する | `markLegalConsentAccepted` はエラーを投げる。同意アクションはエラーで止まり、ユーザーは再送信できる。次回は upsert が冪等なので問題ない |
| 規約改訂時に再同意させたくなる | このプランではバージョン判定を入れていない。必要になったら印の値をバージョン文字列に変え、middleware で現行バージョンと比較する（別プラン） |
