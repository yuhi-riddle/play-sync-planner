import type { Database as GeneratedDatabase } from "@/lib/supabase/database.types";

type ReplaceArgs<T, TChanges extends object> = T extends { Args: infer TArgs }
  ? Omit<T, "Args"> & { Args: Omit<TArgs, keyof TChanges> & TChanges }
  : never;

type FunctionOverrides = {
  create_expense: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["create_expense"],
    { p_memo: string | null; p_payment_url: string | null }
  >;
  create_plan_with_children: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["create_plan_with_children"],
    {
      p_title: string | null;
      p_memo: string | null;
      p_share_expires_at: string | null;
      p_reminder_offset_minutes: number | null;
    }
  >;
  list_connections: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["list_connections"],
    { p_cursor_at: string | null; p_cursor_user_id: string | null }
  >;
  list_event_invite_candidates: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["list_event_invite_candidates"],
    { p_query: string | null; p_cursor_at: string | null; p_cursor_user_id: string | null }
  >;
  list_owned_event_ids: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["list_owned_event_ids"],
    { p_query?: string | null }
  >;
  record_authenticated_security_audit: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["record_authenticated_security_audit"],
    { p_target_id: string | null }
  >;
  record_settlement_payment: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["record_settlement_payment"],
    { p_payment_url: string | null; p_memo: string | null }
  >;
  record_web_vital: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["record_web_vital"],
    { p_client_ip: string | null }
  >;
  replace_plan_schedule: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["replace_plan_schedule"],
    { p_title: string | null; p_memo: string | null; p_reminder_offset_minutes: number | null }
  >;
  update_expense: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["update_expense"],
    { p_memo: string | null; p_payment_url: string | null }
  >;
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<GeneratedDatabase["public"]["Functions"], keyof FunctionOverrides> & FunctionOverrides;
  };
};
