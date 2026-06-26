# Calendar Step Adjustment Design

## Goal

Make schedule adjustment creation easy to touch and hard to misuse. The user should create a lightweight plan first, then choose candidate datetimes from a calendar instead of managing several raw datetime fields.

## Scope

- Keep the first event form focused on basic information: category, title, URL, venue name, venue address, memo.
- Rename the event address label from "住所" to "開催住所".
- Replace the plan candidate datetime list with a step-based calendar picker.
- Make answer deadline required and selected through the same calendar/date-time picking pattern.
- Keep candidate datetime granularity at 15 minutes.
- Keep Google Calendar integration out of this implementation, but do not design the UI as if automatic availability exists today.
- Keep participants out of the create form. Participants join through the shared answer link.
- Keep numeric values non-negative in validation. Event price and capacity remain non-negative on the server side.

## Flow

1. Create a schedule container from `/events/new`.
2. Redirect to `/events/[eventId]/plans/new`.
3. Step 1: choose candidate datetimes from a month calendar and 15-minute time selectors.
4. Step 2: choose a required answer deadline with the same date/time controls.
5. Step 3: review selected candidates and create the share link.

## UI Design

The page uses a compact wizard with a visible step rail:

- Step 1: "候補日時"
- Step 2: "回答期限"
- Step 3: "確認"

The main control is a month calendar. Selecting a day keeps the user in context, then hour and minute controls decide the exact time. Adding a candidate pushes it into a visible list. Candidate rows can be removed.

Back and next buttons are always visible at the bottom of the wizard. The final button submits the existing form fields so the current Server Action can stay in place.

## Validation

- Candidate datetimes: at least one required.
- Answer deadline: required.
- Datetimes must be valid `YYYY-MM-DDTHH:mm` values.
- Minutes must be 15-minute steps.
- Server validation remains the source of truth.

## Testing

- Update validator tests for required answer deadline.
- Add component tests for choosing candidate datetimes and answer deadline if the existing test setup supports it cleanly.
- Run `npm.cmd test` and `npm.cmd run build`.
