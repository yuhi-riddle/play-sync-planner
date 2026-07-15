import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/019_user_profiles_and_avatars.sql");

describe("user profiles and avatars migration", () => {
  it("creates profiles with timestamps and onboarding state", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table public.profiles");
    expect(migration).toContain("user_id uuid primary key references auth.users(id) on delete cascade");
    expect(migration).toContain("nickname text not null");
    expect(migration).toContain("avatar_path text");
    expect(migration).toContain("onboarding_completed_at timestamptz");
    expect(migration).toContain("created_at timestamptz not null default now()");
    expect(migration).toContain("updated_at timestamptz not null default now()");
  });

  it("backfills existing users and creates profiles for future signups", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("insert into public.profiles (user_id, nickname)");
    expect(migration).toContain("from auth.users");
    expect(migration).toContain("raw_user_meta_data ->> 'full_name'");
    expect(migration).toContain("create or replace function public.handle_new_user_profile()");
    expect(migration).toContain("after insert on auth.users");
    expect(migration.match(/left\(/g)).toHaveLength(2);
  });

  it("allows users to manage only their own profile", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("alter table public.profiles enable row level security");
    expect(migration).toContain('create policy "Users can view their own profile"');
    expect(migration).toContain('create policy "Users can insert their own profile"');
    expect(migration).toContain('create policy "Users can update their own profile"');
    expect(migration).toContain("user_id = auth.uid()");
  });

  it("creates a public image bucket with a 2MB and MIME type limit", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("'profile-avatars'");
    expect(migration).toContain("2097152");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/webp'");
    expect(migration).toContain("public = true");
  });

  it("limits avatar writes to the signed-in user's folder", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('create policy "Users can upload their own profile avatars"');
    expect(migration).toContain('create policy "Users can update their own profile avatars"');
    expect(migration).toContain('create policy "Users can delete their own profile avatars"');
    expect(migration).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
});
