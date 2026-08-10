-- ゲスト参加者の廃止にともなう後始末。
--
-- participants は 001 の時点で participant_type に 'guest' を許し、既定値も 'guest' だった。
-- 共有リンクから名前を入力するだけで参加者行が増える作りで、その行は user_id を持たなかった。
-- そのあと共有ページはログイン必須になり（migration 030 の参加者RLSも user_id を前提にしている）、
-- アプリ側で participants を作る唯一の経路 lib/domain/event/event-members.ts は
-- 'registered' しか書かない。つまり 'guest' は誰も作らないのに、DBだけが受け付ける状態だった。
--
-- 受け付けたままにすると、user_id が無い行を後から誰かが（あるいは自分たちが）作れてしまう。
-- そういう行は RLS のどのポリシーにも当たらず、本人が開けない参加者として残る。
-- 使わない道は閉じておく。
begin;

-- 'guest' の行が残っているうちに制約を張ると、原因の分かりにくいエラーで落ちる。
-- 件数を数えて、何が起きているかを先に見せる。
do $$
declare
  legacy_count integer;
begin
  select count(*) into legacy_count
  from public.participants
  where participant_type is distinct from 'registered';

  if legacy_count > 0 then
    raise exception
      'participant_type が registered でない participants が % 件あります。中身を確認してから流してください。',
      legacy_count;
  end if;
end;
$$;

alter table public.participants
  alter column participant_type set default 'registered';

alter table public.participants
  drop constraint if exists participants_type_check;

alter table public.participants
  add constraint participants_type_check check (participant_type = 'registered');

commit;
