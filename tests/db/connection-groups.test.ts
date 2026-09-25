import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

async function makeUser() {
  const userId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1,$2)", [userId, `${userId}@e.test`]);
  return userId;
}

async function makeEvent(ownerId: string, options: { status?: string; endDate?: string } = {}) {
  const eventId = randomUUID();
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,'会',$3,$4,$4)",
    [eventId, ownerId, options.status ?? "confirmed", options.endDate ?? "2099-01-01"]
  );
  return eventId;
}

async function joinEvent(eventId: string, userId: string, status = "joined") {
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'メンバー','member',$3)",
    [eventId, userId, status]
  );
}

/** me と others 全員が参加しているイベントを1つ作る。 */
async function shareEvent(me: string, ...others: string[]) {
  const eventId = await makeEvent(me);
  await joinEvent(eventId, me);
  for (const other of others) await joinEvent(eventId, other);
  return eventId;
}

async function asUser(userId: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function createGroup(name: string, color = "nazotoki", memberIds: string[] = []) {
  const { rows } = await client.query("select public.create_connection_group($1, $2, $3::uuid[]) as id", [
    name,
    color,
    memberIds
  ]);
  return rows[0].id as string;
}

/**
 * エラーが起きるとトランザクション全体が中断するので、セーブポイントで囲んで
 * 同じテストの中で続けてクエリを流せるようにする。
 */
async function expectErrorCode(run: () => Promise<unknown>, code: string) {
  await client.query("savepoint expect_error");
  await expect(run()).rejects.toMatchObject({ code });
  await client.query("rollback to savepoint expect_error");
}

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("begin");
});
afterEach(async () => {
  await client.query("rollback");
});

describe("create_connection_group / list_connection_groups", () => {
  it("作ったグループを、人数・メンバー名・作った順で返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    // 表示名はプロフィールのニックネームを優先する（list_connections と同じ）。
    await client.query("update public.profiles set nickname = 'あや' where user_id = $1", [aya]);
    await asUser(me);

    await createGroup("謎解き仲間", "nazotoki", [aya]);
    await createGroup("大学の友達", "boardgame");

    const { rows } = await client.query(
      "select name, color, member_count, member_names, active_event_count from public.list_connection_groups()"
    );
    expect(rows).toEqual([
      { name: "謎解き仲間", color: "nazotoki", member_count: "1", member_names: ["あや"], active_event_count: "1" },
      { name: "大学の友達", color: "boardgame", member_count: "0", member_names: [], active_event_count: "0" }
    ]);
  });

  it("名前の前後の空白は落として保存する", async () => {
    const me = await makeUser();
    await asUser(me);
    await createGroup("  謎解き仲間  ");
    const { rows } = await client.query("select name from public.list_connection_groups()");
    expect(rows[0].name).toBe("謎解き仲間");
  });

  it("空の名前・21文字以上・不正な色は PSP10", async () => {
    const me = await makeUser();
    await asUser(me);
    await expectErrorCode(() => createGroup("   "), "PSP10");
    await expectErrorCode(() => createGroup("あ".repeat(21)), "PSP10");
    await expectErrorCode(() => createGroup("謎解き仲間", "black"), "PSP10");
  });

  it("自分の別グループと同じ名前は PSP07。他人とは同じ名前でよい", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    await createGroup("謎解き仲間");
    await expectErrorCode(() => createGroup("謎解き仲間"), "PSP07");

    await asUser(other);
    await expect(createGroup("謎解き仲間")).resolves.toEqual(expect.any(String));
  });

  it("21個目は PSP05", async () => {
    const me = await makeUser();
    await asUser(me);
    for (let i = 1; i <= 20; i += 1) await createGroup(`グループ${i}`);
    await expectErrorCode(() => createGroup("グループ21"), "PSP05");
  });

  it("一緒に参加しておらずフォローもしていない人、ブロック関係の人は PSP08", async () => {
    const me = await makeUser();
    const stranger = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, blocked);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);
    await asUser(me);

    await expectErrorCode(() => createGroup("A", "nazotoki", [stranger]), "PSP08");
    await expectErrorCode(() => createGroup("B", "nazotoki", [blocked]), "PSP08");
    await expectErrorCode(() => createGroup("C", "nazotoki", [me]), "PSP08");
  });

  it("フォローしているだけの人も入れられる", async () => {
    const me = await makeUser();
    const followed = await makeUser();
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2)", [
      me,
      followed
    ]);
    await asUser(me);
    await expect(createGroup("A", "nazotoki", [followed])).resolves.toEqual(expect.any(String));
  });

  it("未ログインでは作れない", async () => {
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
    await expect(createGroup("A")).rejects.toThrow(/Authentication required/);
  });
});

