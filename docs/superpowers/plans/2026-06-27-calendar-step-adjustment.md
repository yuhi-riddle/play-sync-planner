# Calendar Step Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a step-based schedule adjustment form where users choose candidate datetimes and answer deadline from a calendar-style UI.

**Architecture:** Keep the existing Server Action and Zod validation flow. Replace the current raw datetime list in `PlanForm` with client-side calendar/date-time controls that still submit standard `candidateDates` and `answer_deadline_at` fields.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Tailwind CSS, Zod, Vitest.

## Global Constraints

- Do not add a new date-picker dependency for this pass.
- Candidate and deadline minutes must stay in 15-minute steps.
- Answer deadline is required.
- Participants are not entered during plan creation.
- Google Calendar availability is not visible in this phase.
- Event address label should read "開催住所".
- Server validation remains the source of truth.

---

### Task 1: Calendar Helpers

**Files:**
- Create: `lib/calendar.ts`
- Test: `tests/calendar.test.ts`

**Interfaces:**
- Produces: `buildMonthCalendar(year: number, monthIndex: number): CalendarCell[]`
- Produces: `toDateInputValue(date: Date): string`
- Produces: `toDateTimeLocalValueFromParts(date: string, time: string): string`

- [ ] Add helper tests for month grids, date formatting, and datetime composition.
- [ ] Implement helpers without timezone-dependent ISO slicing.
- [ ] Run `npm.cmd test`.

### Task 2: Step Calendar Form

**Files:**
- Modify: `components/plan-form.tsx`

**Interfaces:**
- Consumes: calendar helpers from Task 1.
- Keeps hidden inputs named `candidateDates` and `answer_deadline_at`.

- [ ] Replace raw candidate datetime fields with a month calendar, hour select, minute select, and add button.
- [ ] Add step navigation: "候補日時", "回答期限", "確認".
- [ ] Add back/next buttons.
- [ ] Show selected candidates as removable rows.
- [ ] Require deadline before moving to review.
- [ ] Keep submit disabled until candidates and deadline exist.

### Task 3: Labels And Validation

**Files:**
- Modify: `components/event-form.tsx`
- Modify: `lib/validators.ts`
- Modify: `tests/validators.test.ts`

**Interfaces:**
- Keeps `eventSchema` and `planSchema` public names unchanged.

- [ ] Rename event address label to "開催住所".
- [ ] Make `answer_deadline_at` required in `planSchema`.
- [ ] Keep price and capacity non-negative.
- [ ] Update validator tests for required deadline.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
