-- CI 専用: マイグレーション適用後、Supabase の anon / authenticated / service_role に
-- テーブル権限を付ける。実 Supabase はプラットフォームが同等の GRANT を行っている。
-- 行レベルの可否は RLS ポリシーが決めるので、テーブル権限は広めでよい。
--
-- tests/db/rls.test.ts が `set local role authenticated` で RLS を実際に効かせて検証するために必要。
-- migrations ジョブ（適用できるかだけ見る）では不要。db-tests ジョブでのみ実行する。

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- auth.users は RLS 越しではなく security definer 関数から読むだけなので select で十分。
grant select on auth.users to authenticated, service_role;
