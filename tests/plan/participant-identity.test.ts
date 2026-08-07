import { describe, expect, it } from "vitest";

import {
  canConfirmSettlementPayment,
  resolveAnswerParticipantForSubmission,
  resolveViewerParticipant
} from "@/lib/domain/plan/participant-identity";

describe("resolveAnswerParticipantForSubmission", () => {
  const participants = [
    { id: "participant-1", displayName: "Alice", userId: null },
    { id: "participant-2", displayName: "Bob", userId: "user-bob" }
  ];

  it("uses the logged-in participant before matching by display name", () => {
    expect(
      resolveAnswerParticipantForSubmission({
        participants,
        displayName: "Alice",
        userId: "user-bob"
      })
    ).toEqual({
      kind: "existing",
      participantId: "participant-2",
      userIdToLink: null
    });
  });

  it("links an existing display-name participant to the current Google user", () => {
    expect(
      resolveAnswerParticipantForSubmission({
        participants,
        displayName: "Alice",
        userId: "user-alice"
      })
    ).toEqual({
      kind: "existing",
      participantId: "participant-1",
      userIdToLink: "user-alice"
    });
  });

  it("creates a registered participant for a new logged-in user", () => {
    expect(
      resolveAnswerParticipantForSubmission({
        participants,
        displayName: "Chika",
        userId: "user-chika"
      })
    ).toEqual({
      kind: "create",
      displayName: "Chika",
      participantType: "registered",
      userId: "user-chika"
    });
  });

  it("creates a guest participant when the answerer is not logged in", () => {
    expect(
      resolveAnswerParticipantForSubmission({
        participants,
        displayName: "Dana",
        userId: null
      })
    ).toEqual({
      kind: "create",
      displayName: "Dana",
      participantType: "guest",
      userId: null
    });
  });
});

describe("canConfirmSettlementPayment", () => {
  it("allows the receiving participant user to confirm a payment", () => {
    expect(
      canConfirmSettlementPayment({
        currentUserId: "receiver-user",
        receiverUserId: "receiver-user"
      })
    ).toBe(true);
  });

  it("does not allow the organizer to confirm another participant receipt", () => {
    expect(
      canConfirmSettlementPayment({
        currentUserId: "owner-user",
        receiverUserId: "receiver-user"
      })
    ).toBe(false);
  });

  it("does not allow confirmation before the receiver is linked to a Google user", () => {
    expect(
      canConfirmSettlementPayment({
        currentUserId: "owner-user",
        receiverUserId: null
      })
    ).toBe(false);
  });
});

describe("resolveViewerParticipant", () => {
  const participants = [
    { id: "participant-1", displayName: "Alice", userId: "user-alice" },
    { id: "participant-2", displayName: "Bob", userId: null }
  ];

  it("matches by logged-in user id first", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: "user-alice",
        selectedParticipantId: "participant-2"
      })
    ).toEqual(participants[0]);
  });

  it("falls back to the selected participant id when not logged in", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: "participant-2"
      })
    ).toEqual(participants[1]);
  });

  it("returns null when neither user id nor selection resolves a participant", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: null
      })
    ).toBeNull();
  });

  it("returns null when the selected participant id does not exist", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: "unknown"
      })
    ).toBeNull();
  });
});
