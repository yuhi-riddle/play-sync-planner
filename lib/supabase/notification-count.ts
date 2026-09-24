import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 未読通知の件数。行は取らず件数だけを数える。
 * 取れなかったときは null を返し、呼び出し側はバッジを出さずに画面を描く。
 */
export async function getUnreadNotificationCount(userId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return null;
  return count ?? 0;
}
