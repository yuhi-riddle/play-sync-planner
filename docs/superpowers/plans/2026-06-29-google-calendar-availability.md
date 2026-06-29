# Google Calendar Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in user connect Google Calendar and see their busy time while creating or editing Madoi candidate dates.

**Architecture:** Keep Supabase Google login as-is, and add a separate Google Calendar OAuth flow under `/api/google-calendar/*`. Store encrypted Calendar tokens in a new `calendar_integrations` table, expose only normalized busy ranges to the client, and keep candidate-date creation usable even when Calendar is disconnected or unavailable.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Auth/Postgres, Server Actions and Route Handlers, Tailwind CSS, Web Crypto/Node crypto, Vitest.

## Global Constraints

- Do not implement Google Calendar event insertion in this phase.
- Do not fetch or store Google Calendar event title, location, description, or attendee details.
- Use FreeBusy-style busy ranges only: `{ start: string; end: string }`.
- OAuth scope for Phase 2-A is `https://www.googleapis.com/auth/calendar.freebusy`.
- If that scope cannot be used in Google Cloud Console or OAuth verification, stop and ask the user before widening to a broader scope.
- Calendar connection must be optional. Users can still create candidate dates without it.
- Never return access tokens or refresh tokens to the client.
- Encrypt stored Google tokens with `CALENDAR_TOKEN_ENCRYPTION_KEY`.
- Do not run screenshot or Playwright visual checks unless the user explicitly asks.

---

## File Map

- Create `supabase/migrations/002_calendar_integrations.sql`: `calendar_integrations` table, index, trigger, RLS.
- Modify `.env.example`: add Google Calendar OAuth and token encryption variables.
- Create `lib/domain/calendar-availability.ts`: overlap and day-bucket logic.
- Create `tests/domain/calendar-availability.test.ts`: unit tests for overlap and day summaries.
- Create `lib/google-calendar/token-crypto.ts`: encrypt and decrypt token strings.
- Create `tests/google-calendar/token-crypto.test.ts`: token crypto tests.
- Create `lib/google-calendar/freebusy.ts`: normalize FreeBusy response and fetch busy ranges.
- Create `tests/google-calendar/freebusy.test.ts`: FreeBusy normalization tests.
- Create `lib/google-calendar/oauth.ts`: OAuth URL, code exchange, token refresh helpers.
- Create `app/api/google-calendar/connect/route.ts`: starts Calendar OAuth.
- Create `app/api/google-calendar/callback/route.ts`: validates state, exchanges code, saves integration.
- Create `app/api/google-calendar/disconnect/route.ts`: removes integration.
- Create `app/api/google-calendar/freebusy/route.ts`: returns busy ranges for a month.
- Create `components/calendar-connection-card.tsx`: settings-page connection card.
- Modify `app/settings/page.tsx`: render connection card and status messages.
- Create `components/calendar-availability-panel.tsx`: PlanForm busy-time display and conflict warning.
- Modify `components/plan-form.tsx`: fetch busy ranges by visible month and pass selected date/time to panel.
- Modify `app/events/[eventId]/plans/new/page.tsx`: pass Calendar availability props to `PlanForm`.
- Modify `app/plans/[planId]/edit/page.tsx`: pass Calendar availability props to `PlanForm`.
- Modify `app/privacy/page.tsx`: document Calendar data use.
- Create `docs/phase2-google-calendar-setup.md`: user setup guide.
- Modify `README.md`: link the Phase 2 setup guide.

---

### Task 1: Calendar Integration Schema and Env

**Files:**
- Create: `supabase/migrations/002_calendar_integrations.sql`
- Modify: `.env.example`

**Interfaces:**
- Produces table `public.calendar_integrations` with columns used by later tasks:
  - `user_id: uuid`
  - `provider: 'google'`
  - `calendar_id: text`
  - `account_email: text | null`
  - `encrypted_access_token: text | null`
  - `encrypted_refresh_token: text`
  - `token_expires_at: timestamptz | null`
  - `scope: text | null`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/002_calendar_integrations.sql`:

```sql
create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null default 'primary',
  account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_integrations_provider_check check (provider in ('google')),
  constraint calendar_integrations_user_provider_unique unique (user_id, provider)
);

create index calendar_integrations_user_id_idx on public.calendar_integrations(user_id);

create trigger calendar_integrations_set_updated_at
before update on public.calendar_integrations
for each row execute function public.set_updated_at();

alter table public.calendar_integrations enable row level security;

create policy "Users can manage their calendar integration"
on public.calendar_integrations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

- [ ] **Step 2: Add env keys**

Append to `.env.example`:

```text
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=
```

- [ ] **Step 3: Verify files are present**

Run:

```powershell
Test-Path supabase\migrations\002_calendar_integrations.sql
Select-String -Path .env.example -Pattern "GOOGLE_CALENDAR_CLIENT_ID"
```

