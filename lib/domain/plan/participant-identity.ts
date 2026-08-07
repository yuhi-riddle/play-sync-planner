export type ParticipantIdentity = {
  id: string;
  displayName: string;
  userId: string | null;
};

/**
 * 回答する本人を決める。判断材料は user_id だけ。
 *
 * 以前は打ち込まれた名前とも照合していたが、それだと共有リンクを知っている人が
 * 名前を当てるだけで、その人になりすまして回答を上書きできた。
 * 参加者はイベントメンバーから作られるので、名前で引き当てる必要はもう無い。
 */
export function findAnswerParticipant({
  participants,
  userId
}: {
  participants: ParticipantIdentity[];
  userId: string | null;
}): ParticipantIdentity | null {
  if (!userId) {
    return null;
  }

  return participants.find((participant) => participant.userId === userId) ?? null;
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

