import { NextRequest, NextResponse } from "next/server";

import { toCalendarItems, type CalendarRpcRow } from "@/lib/domain/home/calendar-items";
import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const user = await getCurrentActiveUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^(1\d{3}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_calendar_items", { p_month: `${month}-01` });
  if (error) {
    return NextResponse.json({ error: "予定を取得できませんでした。" }, { status: 500 });
  }

  return NextResponse.json({ items: toCalendarItems((data ?? []) as CalendarRpcRow[]) });
}
