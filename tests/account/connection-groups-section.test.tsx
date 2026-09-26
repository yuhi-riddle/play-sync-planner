import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createConnectionGroupAction, push } = vi.hoisted(() => ({
  createConnectionGroupAction: vi.fn(),
  push: vi.fn()
}));

vi.mock("@/lib/actions/account/connection-groups", () => ({ createConnectionGroupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), unstable_rethrow: vi.fn() }));

import { ConnectionGroupsSection } from "@/components/account/connection-groups-section";
import type { ConnectionGroup } from "@/lib/domain/account/connection-groups";

const nazotoki: ConnectionGroup = {
  id: "g1",
  name: "謎解き仲間",
  color: "nazotoki",
  memberCount: 7,
  memberNames: ["あや", "けん", "みお", "たく", "ゆい"],
  activeEventCount: 2
};

beforeEach(() => vi.clearAllMocks());

describe("ConnectionGroupsSection", () => {
  it("グループを、名前・人数・メンバー名・進めているイベントの件数つきのリンクで並べる", () => {
    render(<ConnectionGroupsSection groups={[nazotoki]} />);
    const link = screen.getByRole("link", { name: /謎解き仲間/ });
    expect(link).toHaveAttribute("href", "/connections/groups/g1");
    expect(link).toHaveTextContent("7人");
    expect(link).toHaveTextContent("あや・けん・みお・たく・ゆい ほか2人");
    expect(link).toHaveTextContent("進めているイベント 2件");
    expect(screen.getByText("自分だけに見えます")).toBeInTheDocument();
  });

  it("0件のときは説明と作るボタンだけ出す", () => {
    render(<ConnectionGroupsSection groups={[]} />);
    expect(screen.getByText("よく誘う仲間をまとめておくと、招待のときにまとめて選べます。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋ グループを作る" })).toBeEnabled();
  });

  it("作るフォームを開いたら、グループ名の入力欄にフォーカスを移す", () => {
    render(<ConnectionGroupsSection groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ グループを作る" }));
    expect(screen.getByLabelText("グループ名")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.getByRole("button", { name: "＋ グループを作る" })).toHaveFocus();
  });

  it("作ったらそのグループの画面へ進む", async () => {
    createConnectionGroupAction.mockResolvedValue({ status: "success", groupId: "g9" });
    render(<ConnectionGroupsSection groups={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ グループを作る" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "大学の友達" } });
    fireEvent.click(screen.getByRole("radio", { name: "みどり" }));
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/connections/groups/g9"));
    expect(createConnectionGroupAction).toHaveBeenCalledWith({ name: "大学の友達", color: "boardgame" });
  });

  it("失敗したら理由を出す", async () => {
    createConnectionGroupAction.mockResolvedValue({ status: "error", message: "同じ名前のグループがあります" });
    render(<ConnectionGroupsSection groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ グループを作る" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "謎解き仲間" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("同じ名前のグループがあります");
  });

  it("20個に達したら作るボタンを押せず、理由を出す", () => {
    const groups = Array.from({ length: 20 }, (_, i) => ({ ...nazotoki, id: `g${i}`, name: `G${i}` }));
    render(<ConnectionGroupsSection groups={groups} />);
    expect(screen.getByRole("button", { name: "＋ グループを作る" })).toBeDisabled();
    expect(screen.getByText("グループは20個までです")).toBeInTheDocument();
  });
});
