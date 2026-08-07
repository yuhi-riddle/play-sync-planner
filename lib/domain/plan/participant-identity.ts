export type ParticipantIdentity = {
  id: string;
  displayName: string;
  userId: string | null;
};

export type AnswerParticipantResolution =
  | {
      kind: "existing";
      participantId: string;
      userIdToLink: string | null;
    }
  | {
      kind: "create";
      displayName: string;
      participantType: "registered" | "guest";
      userId: string | null;
    };

export function resolveAnswerParticipantForSubmission({
  participants,
  displayName,
  userId
}: {
  participants: ParticipantIdentity[];
  displayName: string;
  userId: string | null;
}): AnswerParticipantResolution {
  const trimmedName = displayName.trim();
  const existingByUser = userId ? participants.find((participant) => participant.userId === userId) : undefined;
  if (existingByUser) {
    return {
      kind: "existing",
      participantId: existingByUser.id,
      userIdToLink: null
    };
  }

  const existingByName = participants.find((participant) => participant.displayName.trim() === trimmedName);
  if (existingByName) {
    return {
      kind: "existing",
      participantId: existingByName.id,
      userIdToLink: userId && !existingByName.userId ? userId : null
    };
  }

  return {
    kind: "create",
    displayName: trimmedName,
    participantType: userId ? "registered" : "guest",
    userId
  };
}

export function canConfirmSettlementPayment({
  currentUserId,
  receiverUserId
}: {
  currentUserId: string;
  receiverUserId: string | null;
}) {
  return Boolean(receiverUserId && currentUserId === receiverUserId);
}

export function resolveViewerParticipant({
  participants,
  userId,
  selectedParticipantId
}: {
  participants: ParticipantIdentity[];
  userId: string | null;
  selectedParticipantId: string | null;
}): ParticipantIdentity | null {
  if (userId) {
    const byUser = participants.find((participant) => participant.userId === userId);
    if (byUser) {
      return byUser;
    }
  }

  if (selectedParticipantId) {
    return participants.find((participant) => participant.id === selectedParticipantId) ?? null;
  }

  return null;
}
