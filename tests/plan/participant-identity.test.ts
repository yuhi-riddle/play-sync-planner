import { describe, expect, it } from "vitest";

import {
  canConfirmSettlementPayment,
  findAnswerParticipant,
  resolveViewerParticipant
} from "@/lib/domain/plan/participant-identity";

describe("findAnswerParticipant", () => {
  const participants = [
    { id: "participant-1", displayName: "Alice", userId: null },
    { id: "participant-2", displayName: "Bob", userId: "user-bob" }
  ];

  it("回答者は user_id で決める", () => {
    expect(findAnswerParticipant({ participants, userId: "user-bob" })).toEqual(participants[1]);
  });

  it("未ログインは誰にもならない", () => {
    expect(findAnswerParticipant({ participants, userId: null })).toBeNull();
  });

  it("参加者に入っていないログインユーザーは弾く", () => {
    expect(findAnswerParticipant({ participants, userId: "user-chika" })).toBeNull();
  });

  /*
   * 名前で照合していたころは、共有リンクを知っている人が名前を当てるだけで
   * その人になりすまして回答を上書きできた。名前は本人確認に使わない。
   */
  it("user_id の無い参加者は、名前が一致しても引き当てない", () => {
    expect(findAnswerParticipant({ participants, userId: "Alice" })).toBeNull();
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
