import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/022_page_query_performance.sql");
const eventDataPath = resolve(process.cwd(), "lib/event-detail-data.ts");

describe("event detail member access migration", () => {
  it("allows only owners and joined members to read same-event members and plans", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/create policy "Joined members can view event members"[\s\S]*?on public\.event_members[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?private\.is_event_owner\(event_id\)[\s\S]*?private\.is_joined_event_member\(event_id\)/);
    expect(migration).toMatch(/create policy "Joined members can view plans"[\s\S]*?on public\.plans[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?private\.is_event_owner\(event_id\)[\s\S]*?private\.is_joined_event_member\(event_id\)/);
    expect(migration).not.toMatch(/create policy "Joined members can view (?:event members|plans)"[\s\S]*?for (?:all|insert|update|delete)/i);
    expect(migration).not.toMatch(/grant (?:all|select) on (?:table )?public\.(?:event_members|plans) to (?:anon|public)/i);
  });

  it("keeps the normal detail loader inside the same event scope", () => {
    const source = readFileSync(eventDataPath, "utf8");

    expect(source).toMatch(/from\("event_members"\)[\s\S]*?\.eq\("event_id", eventId\)/);
    expect(source).toMatch(/from\("plans"\)[\s\S]*?\.eq\("event_id", eventId\)/);
  });
});