describe("get_connection_group / list_connection_group_memberships", () => {
  it("他人のグループは空で返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    const mine = await client.query("select name, member_count from public.get_connection_group($1)", [groupId]);
    expect(mine.rows).toEqual([{ name: "謎解き仲間", member_count: "1" }]);
    const memberships = await client.query("select group_id, member_user_id from public.list_connection_group_memberships()");
    expect(memberships.rows).toEqual([{ group_id: groupId, member_user_id: aya }]);

    await asUser(other);
    expect((await client.query("select * from public.get_connection_group($1)", [groupId])).rows).toEqual([]);
    expect((await client.query("select * from public.list_connection_group_memberships()")).rows).toEqual([]);
  });

  it("active_event_count は、メンバーが1人でも参加している進行中のイベントだけ数える", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    await shareEvent(me, aya, ken); // 2人とも参加（1件）
    await shareEvent(me, ken); // ken だけ（1件）
    const done = await makeEvent(me, { status: "done", endDate: "2020-01-01" });
    await joinEvent(done, me);
    await joinEvent(done, aya); // 終わったイベントは数えない
    await asUser(me);
    await createGroup("仲間", "nazotoki", [aya, ken]);

    const { rows } = await client.query("select active_event_count from public.list_connection_groups()");
    expect(rows[0].active_event_count).toBe("2");
  });
});

describe("RLS", () => {
  it("authenticated から他人のグループを直接読めず、直接書き込みもできない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");

    await client.query("set local role authenticated");
    await asUser(other);
    expect((await client.query("select id from public.connection_groups where id = $1", [groupId])).rows).toEqual([]);
    await client.query("savepoint direct_insert");
    await expect(
      client.query("insert into public.connection_groups (owner_user_id, name) values ($1, 'x')", [other])
    ).rejects.toThrow();
    await client.query("rollback to savepoint direct_insert");

    await asUser(me);
    expect((await client.query("select id from public.connection_groups where id = $1", [groupId])).rows).toHaveLength(1);
    await client.query("reset role");
  });
});

describe("update / delete", () => {
  it("名前と色を変えられる。別グループと同じ名前は PSP07", async () => {
    const me = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");
    await createGroup("大学の友達");

    await client.query("select public.update_connection_group($1, $2, $3)", [groupId, " 謎解き部 ", "honey"]);
    const { rows } = await client.query("select name, color from public.get_connection_group($1)", [groupId]);
    expect(rows).toEqual([{ name: "謎解き部", color: "honey" }]);

    await expectErrorCode(() => 
      client.query("select public.update_connection_group($1, $2, $3)", [groupId, "大学の友達", "honey"]),
      "PSP07"
    );
  });

  it("他人のグループは編集も削除も PSP09", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");

    await asUser(other);
    await expectErrorCode(() => 
      client.query("select public.update_connection_group($1, 'x', 'nazotoki')", [groupId]),
      "PSP09"
    );
    await expectErrorCode(() => client.query("select public.delete_connection_group($1)", [groupId]), "PSP09");
  });

  it("削除するとメンバーも消える", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    await client.query("select public.delete_connection_group($1)", [groupId]);
    expect((await client.query("select * from public.list_connection_groups()")).rows).toEqual([]);
    expect(
      (await client.query("select * from public.connection_group_members where group_id = $1", [groupId])).rows
    ).toEqual([]);
  });
});

describe("メンバーの追加・削除", () => {
  it("30人までは入れられ、31人目は PSP06", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    await asUser(me);
    const groupId = await createGroup("大人数");

    await client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, people.slice(0, 30)]);
    await expectErrorCode(() => 
      client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, [people[30]]]),
      "PSP06"
    );
    // すでにいる人だけを渡したときは上限に関係なく成功する
    await client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, [people[0]]]);
  });

  it("外せる。他人のグループからは外せない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    await asUser(other);
    await expectErrorCode(() => client.query("select public.remove_connection_group_member($1, $2)", [groupId, aya]), "PSP09");

    await asUser(me);
    await client.query("select public.remove_connection_group_member($1, $2)", [groupId, aya]);
    const { rows } = await client.query("select member_count from public.get_connection_group($1)", [groupId]);
    expect(rows[0].member_count).toBe("0");
  });
});

