import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const authenticatedActionFiles = [
  "lib/actions/calendar.ts",
  "lib/actions/connections.ts",
  "lib/actions/event-members.ts",
  "lib/actions/event-messages.ts",
  "lib/actions/events.ts",
  "lib/actions/plans.ts",
  "lib/actions/profile.ts",
  "lib/actions/settlements.ts"
];

describe("security boundaries for actions and routes", () => {
  it("keeps the service-role client out of normal authenticated code", () => {
    for (const path of [
      ...authenticatedActionFiles,
      "app/api/events/[eventId]/availability/route.ts",
      "app/plans/[planId]/settlement/page.tsx",
      "lib/google-calendar/access-token.ts",
      "app/api/google-calendar/callback/route.ts",
      "app/api/google-calendar/disconnect/route.ts"
    ]) {
      expect(source(path), path).not.toContain("createSupabaseAdminClient");
    }
  });

  it("uses atomic RPCs for chat and direct user invitations", () => {
    const messages = source("lib/actions/event-messages.ts");
    expect(messages).toContain('.rpc("post_event_message"');
    expect(messages).not.toMatch(/from\("event_messages"\)[\s\S]*?\.insert\(/);

    const connections = source("lib/actions/connections.ts");
    expect(connections).toContain('.rpc("create_event_user_invitations"');
    expect(connections).toContain('.rpc("respond_event_user_invitation"');
    expect(connections).not.toMatch(/from\("event_user_invitations"\)[\s\S]*?\.(?:insert|update)\(/);
  });

  it("does not double-charge direct DML that database triggers already limit", () => {
    for (const path of [
      "lib/actions/connections.ts",
      "lib/actions/event-members.ts",
      "lib/actions/events.ts",
      "lib/actions/plans.ts",
      "lib/actions/profile.ts",
      "lib/actions/settlements.ts",
      "app/api/google-calendar/disconnect/route.ts"
    ]) {
      expect(source(path), path).not.toContain("consumeAuthenticatedLimit");
    }

    // These operations include an external API or service-role write, so a
    // database DML trigger cannot cover the whole operation.
    expect(source("lib/actions/calendar.ts")).toContain(
      'consumeAuthenticatedLimit("google_calendar_update")'
    );
    expect(source("app/api/google-calendar/callback/route.ts")).toContain(
      'consumeAuthenticatedLimit("google_calendar_update")'
    );
  });

  it("passes one normalized public token to lookup, rate limit, mutation, and redirect", () => {
    const answers = source("lib/actions/answers.ts");
    expect(answers).toContain("const normalizedToken = normalizePublicToken(token)");
    expect(answers).toContain("getPublicAnswerData(normalizedToken)");
    expect(answers).toContain('consumePublicLimit("public_answer", normalizedToken)');

    const settlements = source("lib/actions/settlements.ts");
    expect(settlements).toContain("const normalizedToken = normalizePublicToken(token)");
    expect(settlements).toContain('consumePublicLimit("public_payment", normalizedToken)');
    expect(settlements).toMatch(/recordPublicSettlementPayment\(\{[\s\S]*?token: normalizedToken,/);
    expect(settlements).toContain("`/s/${normalizedToken}/settlement`");
  });

  it("limits Google availability after the common owner guard and uses common route errors", () => {
    const route = source("app/api/events/[eventId]/availability/route.ts");
    const guardIndex = route.indexOf('requireEventAccess(eventId, "owner")');
    const limitIndex = route.indexOf(
      'consumeAuthenticatedLimit("google_availability")'
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeGreaterThan(guardIndex);
    expect(route).toContain('from "@/lib/server/admin/google-token-store"');
    expect(route).toContain("getEventCalendarIntegrations({");
    expect(route).not.toContain('.rpc("get_event_calendar_integrations"');
    expect(route).toContain("toRouteError(error)");
  });

  it("never sends Supabase error messages or arbitrary Error objects to users or logs", () => {
    for (const path of [
      ...authenticatedActionFiles,
      "lib/actions/answers.ts",
      "app/api/events/[eventId]/availability/route.ts",
      "app/api/cron/notifications/route.ts"
    ]) {
      const contents = source(path);
      expect(contents, path).not.toMatch(/throw new Error\([^\n]*\.message/);
      expect(contents, path).not.toMatch(/NextResponse\.json\([^\n]*\.message/);
      expect(contents, path).not.toMatch(/console\.(?:error|warn|log)\([^\n]*(?:error|Error)/);
    }
  });

  it("routes public pages, cron, settlement reads, and Google token writes through bounded wrappers or session RPCs", () => {
    expect(source("app/api/cron/notifications/route.ts")).toContain(
      'from "@/lib/server/admin/cron-notifications"'
    );
    expect(source("app/s/[token]/answer/page.tsx")).toContain(
      'from "@/lib/server/admin/public-answer"'
    );
    expect(source("app/s/[token]/settlement/page.tsx")).toContain(
      'from "@/lib/server/admin/public-settlement"'
    );
    expect(source("app/invites/[token]/page.tsx")).toContain(
      'from "@/lib/server/admin/public-invite"'
    );
    expect(source("app/plans/[planId]/settlement/page.tsx")).toContain(
      '.rpc("get_settlement_page_data"'
    );
    expect(source("lib/google-calendar/access-token.ts")).toContain(
      'from "@/lib/server/admin/google-token-store"'
    );
  });

  it("uses fixed service-only Google audit wrappers without exposing token data", () => {
    const callback = source("app/api/google-calendar/callback/route.ts");
    expect(callback).toContain("recordGoogleCalendarConnectAudit(user.id)");
    expect(callback).not.toContain('.rpc("record_security_audit"');

    const disconnect = source("app/api/google-calendar/disconnect/route.ts");
    expect(disconnect).toContain("recordGoogleCalendarDisconnectAudit(user.id)");
    expect(disconnect).not.toContain('.rpc("record_security_audit"');

    for (const contents of [callback, disconnect]) {
      expect(contents).not.toMatch(/safeLog\([^\n]*(?:token|cookie|url|error)/i);
    }
  });

  it("does not expose the generic audit RPC to authenticated callers", () => {
    for (const path of [
      "lib/actions/connections.ts",
      "lib/actions/event-members.ts",
      "lib/server/rate-limit.ts",
      "app/api/google-calendar/callback/route.ts",
      "app/api/google-calendar/disconnect/route.ts"
    ]) {
      expect(source(path), path).not.toContain('.rpc("record_security_audit"');
    }
  });
});
