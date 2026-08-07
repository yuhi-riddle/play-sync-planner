import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewEventPage from "@/app/events/new/page";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

vi.mock("@/lib/actions/event/events", () => ({
  createEventAction: vi.fn(),
  saveEventDraftAction: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn()
}));

const maybeSingle = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle }))
  }))
}));

describe("NewEventPage draft resume", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
    maybeSingle.mockResolvedValue({ data: { payload: { category: "meal", title: "保存済みイベント" } } });
  });

  it("always shows an empty form for a normal /events/new visit", async () => {
    render(await NewEventPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("イベント名")).toHaveValue("");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("loads the saved draft only for resume=draft", async () => {
    render(await NewEventPage({ searchParams: Promise.resolve({ resume: "draft" }) }));

    expect(screen.getByLabelText("イベント名")).toHaveValue("保存済みイベント");
    expect(from).toHaveBeenCalledWith("event_drafts");
  });
});