describe("set_person_connection_groups", () => {
  it("渡したグループだけに入っている状態にする", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const a = await createGroup("A", "nazotoki", [aya]);
    const b = await createGroup("B");
    const c = await createGroup("C");

    await client.query("select public.set_person_connection_groups($1, $2::uuid[])", [aya, [b, c]]);
    const { rows } = await client.query(
      "select group_id from public.list_connection_group_memberships() where member_user_id = $1 order by group_id",
      [aya]
    );
    expect(rows.map((row) => row.group_id).sort()).toEqual([b, c].sort());
    expect(rows.map((row) => row.group_id)).not.toContain(a);
  });

  it("空の配列ならすべてのグループから外す。入れられない人でも外すことはできる", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await createGroup("A", "nazotoki", [aya]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [me, aya]);

    await client.query("select public.set_person_connection_groups($1, '{}'::uuid[])", [aya]);
    expect((await client.query("select * from public.list_connection_group_memberships()")).rows).toEqual([]);
  });

  it("他人のグループ ID が混ざっていたら PSP09", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(other);
    const othersGroup = await createGroup("他人の");
    await asUser(me);
    await expectErrorCode(() => 
      client.query("select public.set_person_connection_groups($1, $2::uuid[])", [aya, [othersGroup]]),
      "PSP09"
    );
  });
});

describe("list_connection_group_members / list_connection_group_candidates", () => {
  it("メンバーと、まだ入っていない候補を返す。他人のグループは空", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, aya, ken, blocked);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [me, blocked]);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    const members = await client.query(
      "select user_id, shared_event_count, is_following from public.list_connection_group_members($1)",
      [groupId]
    );
    expect(members.rows).toEqual([{ user_id: aya, shared_event_count: "1", is_following: false }]);

    const candidates = await client.query("select user_id from public.list_connection_group_candidates($1)", [groupId]);
    expect(candidates.rows.map((row) => row.user_id)).toEqual([ken]);

    await asUser(other);
    expect((await client.query("select * from public.list_connection_group_members($1)", [groupId])).rows).toEqual([]);
    expect((await client.query("select * from public.list_connection_group_candidates($1)", [groupId])).rows).toEqual([]);
  });
});

describe("ブロック・退会", () => {
  it("ブロックすると、相手を自分のグループから、自分を相手のグループから外す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const mine = await createGroup("自分の", "nazotoki", [aya]);
    await asUser(aya);
    const theirs = await createGroup("相手の", "nazotoki", [me]);

    await asUser(me);
    await client.query("select public.block_user_atomic($1)", [aya]);

    const { rows } = await client.query(
      "select group_id from public.connection_group_members where group_id = any($1::uuid[])",
      [[mine, theirs]]
    );
    expect(rows).toEqual([]);
  });

  it("退会すると、その人のグループを消し、ほかの人のグループからも外す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const mine = await createGroup("自分の", "nazotoki", [aya]);
    await asUser(aya);
    await createGroup("相手の", "nazotoki", [me]);

    await client.query("select public.finalize_account_withdrawal($1)", [aya]);

    expect((await client.query("select * from public.connection_groups where owner_user_id = $1", [aya])).rows).toEqual([]);
    expect(
      (await client.query("select * from public.connection_group_members where group_id = $1", [mine])).rows
    ).toEqual([]);
  });
});

describe("list_connections / get_connection_counts からお気に入りの振り分けを外す", () => {
  it("お気に入りでフォロー中の人は following に入り、favorites には入らない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2)", [me, aya]);
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, aya]);
    await asUser(me);

    const following = await client.query(
      "select user_id from public.list_connections('following', null, null, 20)"
    );
    expect(following.rows.map((row) => row.user_id)).toEqual([aya]);
    const favorites = await client.query("select user_id from public.list_connections('favorites', null, null, 20)");
    expect(favorites.rows).toEqual([]);

    const counts = await client.query("select category, item_count from public.get_connection_counts()");
    const byCategory = Object.fromEntries(counts.rows.map((row) => [row.category, Number(row.item_count)]));
    expect(byCategory.following).toBe(1);
    expect(byCategory.favorites ?? 0).toBe(0);
  });
});
