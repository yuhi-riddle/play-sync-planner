import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionList } from "@/components/connection-list";

const favorite = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "あきらさん",
  sharedEventCount: 3,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const following = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "はるかさん",
  isFollowing: true,
  isFollowedBy: false,
  isFavorite: false
};

const candidate = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "みなとさん",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};

describe("ConnectionList", () => {
  it("groups people by the current connection and exposes their actions", () => {
    render(<ConnectionList favorites={[favorite]} following={[following]} candidates={[candidate]} />);

    expect(screen.getByRole("heading", { name: "お気に入り" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "フォロー中" })).toBeInTheDocument();
    expect(screen.getByText("あきらさん")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ブロック" })).toHaveLength(3);
  });

  it("keeps favorite disabled until the person is followed", () => {
    render(<ConnectionList favorites={[]} following={[]} candidates={[candidate]} />);

    expect(screen.getByRole("button", { name: "お気に入りにする" })).toBeDisabled();
  });

  it("allows an existing favorite to be removed even after an unfollow", () => {
    render(<ConnectionList favorites={[{ ...favorite, isFollowing: false }]} following={[]} candidates={[]} />);

    expect(screen.getByRole("button", { name: "お気に入りを外す" })).toBeEnabled();
  });
});
