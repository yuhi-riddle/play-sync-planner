import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/024_performance_measurements.sql"),
  "utf8"
);

function functionBody(name: string) {
  const match = migration.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i"
  ));
  expect(match, `${name} must exist`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("anonymous performance measurement storage", () => {
  it("stores only coarse performance fields without identifying columns", () => {
    const table = migration.match(
      /create table private\.web_vital_samples \([\s\S]*?\n\);/i
    )?.[0] ?? "";

    expect(table).toContain("page_template text not null");
    expect(table).toContain("metric_name text not null");
    expect(table).toContain("metric_value double precision not null");
    expect(table).toContain("device_class text not null");
    expect(table).toContain("created_at timestamptz not null default now()");
    expect(table).not.toMatch(
      /user_id|url|path|query|event_id|token|ip|user_agent|session|subject_hash|free_text/i
    );
  });

  it("constrains every stored dimension and a reasonable finite metric range", () => {
    expect(migration).toMatch(
      /page_template in \('home', 'events', 'event-detail', 'calendar', 'connections', 'other'\)/
    );
    expect(migration).toMatch(/metric_name in \('LCP', 'INP', 'CLS'\)/);
    expect(migration).toMatch(/device_class in \('mobile', 'desktop'\)/);
    expect(migration).toContain("metric_value <> 'NaN'::double precision");
    expect(migration).toContain("metric_value <> 'Infinity'::double precision");
    expect(migration).toContain("metric_value <> '-Infinity'::double precision");
    expect(migration).toMatch(/metric_name = 'CLS'[\s\S]*metric_value <= 10/);
    expect(migration).toMatch(/metric_name in \('LCP', 'INP'\)[\s\S]*metric_value <= 120000/);
  });

  it("rate-limits and records through a service-role-only RPC", () => {
    const body = functionBody("record_web_vital");

    expect(body).toContain("auth.role() <> 'service_role'");
    expect(body).toContain("private.try_consume_rate_limit('web_vital', subject_hash)");
    expect(body).toContain("insert into private.web_vital_samples");
    expect(body).not.toMatch(/insert into private\.web_vital_samples[\s\S]*subject_hash/i);
    expect(migration).toContain(
      "grant execute on function public.record_web_vital(text, text, double precision, text, bytea) to service_role;"
    );
    for (const role of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(
        `revoke all on function public.record_web_vital(text, text, double precision, text, bytea) from ${role};`
      );
    }
  });

  it("purges samples older than 30 days through service role only", () => {
    const body = functionBody("purge_expired_web_vitals");

    expect(body).toContain("auth.role() <> 'service_role'");
    expect(body).toMatch(
      /delete from private\.web_vital_samples[\s\S]*created_at < clock_timestamp\(\) - interval '30 days'/
    );
    expect(migration).toContain(
      "grant execute on function public.purge_expired_web_vitals() to service_role;"
    );
    for (const role of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(
        `revoke all on function public.purge_expired_web_vitals() from ${role};`
      );
    }
  });
});
