export type EventMessage = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
};

export function normalizeEventMessageBody(value: string): string {
  const body = value.trim();

  if (!body) {
    throw new Error("メッセージを入力してください");
  }

  if (body.length > 2000) {
    throw new Error("2,000文字以内");
  }

  return body;
}
