-- security definer 関数の実行権限が匿名ユーザーに残っていた問題を塞ぐ。
--
-- 各関数の定義時点で `revoke all on function ... from public` は書かれていたが、
-- Supabase のプロジェクト初期設定が
--   alter default privileges for role postgres in schema public
--     grant execute on functions to anon, authenticated, service_role;
-- を敷いているため、新しい関数を作るたびに anon へ個別の実行権限が付与されている。
-- PUBLIC からの剥奪はこの個別付与を消さないので、そのままでは anon が呼び続けられる。
--
-- scripts/security/verify-function-privileges.mjs を本番へ当てて実測した結果、
-- 保護対象13関数すべてが匿名で status 200 を返した。うち3本（have_shared_event /
-- is_user_blocked / is_following）は auth.uid() を見ずに引数の2 UUID をそのまま
-- 比較するため、ログインなしで他人同士の関係が分かってしまう。残り10本は内部で
-- auth.uid() と突き合わせるので、匿名では常に false / 空を返し情報漏れは無い。
--
-- ここでは権限の剥奪だけを行う。021（wip/legacy-helper-test）にある補助関数の
-- private スキーマへの移設は範囲外（docs/codex-branch-triage.md 参照）。

revoke all on function public.is_event_owner(uuid) from anon;
revoke all on function public.is_event_member(uuid) from anon;
revoke all on function public.is_joined_event_member(uuid) from anon;
revoke all on function public.have_shared_event(uuid, uuid) from anon;
revoke all on function public.is_user_blocked(uuid, uuid) from anon;
revoke all on function public.is_following(uuid, uuid) from anon;
revoke all on function public.is_plan_participant(uuid) from anon;
revoke all on function public.is_participant_of_event(uuid) from anon;
revoke all on function public.is_own_participant(uuid) from anon;
revoke all on function public.is_participant_in_my_plan(uuid) from anon;
revoke all on function public.is_settlement_payer(uuid) from anon;
revoke all on function public.is_settlement_in_my_plan(uuid) from anon;
revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text) from anon;

-- 今後 public スキーマに作る関数の既定を閉じる。
-- プロジェクト初期設定の grant を打ち消す形で、public / anon への自動付与を止める。
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ロールバック（今回の変更を戻す場合はこれを実行する）:
--
-- grant execute on function public.is_event_owner(uuid) to anon;
-- grant execute on function public.is_event_member(uuid) to anon;
-- grant execute on function public.is_joined_event_member(uuid) to anon;
-- grant execute on function public.have_shared_event(uuid, uuid) to anon;
-- grant execute on function public.is_user_blocked(uuid, uuid) to anon;
-- grant execute on function public.is_following(uuid, uuid) to anon;
-- grant execute on function public.is_plan_participant(uuid) to anon;
-- grant execute on function public.is_participant_of_event(uuid) to anon;
-- grant execute on function public.is_own_participant(uuid) to anon;
-- grant execute on function public.is_participant_in_my_plan(uuid) to anon;
-- grant execute on function public.is_settlement_payer(uuid) to anon;
-- grant execute on function public.is_settlement_in_my_plan(uuid) to anon;
-- grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint, text) to anon;
-- alter default privileges in schema public grant execute on functions to public;
-- alter default privileges in schema public grant execute on functions to anon;