Expected: first command prints `True`, second command prints the matching env line.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/002_calendar_integrations.sql .env.example
git commit -m "Add calendar integration schema"
```

---

### Task 2: Calendar Availability Domain Logic

**Files:**
- Create: `lib/domain/calendar-availability.ts`
- Test: `tests/domain/calendar-availability.test.ts`

**Interfaces:**
- Produces:

```ts
export type BusyRange = { start: string; end: string };
export function rangesOverlap(left: BusyRange, right: BusyRange): boolean;
export function hasBusyConflict(candidate: BusyRange, busyRanges: BusyRange[]): boolean;
export function busyCountByDate(busyRanges: BusyRange[]): Record<string, number>;
export function busyRangesForDate(busyRanges: BusyRange[], dateKey: string): BusyRange[];
```

- [ ] **Step 1: Write failing tests**

Create `tests/domain/calendar-availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  busyCountByDate,
  busyRangesForDate,
  hasBusyConflict,
  rangesOverlap
} from "@/lib/domain/calendar-availability";

const busy = [
  { start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" },
  { start: "2026-07-01T13:00:00+09:00", end: "2026-07-01T14:00:00+09:00" },
  { start: "2026-07-02T09:00:00+09:00", end: "2026-07-02T10:00:00+09:00" }
];

describe("calendar availability", () => {
  it("detects overlapping ranges", () => {
    expect(
      rangesOverlap(
        { start: "2026-07-01T10:30:00+09:00", end: "2026-07-01T11:30:00+09:00" },
        busy[0]
      )
    ).toBe(true);
  });

  it("does not treat touching endpoints as overlap", () => {
    expect(
      rangesOverlap(
        { start: "2026-07-01T11:00:00+09:00", end: "2026-07-01T12:00:00+09:00" },
        busy[0]
      )
    ).toBe(false);
  });

  it("detects whether a candidate conflicts with any busy range", () => {
    expect(
      hasBusyConflict(
        { start: "2026-07-01T12:30:00+09:00", end: "2026-07-01T13:30:00+09:00" },
        busy
      )
    ).toBe(true);
  });

  it("counts busy ranges by local date", () => {
    expect(busyCountByDate(busy)).toEqual({
      "2026-07-01": 2,
      "2026-07-02": 1
    });
  });

  it("filters busy ranges for a selected date", () => {
    expect(busyRangesForDate(busy, "2026-07-01")).toHaveLength(2);
    expect(busyRangesForDate(busy, "2026-07-03")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/domain/calendar-availability.test.ts
```

Expected: FAIL because `@/lib/domain/calendar-availability` does not exist.

- [ ] **Step 3: Implement domain logic**

Create `lib/domain/calendar-availability.ts`:

```ts
export type BusyRange = {
  start: string;
  end: string;
};

function toTime(value: string) {
  return new Date(value).getTime();
}

function toDateKey(value: string) {
  return value.slice(0, 10);
}

export function rangesOverlap(left: BusyRange, right: BusyRange): boolean {
  return toTime(left.start) < toTime(right.end) && toTime(right.start) < toTime(left.end);
}

export function hasBusyConflict(candidate: BusyRange, busyRanges: BusyRange[]): boolean {
  return busyRanges.some((busyRange) => rangesOverlap(candidate, busyRange));
}

export function busyCountByDate(busyRanges: BusyRange[]): Record<string, number> {
  return busyRanges.reduce<Record<string, number>>((result, busyRange) => {
    const key = toDateKey(busyRange.start);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

export function busyRangesForDate(busyRanges: BusyRange[], dateKey: string): BusyRange[] {
  return busyRanges.filter((busyRange) => toDateKey(busyRange.start) === dateKey);
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/domain/calendar-availability.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/domain/calendar-availability.ts tests/domain/calendar-availability.test.ts
git commit -m "Add calendar availability domain helpers"
```

---

### Task 3: Token Encryption

**Files:**
- Create: `lib/google-calendar/token-crypto.ts`
- Test: `tests/google-calendar/token-crypto.test.ts`

**Interfaces:**
- Produces:

```ts
export function encryptToken(plainText: string, keyBase64?: string): string;
export function decryptToken(encryptedValue: string, keyBase64?: string): string;
```

Encrypted value format: `ivBase64:cipherTextBase64`.

- [ ] **Step 1: Write failing tests**

Create `tests/google-calendar/token-crypto.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";

const key = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("token crypto", () => {
  it("decrypts an encrypted token", () => {
    const encrypted = encryptToken("secret-token", key);
    expect(decryptToken(encrypted, key)).toBe("secret-token");
  });

  it("uses a different iv for each encryption", () => {
    const first = encryptToken("secret-token", key);
    const second = encryptToken("secret-token", key);
    expect(first).not.toBe(second);
  });

  it("throws when the key is missing", () => {
    expect(() => encryptToken("secret-token", "")).toThrow("CALENDAR_TOKEN_ENCRYPTION_KEY is not set");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/google-calendar/token-crypto.test.ts
```

Expected: FAIL because `@/lib/google-calendar/token-crypto` does not exist.

- [ ] **Step 3: Implement token crypto**

Create `lib/google-calendar/token-crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(keyBase64 = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? "") {
  if (!keyBase64) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}

export function encryptToken(plainText: string, keyBase64?: string): string {
  const key = getKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${Buffer.concat([encrypted, authTag]).toString("base64")}`;
}

export function decryptToken(encryptedValue: string, keyBase64?: string): string {
  const key = getKey(keyBase64);
  const [ivBase64, payloadBase64] = encryptedValue.split(":");
  if (!ivBase64 || !payloadBase64) {
    throw new Error("Encrypted token format is invalid");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");
  const encrypted = payload.subarray(0, -16);
  const authTag = payload.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/google-calendar/token-crypto.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/google-calendar/token-crypto.ts tests/google-calendar/token-crypto.test.ts
git commit -m "Add calendar token encryption"
```

---

### Task 4: FreeBusy API Helpers

**Files:**
- Create: `lib/google-calendar/freebusy.ts`
- Test: `tests/google-calendar/freebusy.test.ts`

**Interfaces:**
- Consumes `BusyRange` from `lib/domain/calendar-availability.ts`.
- Produces:

```ts
export type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};
export function normalizeFreeBusyResponse(response: GoogleFreeBusyResponse, calendarId?: string): BusyRange[];
export function monthTimeRange(month: string): { timeMin: string; timeMax: string };
export async function fetchFreeBusy(input: {
  accessToken: string;
  calendarId?: string;
  month: string;
  fetchImpl?: typeof fetch;
}): Promise<BusyRange[]>;
```

- [ ] **Step 1: Write failing tests**

Create `tests/google-calendar/freebusy.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { fetchFreeBusy, monthTimeRange, normalizeFreeBusyResponse } from "@/lib/google-calendar/freebusy";

describe("freebusy helpers", () => {
  it("normalizes Google FreeBusy responses", () => {
    const result = normalizeFreeBusyResponse({
      calendars: {
        primary: {
          busy: [
            { start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
          ]
        }
      }
    });

    expect(result).toEqual([
      { start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
    ]);
  });

  it("returns an empty array for empty responses", () => {
    expect(normalizeFreeBusyResponse({ calendars: { primary: {} } })).toEqual([]);
  });

  it("builds an inclusive month query range", () => {
    expect(monthTimeRange("2026-07")).toEqual({
      timeMin: "2026-07-01T00:00:00.000Z",
      timeMax: "2026-08-01T00:00:00.000Z"
    });
  });

  it("posts a FreeBusy request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            busy: [{ start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }]
          }
        }
      })
    })) as unknown as typeof fetch;

    const result = await fetchFreeBusy({ accessToken: "access-token", month: "2026-07", fetchImpl });

    expect(result).toEqual([{ start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" })
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/google-calendar/freebusy.test.ts
```

Expected: FAIL because `@/lib/google-calendar/freebusy` does not exist.

- [ ] **Step 3: Implement FreeBusy helpers**

Create `lib/google-calendar/freebusy.ts`:

```ts
import type { BusyRange } from "@/lib/domain/calendar-availability";

export type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: BusyRange[] }>;
};

export function normalizeFreeBusyResponse(response: GoogleFreeBusyResponse, calendarId = "primary"): BusyRange[] {
  return response.calendars?.[calendarId]?.busy ?? [];
}

export function monthTimeRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("month must be YYYY-MM");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  return {
    timeMin: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    timeMax: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString()
  };
}

export async function fetchFreeBusy({
  accessToken,
  calendarId = "primary",
  month,
  fetchImpl = fetch
}: {
  accessToken: string;
  calendarId?: string;
  month: string;
  fetchImpl?: typeof fetch;
}): Promise<BusyRange[]> {
  const { timeMin, timeMax } = monthTimeRange(month);
  const response = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    })
  });

  if (!response.ok) {
    throw new Error("Google Calendarの予定を取得できませんでした");
  }

  return normalizeFreeBusyResponse((await response.json()) as GoogleFreeBusyResponse, calendarId);
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/google-calendar/freebusy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/google-calendar/freebusy.ts tests/google-calendar/freebusy.test.ts
git commit -m "Add Google Calendar freebusy helpers"
```

---

### Task 5: OAuth Helpers

**Files:**
- Create: `lib/google-calendar/oauth.ts`
- Test: `tests/google-calendar/oauth.test.ts`

**Interfaces:**
- Produces:

```ts
export const CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
export function buildGoogleCalendarAuthUrl(input: { state: string; redirectUri?: string }): string;
export async function exchangeGoogleCalendarCode(input: { code: string; fetchImpl?: typeof fetch }): Promise<GoogleTokenResponse>;
export async function refreshGoogleCalendarAccessToken(input: { refreshToken: string; fetchImpl?: typeof fetch }): Promise<GoogleTokenResponse>;
```

- [ ] **Step 1: Write failing tests**

Create `tests/google-calendar/oauth.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleCalendarAuthUrl,
  CALENDAR_FREEBUSY_SCOPE,
  exchangeGoogleCalendarCode,
  refreshGoogleCalendarAccessToken
} from "@/lib/google-calendar/oauth";

describe("google calendar oauth", () => {
  it("builds an OAuth URL with offline access and FreeBusy scope", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";

    const url = new URL(buildGoogleCalendarAuthUrl({ state: "state-1" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(CALENDAR_FREEBUSY_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("exchanges an auth code", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/google-calendar/callback";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: CALENDAR_FREEBUSY_SCOPE })
    })) as unknown as typeof fetch;

    const result = await exchangeGoogleCalendarCode({ code: "code-1", fetchImpl });

    expect(result.refresh_token).toBe("refresh");
    expect(fetchImpl).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }));
  });

  it("refreshes an access token", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new-access", expires_in: 3600, scope: CALENDAR_FREEBUSY_SCOPE })
    })) as unknown as typeof fetch;

    const result = await refreshGoogleCalendarAccessToken({ refreshToken: "refresh", fetchImpl });

    expect(result.access_token).toBe("new-access");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/google-calendar/oauth.test.ts
```

Expected: FAIL because `@/lib/google-calendar/oauth` does not exist.

- [ ] **Step 3: Implement OAuth helpers**

Create `lib/google-calendar/oauth.ts`:

```ts
export const CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function redirectUri(fallback?: string) {
  return fallback ?? requireEnv("GOOGLE_CALENDAR_REDIRECT_URI");
}

export function buildGoogleCalendarAuthUrl({
  state,
  redirectUri: explicitRedirectUri
}: {
  state: string;
  redirectUri?: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", requireEnv("GOOGLE_CALENDAR_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri(explicitRedirectUri));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_FREEBUSY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postToken(body: URLSearchParams, fetchImpl: typeof fetch): Promise<GoogleTokenResponse> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("Google Calendarの認可情報を取得できませんでした");
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeGoogleCalendarCode({
  code,
  fetchImpl = fetch
}: {
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code"
    }),
    fetchImpl
  );
}

export async function refreshGoogleCalendarAccessToken({
  refreshToken,
  fetchImpl = fetch
}: {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      grant_type: "refresh_token"
    }),
    fetchImpl
  );
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/google-calendar/oauth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/google-calendar/oauth.ts tests/google-calendar/oauth.test.ts
git commit -m "Add Google Calendar OAuth helpers"
```

---

### Task 6: Calendar OAuth Route Handlers

**Files:**
- Create: `app/api/google-calendar/connect/route.ts`
- Create: `app/api/google-calendar/callback/route.ts`
- Create: `app/api/google-calendar/disconnect/route.ts`
- Modify: `lib/supabase/server.ts`

**Interfaces:**
- Consumes `buildGoogleCalendarAuthUrl`, `exchangeGoogleCalendarCode`, `encryptToken`.
- Produces routes:
  - `GET /api/google-calendar/connect`
  - `GET /api/google-calendar/callback`
  - `POST /api/google-calendar/disconnect`
- Produces helper:

```ts
export async function getCurrentUser();
```

- [ ] **Step 1: Add current user helper**

Modify `lib/supabase/server.ts` by adding:

```ts
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}
```

- [ ] **Step 2: Create connect route**

Create `app/api/google-calendar/connect/route.ts`:

```ts
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar/oauth";
import { getCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("madoi_calendar_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });

  return NextResponse.redirect(buildGoogleCalendarAuthUrl({ state }));
}
```

- [ ] **Step 3: Create callback route**

Create `app/api/google-calendar/callback/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { encryptToken } from "@/lib/google-calendar/token-crypto";
import { exchangeGoogleCalendarCode } from "@/lib/google-calendar/oauth";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

function settingsUrl(request: NextRequest, status: string) {
  return new URL(`/settings?calendar=${status}`, request.url);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("madoi_calendar_oauth_state")?.value;
  cookieStore.delete("madoi_calendar_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(settingsUrl(request, "error"));
  }

  try {
    const token = await exchangeGoogleCalendarCode({ code });
    if (!token.refresh_token) {
      return NextResponse.redirect(settingsUrl(request, "error"));
    }

    const supabase = await createSupabaseServerClient();
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const { error } = await supabase.from("calendar_integrations").upsert(
      {
        user_id: user.id,
        provider: "google",
        calendar_id: "primary",
        account_email: user.email,
        encrypted_access_token: encryptToken(token.access_token),
        encrypted_refresh_token: encryptToken(token.refresh_token),
        token_expires_at: expiresAt,
        scope: token.scope
      },
      { onConflict: "user_id,provider" }
    );

    if (error) {
      return NextResponse.redirect(settingsUrl(request, "error"));
    }

    return NextResponse.redirect(settingsUrl(request, "connected"));
  } catch {
    return NextResponse.redirect(settingsUrl(request, "error"));
  }
}
```

- [ ] **Step 4: Create disconnect route**

Create `app/api/google-calendar/disconnect/route.ts`:

```ts
import { NextResponse } from "next/server";

import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("calendar_integrations").delete().eq("user_id", user.id).eq("provider", "google");

  return NextResponse.redirect(new URL("/settings?calendar=disconnected", request.url));
}
```

- [ ] **Step 5: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds. If TypeScript complains about cookie deletion in a route handler, switch to `const response = NextResponse.redirect(...); response.cookies.delete("madoi_calendar_oauth_state"); return response;`.

- [ ] **Step 6: Commit**

```powershell
git add lib/supabase/server.ts app/api/google-calendar/connect/route.ts app/api/google-calendar/callback/route.ts app/api/google-calendar/disconnect/route.ts
git commit -m "Add Google Calendar OAuth routes"
```

---

### Task 7: Settings Connection Card

**Files:**
- Create: `components/calendar-connection-card.tsx`
- Modify: `app/settings/page.tsx`
- Test: `tests/calendar-connection-card.test.tsx`

**Interfaces:**
- Produces component:

```ts
export function CalendarConnectionCard(props: {
  connected: boolean;
  accountEmail: string | null;
  updatedAt: string | null;
  status?: string;
}): JSX.Element;
```

- [ ] **Step 1: Write failing component tests**

Create `tests/calendar-connection-card.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarConnectionCard } from "@/components/calendar-connection-card";

describe("CalendarConnectionCard", () => {
  it("shows a connect link when disconnected", () => {
    render(<CalendarConnectionCard connected={false} accountEmail={null} updatedAt={null} />);

    expect(screen.getByText("未連携")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Calendarを連携" })).toHaveAttribute("href", "/api/google-calendar/connect");
  });

  it("shows connected account and disconnect button", () => {
    render(<CalendarConnectionCard connected accountEmail="me@example.com" updatedAt="2026-06-29T10:00:00+09:00" />);

    expect(screen.getByText("連携済み")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "連携を解除" })).toBeInTheDocument();
  });

  it("shows an error message", () => {
    render(<CalendarConnectionCard connected={false} accountEmail={null} updatedAt={null} status="error" />);

    expect(screen.getByText("Google Calendarと接続できませんでした。もう一度試してください。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/calendar-connection-card.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement component**

Create `components/calendar-connection-card.tsx`:

```tsx
import React from "react";
import { CalendarCheck, CalendarX } from "lucide-react";

import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export function CalendarConnectionCard({
  connected,
  accountEmail,
  updatedAt,
  status
}: {
  connected: boolean;
  accountEmail: string | null;
  updatedAt: string | null;
  status?: string;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {connected ? <CalendarCheck aria-hidden="true" className="h-5 w-5 text-pine" /> : <CalendarX aria-hidden="true" className="h-5 w-5 text-clay" />}
            <h2 className="text-lg font-bold text-ink">Google Calendar連携</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            候補日時を作るときに、自分のGoogle Calendar予定と重なっていないか確認できます。
          </p>
          {status === "error" ? (
            <p className="mt-3 rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
              Google Calendarと接続できませんでした。もう一度試してください。
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="text-ink/54">状態</dt>
              <dd className="font-bold text-ink">{connected ? "連携済み" : "未連携"}</dd>
            </div>
            {connected ? (
              <>
                <div>
                  <dt className="text-ink/54">アカウント</dt>
                  <dd className="font-bold text-ink">{accountEmail ?? "Google Calendar"}</dd>
                </div>
                <div>
                  <dt className="text-ink/54">最終更新</dt>
                  <dd className="font-bold text-ink">{formatDateTime(updatedAt)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        {connected ? (
          <form action="/api/google-calendar/disconnect" method="post">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              連携を解除
            </button>
          </form>
        ) : (
          <a
            href="/api/google-calendar/connect"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            Google Calendarを連携
          </a>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Wire settings page**

Modify `app/settings/page.tsx`:

```tsx
import { CalendarConnectionCard } from "@/components/calendar-connection-card";
```

Inside `SettingsPage`, accept search params:

```tsx
export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ calendar?: string }>;
}) {
  const query = (await searchParams) ?? {};
```

After fetching the user, fetch integration:

```tsx
  const { data: calendarIntegration } = await supabase
    .from("calendar_integrations")
    .select("account_email, updated_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
```

Render below the email card:

```tsx
      <CalendarConnectionCard
        connected={Boolean(calendarIntegration)}
        accountEmail={calendarIntegration?.account_email ?? null}
        updatedAt={calendarIntegration?.updated_at ?? null}
        status={query.calendar}
      />
```

- [ ] **Step 5: Run component test**

Run:

```powershell
npm.cmd test -- tests/calendar-connection-card.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add components/calendar-connection-card.tsx app/settings/page.tsx tests/calendar-connection-card.test.tsx
git commit -m "Add Google Calendar settings card"
```

---

### Task 8: FreeBusy Route

**Files:**
- Create: `app/api/google-calendar/freebusy/route.ts`

**Interfaces:**
- Consumes:
  - `decryptToken`
  - `refreshGoogleCalendarAccessToken`
  - `fetchFreeBusy`
- Produces:

```ts
type FreeBusyResponse =
  | { connected: true; busy: Array<{ start: string; end: string }> }
  | { connected: false; busy: [] };
```

- [ ] **Step 1: Create route handler**

Create `app/api/google-calendar/freebusy/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";
import { fetchFreeBusy } from "@/lib/google-calendar/freebusy";
import { refreshGoogleCalendarAccessToken } from "@/lib/google-calendar/oauth";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

function isExpired(value: string | null) {
  return !value || new Date(value).getTime() <= Date.now() + 60_000;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ connected: false, busy: [] });
  }

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\\d{4}-\\d{2}$/.test(month)) {
    return NextResponse.json({ connected: true, busy: [] }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: integration } = await supabase
    .from("calendar_integrations")
    .select("calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false, busy: [] });
  }

  try {
    let accessToken = integration.encrypted_access_token ? decryptToken(integration.encrypted_access_token) : "";

    if (!accessToken || isExpired(integration.token_expires_at)) {
      const refreshToken = decryptToken(integration.encrypted_refresh_token);
      const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken });
      accessToken = refreshed.access_token;
      await supabase
        .from("calendar_integrations")
        .update({
          encrypted_access_token: encryptToken(refreshed.access_token),
          token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
          scope: refreshed.scope
        })
        .eq("user_id", user.id)
        .eq("provider", "google");
    }

    const busy = await fetchFreeBusy({
      accessToken,
      calendarId: integration.calendar_id ?? "primary",
      month
    });

    return NextResponse.json({ connected: true, busy });
  } catch {
    return NextResponse.json({ connected: true, busy: [] }, { status: 502 });
  }
}
```

- [ ] **Step 2: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add app/api/google-calendar/freebusy/route.ts
git commit -m "Add Google Calendar freebusy route"
```

---

### Task 9: Calendar Availability Panel

**Files:**
- Create: `components/calendar-availability-panel.tsx`
- Test: `tests/calendar-availability-panel.test.tsx`

**Interfaces:**
- Consumes `BusyRange` and `hasBusyConflict`.
- Produces:

```ts
export function CalendarAvailabilityPanel(props: {
  connected: boolean;
  loading?: boolean;
  error?: boolean;
  selectedDate: string;
  candidateStart: string;
  candidateEnd: string;
  busyRanges: BusyRange[];
}): JSX.Element;
```

- [ ] **Step 1: Write failing component tests**

Create `tests/calendar-availability-panel.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarAvailabilityPanel } from "@/components/calendar-availability-panel";

const busyRanges = [
  { start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
];

describe("CalendarAvailabilityPanel", () => {
  it("links to settings when disconnected", () => {
    render(
      <CalendarAvailabilityPanel
        connected={false}
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T10:00"
        candidateEnd="2026-07-01T12:00"
        busyRanges={[]}
      />
    );

    expect(screen.getByRole("link", { name: "設定で連携する" })).toHaveAttribute("href", "/settings");
  });

  it("shows busy ranges", () => {
    render(
      <CalendarAvailabilityPanel
        connected
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T12:00"
        candidateEnd="2026-07-01T13:00"
        busyRanges={busyRanges}
      />
    );

    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });

  it("shows a conflict warning", () => {
    render(
      <CalendarAvailabilityPanel
        connected
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T10:30"
        candidateEnd="2026-07-01T11:30"
        busyRanges={busyRanges}
      />
    );

    expect(screen.getByText("Google Calendarの予定と重なっています。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/calendar-availability-panel.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement panel**

Create `components/calendar-availability-panel.tsx`:

```tsx
import React from "react";
import Link from "next/link";

import { hasBusyConflict, type BusyRange } from "@/lib/domain/calendar-availability";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function CalendarAvailabilityPanel({
  connected,
  loading = false,
  error = false,
  selectedDate,
  candidateStart,
  candidateEnd,
  busyRanges
}: {
  connected: boolean;
  loading?: boolean;
  error?: boolean;
  selectedDate: string;
  candidateStart: string;
  candidateEnd: string;
  busyRanges: BusyRange[];
}) {
  if (!connected) {
    return (
      <div className="rounded-lg border border-moss/20 bg-mist/24 p-4">
        <p className="text-sm leading-6 text-ink/68">
          Google Calendarを連携すると、自分の予定と重なる候補が分かります。
        </p>
        <Link href="/settings" className="mt-3 inline-flex text-sm font-bold text-pine underline underline-offset-4">
          設定で連携する
        </Link>
      </div>
    );
  }

  const conflict = hasBusyConflict(
    { start: candidateStart, end: candidateEnd },
    busyRanges
  );

  return (
    <div className="rounded-lg border border-white/75 bg-white/58 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-ink">Google Calendarの予定</h3>
        <p className="text-xs text-ink/50">{selectedDate}</p>
      </div>
      {loading ? <p className="mt-3 text-sm text-ink/60">予定を取得しています。</p> : null}
      {error ? <p className="mt-3 text-sm text-clay">Google Calendarの予定を取得できませんでした。</p> : null}
      {!loading && !error && busyRanges.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">この日の予定はありません。</p>
      ) : null}
      {!loading && !error && busyRanges.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {busyRanges.map((busyRange) => (
            <li key={`${busyRange.start}-${busyRange.end}`} className="rounded-lg border border-ink/8 bg-cream/72 px-3 py-2 text-sm font-bold text-ink">
              {formatTime(busyRange.start)} - {formatTime(busyRange.end)}
            </li>
          ))}
        </ul>
      ) : null}
      {conflict ? (
        <p className="mt-3 rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm font-bold text-ink" aria-live="polite">
          Google Calendarの予定と重なっています。
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/calendar-availability-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add components/calendar-availability-panel.tsx tests/calendar-availability-panel.test.tsx
git commit -m "Add calendar availability panel"
```

---

### Task 10: Wire PlanForm to FreeBusy

**Files:**
- Modify: `components/plan-form.tsx`
- Modify: `app/events/[eventId]/plans/new/page.tsx`
- Modify: `app/plans/[planId]/edit/page.tsx`
- Test: `tests/plan-form.test.tsx`

**Interfaces:**
- Consumes:
  - `CalendarAvailabilityPanel`
  - `busyCountByDate`
  - `busyRangesForDate`
- Extends `PlanForm` props:

```ts
calendarAvailability?: {
  enabled: boolean;
};
```

- [ ] **Step 1: Add tests for disconnected Calendar prompt**

Append to `tests/plan-form.test.tsx`:

```tsx
  it("shows a settings link when Google Calendar is not connected", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" calendarAvailability={{ enabled: false }} />);

    expect(screen.getByRole("link", { name: "設定で連携する" })).toHaveAttribute("href", "/settings");
  });
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- tests/plan-form.test.tsx
```

Expected: FAIL because `PlanForm` does not accept `calendarAvailability` or render the panel.

- [ ] **Step 3: Extend PlanForm imports and props**

In `components/plan-form.tsx`, add imports:

```ts
import { CalendarAvailabilityPanel } from "@/components/calendar-availability-panel";
import { busyCountByDate, busyRangesForDate, type BusyRange } from "@/lib/domain/calendar-availability";
```

Extend props:

```ts
  calendarAvailability
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
  eventCategory?: string | null;
  calendarAvailability?: { enabled: boolean };
}) {
```

- [ ] **Step 4: Add FreeBusy state**

Inside `PlanForm`, after existing state:

```ts
  const [busyRanges, setBusyRanges] = useState<BusyRange[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState(false);
  const visibleMonthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
  const calendarConnected = Boolean(calendarAvailability?.enabled);
  const busyCounts = useMemo(() => busyCountByDate(busyRanges), [busyRanges]);
  const selectedDayBusyRanges = useMemo(
    () => busyRangesForDate(busyRanges, candidateDate),
    [busyRanges, candidateDate]
  );
```

Add `useEffect` to React imports:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Then add:

```ts
  useEffect(() => {
    if (!calendarConnected) {
      setBusyRanges([]);
      return;
    }

    let cancelled = false;
    setBusyLoading(true);
    setBusyError(false);

    fetch(`/api/google-calendar/freebusy?month=${visibleMonthKey}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("freebusy failed");
        }
        return response.json() as Promise<{ connected: boolean; busy: BusyRange[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setBusyRanges(data.busy);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBusyError(true);
          setBusyRanges([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusyLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [calendarConnected, visibleMonthKey]);
```

- [ ] **Step 5: Mark busy days in CalendarPicker**

Extend `CalendarPicker` props:

```ts
  busyCounts = {}
}: {
  ...
  busyCounts?: Record<string, number>;
}) {
```

Inside each day button, after `{cell.day}`, add:

```tsx
              {busyCounts[cell.date] ? (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
              ) : null}
```

Pass `busyCounts={busyCounts}` to the candidate-date `CalendarPicker` only.

- [ ] **Step 6: Render CalendarAvailabilityPanel in candidate step**

In currentStep 0 after the candidate date `CalendarPicker`, add:

```tsx
          <CalendarAvailabilityPanel
            connected={calendarConnected}
            loading={busyLoading}
            error={busyError}
            selectedDate={candidateDate}
            candidateStart={selectedCandidateStart}
            candidateEnd={selectedCandidateEnd}
            busyRanges={selectedDayBusyRanges}
          />
```

- [ ] **Step 7: Pass availability from pages**

In `app/events/[eventId]/plans/new/page.tsx`, fetch integration after event fetch:

```ts
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: calendarIntegration } = user
    ? await supabase.from("calendar_integrations").select("id").eq("user_id", user.id).eq("provider", "google").maybeSingle()
    : { data: null };
```

Then pass:

```tsx
<PlanForm
  action={action}
  submitLabel="共有リンクを作成"
  eventCategory={event.category}
  calendarAvailability={{ enabled: Boolean(calendarIntegration) }}
/>
```

In `app/plans/[planId]/edit/page.tsx`, do the same user/integration fetch and pass `calendarAvailability`.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
npm.cmd test -- tests/plan-form.test.tsx tests/calendar-availability-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 10: Commit**

```powershell
git add components/plan-form.tsx app/events/[eventId]/plans/new/page.tsx app/plans/[planId]/edit/page.tsx tests/plan-form.test.tsx
git commit -m "Show calendar availability while planning"
```

---

### Task 11: Privacy and Setup Documentation

**Files:**
- Modify: `app/privacy/page.tsx`
- Create: `docs/phase2-google-calendar-setup.md`
- Modify: `README.md`

**Interfaces:**
- Produces a user-facing setup guide with exact Google Cloud and Supabase steps.

- [ ] **Step 1: Update privacy page**

In `app/privacy/page.tsx`, replace the Google user data section body with:

```ts
body: "Google ログインで取得する情報は、本人確認とアカウント表示のために使います。Google Calendar連携を有効にした場合は、候補日時作成時に予定の重なりを確認するため、空き時間確認に必要な予定時間帯を取得します。Phase 2-Aでは予定名、場所、説明は取得しません。連携用トークンは暗号化して保存し、連携解除時に削除します。"
```

- [ ] **Step 2: Create setup guide**

Create `docs/phase2-google-calendar-setup.md`:

```md
# Madoi Phase 2 Google Calendar セットアップ手順

この手順は、自分のGoogle Calendar予定を見ながら候補日時を作るための設定です。

## 1. Google Cloud ConsoleでOAuth Clientを開く

1. Google Cloud Consoleを開きます。
2. Phase 1で作った `play-sync-planner` プロジェクトを選びます。
3. `Google Auth Platform` を開きます。
4. `クライアント` を開きます。
5. Web application のOAuth Clientを開きます。

## 2. Redirect URIを追加する

`Authorized redirect URIs` に次を追加します。

```text
http://localhost:3000/api/google-calendar/callback
```

保存します。

## 3. OAuth同意画面にCalendarスコープを追加する

1. `Google Auth Platform > データアクセス` を開きます。
2. `スコープを追加または削除` を押します。
3. 次のスコープを追加します。

```text
https://www.googleapis.com/auth/calendar.freebusy
```

もしこのスコープが選べない場合は、作業を止めてCodexに画面やエラーを共有してください。

## 4. .env.local を更新する

`.env.local` に次を追加します。

```text
GOOGLE_CALENDAR_CLIENT_ID=Google CloudのClient ID
GOOGLE_CALENDAR_CLIENT_SECRET=Google CloudのClient secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=32バイトのbase64文字列
```

`CALENDAR_TOKEN_ENCRYPTION_KEY` はPowerShellで作れます。

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

表示された文字列を `CALENDAR_TOKEN_ENCRYPTION_KEY` に入れます。

## 5. Supabaseでマイグレーションを実行する

Supabase SQL Editorで次のファイルの中身を実行します。

```text
supabase/migrations/002_calendar_integrations.sql
```

## 6. 動作確認

1. アプリを起動します。

```powershell
npm.cmd run dev
```

2. `/settings` を開きます。
3. `Google Calendarを連携` を押します。
4. Googleの認可画面で許可します。
5. `/events/new` から予定を作ります。
6. 日程調整作成画面で、Google Calendarの予定時間帯が表示されることを確認します。
```

- [ ] **Step 3: Link guide from README**

In `README.md`, add to file structure:

```md
- `docs/phase2-google-calendar-setup.md`：Phase 2 Google Calendar セットアップ手順
```

- [ ] **Step 4: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add app/privacy/page.tsx docs/phase2-google-calendar-setup.md README.md
git commit -m "Document Google Calendar setup and privacy"
```

---

### Task 12: Final Verification

**Files:**
- No new files.

**Interfaces:**
- Verifies all Phase 2-A tasks together.

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted files.

- [ ] **Step 4: Push**

Run:

```powershell
git push origin main
```

Expected: push succeeds.

---

## Self-Review Notes

- Spec coverage: DB, OAuth, token encryption, FreeBusy, settings UI, PlanForm UI, privacy, setup docs, and verification are covered.
- Scope exclusions remain excluded: event insertion, all-day candidates, participant-wide automatic scheduling, reminders, and multiple calendar selection.
- Type consistency: `BusyRange`, `CalendarAvailabilityPanel`, `CalendarConnectionCard`, and `FreeBusyResponse` are named consistently across tasks.
- Screenshot and Playwright checks are not included because the user asked to run them only when explicitly requested.
