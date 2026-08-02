-- user_consents は同意の正本（法的な記録）であり、行が消えても
-- auth.users.app_metadata の同意印（legal_consent_accepted_at）は自動で消えない。
-- そのため以前のように「行が無くなればmiddlewareが/consentへ差し戻す」形の
-- 自己修復が効かなくなっている。Supabaseのセッションcookieはhttponlyではないため、
-- ブラウザからaccess tokenを取り出せば本人が
-- DELETE /rest/v1/user_consents?user_id=eq.<自分のid> を直接叩ける状態だった。
-- migration 016 の "for all" ポリシーはDELETEも許可しており、この経路で
-- 同意記録だけを消して印は残す（＝同意ゲートを未同意のまま通過し続ける）ことができてしまう。
-- アプリのコード（lib/actions/legal.ts, app/auth/callback/route.ts,
-- middleware.ts, lib/actions/account.ts）を確認した限り、本人による
-- upsert（insert/update）とselectしか使っておらず、退会処理でも
-- user_consentsは意図的に残しているためdeleteは不要。よってDELETEを外す。
-- DROPとCREATEの間はポリシーが1本も無い状態になる。RLSは有効なので、その隙に来た
-- リクエストは全部拒否される。1文ずつ実行されても隙間ができないよう明示的に囲む。
begin;

drop policy if exists "Users can manage their own consent" on public.user_consents;

create policy "Users can view their own consent"
on public.user_consents
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert their own consent"
on public.user_consents
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own consent"
on public.user_consents
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
