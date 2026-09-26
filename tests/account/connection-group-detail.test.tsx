import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  updateConnectionGroupAction: vi.fn(),
  deleteConnectionGroupAction: vi.fn(),
  addConnectionGroupMembersAction: vi.fn(),
  removeConnectionGroupMemberAction: vi.fn(),
  loadConnectionGroupCandidatesAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connection-groups", () => actions);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { ConnectionGroupDetail } from "@/components/account/connection-group-detail";
import type { ConnectionGroup, ConnectionGroupMember } from "@/lib/domain/account/connection-groups";

const group: ConnectionGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "謎解き仲間",
  color: "nazotoki",
  memberCount: 1,
  memberNames: ["あや"],
  activeEventCount: 0
};
const aya: ConnectionGroupMember = {
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "あや",
  sharedEventCount: 3,
  isFollowing: true
};
const ken: ConnectionGroupMember = { ...aya, userId: "33333333-3333-4333-8333-333333333333", displayName: "けん" };

beforeEach(() => vi.clearAllMocks());

describe("ConnectionGroupDetail", () => {
  it("名前・人数・メンバーを出す", () => {
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    expect(screen.getByRole("heading", { level: 1, name: "謎解き仲間" })).toBeInTheDocument();
    expect(screen.getByText("1人")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "メンバー" })).toHaveTextContent("あや");
  });

  it("名前と色を変えられる", async () => {
    actions.updateConnectionGroupAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "名前と色を変える" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "謎解き部" } });
    fireEvent.click(screen.getByRole("radio", { name: "こがね" }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await waitFor(() =>
      expect(actions.updateConnectionGroupAction).toHaveBeenCalledWith(group.id, { name: "謎解き部", color: "honey" })
    );
  });

  it("削除は画面内で確認してから行う", async () => {
    actions.deleteConnectionGroupAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "グループを削除" }));
    expect(screen.getByText("「謎解き仲間」を削除しますか？ メンバーとのつながりはそのまま残ります。")).toBeInTheDocument();
    expect(actions.deleteConnectionGroupAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(actions.deleteConnectionGroupAction).toHaveBeenCalledWith(group.id));
  });

  it("メンバーを外せる", async () => {
    actions.removeConnectionGroupMemberAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "あやをグループから外す" }));
    await waitFor(() => expect(actions.removeConnectionGroupMemberAction).toHaveBeenCalledWith(group.id, aya.userId));
    // 外したボタンは行ごと消えるので、フォーカスを「メンバー」の見出しへ移す
    await waitFor(() => expect(screen.getByRole("heading", { name: "メンバー" })).toHaveFocus());
  });

  it("候補を読み込んで、選んだ人を追加できる", async () => {
    actions.loadConnectionGroupCandidatesAction.mockResolvedValue([ken]);
    actions.addConnectionGroupMembersAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);

    fireEvent.click(screen.getByRole("button", { name: "メンバーを追加" }));
    const picker = await screen.findByRole("group", { name: "追加する人" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "けん" }));
    fireEvent.click(within(picker).getByRole("button", { name: "1人を追加" }));

    await waitFor(() => expect(actions.addConnectionGroupMembersAction).toHaveBeenCalledWith(group.id, [ken.userId]));
  });

  it("30人に達していたら追加ボタンを押せず、理由を出す", () => {
    render(<ConnectionGroupDetail group={{ ...group, memberCount: 30 }} members={[aya]} />);
    expect(screen.getByRole("button", { name: "メンバーを追加" })).toBeDisabled();
    expect(screen.getByText("1つのグループに入れられるのは30人までです")).toBeInTheDocument();
  });

  it("追加できる人数を超えては選べない", async () => {
    const candidates = [ken, { ...ken, userId: "44444444-4444-4444-8444-444444444444", displayName: "みお" }];
    actions.loadConnectionGroupCandidatesAction.mockResolvedValue(candidates);
    render(<ConnectionGroupDetail group={{ ...group, memberCount: 29 }} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "メンバーを追加" }));
    const picker = await screen.findByRole("group", { name: "追加する人" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "けん" }));
    expect(within(picker).getByRole("checkbox", { name: "みお" })).toBeDisabled();
  });
});
