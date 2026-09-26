"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { errorState, successState, type ActionState } from "@/lib/domain/shared/action-state";
import {
  isConnectionGroupColor,
  isUuid,
  mapConnectionGroupMemberRow,
  normalizeConnectionGroupName,
  type ConnectionGroupMember
} from "@/lib/domain/account/connection-groups";
import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

const groupErrorMessages: Record<string, string> = {
  PSP02: "操作が多すぎます。しばらく待ってから再度お試しください。",
  PSP05: "グループは20個までです",
  PSP06: "1つのグループに入れられるのは30人までです",
  PSP07: "同じ名前のグループがあります",
  PSP08: "一緒に参加したことがある人か、フォロー中の人だけを入れられます",
  PSP09: "グループが見つかりません",
  PSP10: "グループ名は1〜20文字で、色は選択肢から選んでください"
};

export type CreateConnectionGroupResult = { status: "success"; groupId: string } | { status: "error"; message: string };

async function requireUser() {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

function messageFor(code: string | undefined, fallback: string) {
  return (code && groupErrorMessages[code]) || fallback;
}

function revalidateGroup(groupId?: string) {
  revalidatePath("/connections");
  if (groupId) revalidatePath(`/connections/groups/${groupId}`);
}

function validIds(ids: string[]) {
  return ids.every(isUuid);
}

export async function createConnectionGroupAction(input: {
  name: string;
  color: string;
  memberIds?: string[];
}): Promise<CreateConnectionGroupResult> {
  try {
    await requireUser();
    const name = normalizeConnectionGroupName(input.name);
    if (!name.ok) return { status: "error", message: name.message };
    if (!isConnectionGroupColor(input.color)) return { status: "error", message: groupErrorMessages.PSP10 };
    const memberIds = input.memberIds ?? [];
    if (!validIds(memberIds)) return { status: "error", message: "メンバーの指定が正しくありません" };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_connection_group", {
      p_name: name.name,
      p_color: input.color,
      p_member_ids: memberIds
    });
    if (error || typeof data !== "string") {
      return { status: "error", message: messageFor(error?.code, "グループを作れませんでした") };
    }

    revalidateGroup();
    return { status: "success", groupId: data };
  } catch (cause) {
    unstable_rethrow(cause);
    return { status: "error", message: "グループを作れませんでした" };
  }
}

export async function updateConnectionGroupAction(
  groupId: string,
  input: { name: string; color: string }
): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId)) return errorState(groupErrorMessages.PSP09);
    const name = normalizeConnectionGroupName(input.name);
    if (!name.ok) return errorState(name.message);
    if (!isConnectionGroupColor(input.color)) return errorState(groupErrorMessages.PSP10);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("update_connection_group", {
      p_group_id: groupId,
      p_name: name.name,
      p_color: input.color
    });
    if (error) return errorState(messageFor(error.code, "グループを保存できませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを保存できませんでした");
  }
}

export async function deleteConnectionGroupAction(groupId: string): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId)) return errorState(groupErrorMessages.PSP09);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_connection_group", { p_group_id: groupId });
    if (error) return errorState(messageFor(error.code, "グループを削除できませんでした"));

    revalidateGroup(groupId);
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを削除できませんでした");
  }
  redirect("/connections");
}

export async function addConnectionGroupMembersAction(groupId: string, memberIds: string[]): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId) || !validIds(memberIds)) return errorState("メンバーの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("add_connection_group_members", { p_group_id: groupId, p_member_ids: memberIds });
    if (error) return errorState(messageFor(error.code, "メンバーを追加できませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("メンバーを追加できませんでした");
  }
}

export async function removeConnectionGroupMemberAction(groupId: string, memberId: string): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId) || !isUuid(memberId)) return errorState("メンバーの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("remove_connection_group_member", { p_group_id: groupId, p_member_id: memberId });
    if (error) return errorState(messageFor(error.code, "メンバーを外せませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("メンバーを外せませんでした");
  }
}

export async function setPersonConnectionGroupsAction(memberId: string, groupIds: string[]): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(memberId) || !validIds(groupIds)) return errorState("グループの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_person_connection_groups", { p_member_id: memberId, p_group_ids: groupIds });
    if (error) return errorState(messageFor(error.code, "グループを保存できませんでした"));

    revalidateGroup();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを保存できませんでした");
  }
}

export async function loadConnectionGroupCandidatesAction(groupId: string): Promise<ConnectionGroupMember[]> {
  await requireUser();
  if (!isUuid(groupId)) throw new Error(groupErrorMessages.PSP09);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_connection_group_candidates", { p_group_id: groupId });
  if (error) throw new Error("候補を読み込めませんでした");

  return (data ?? []).map(mapConnectionGroupMemberRow);
}
