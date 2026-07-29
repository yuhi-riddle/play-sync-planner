export default function InviteLinkNotFound() {
  return (
    <div className="space-y-6">
      <section className="rounded-control border border-line bg-surface p-5 shadow-soft backdrop-blur">
        <p className="text-eyebrow uppercase text-pine">Madoi</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink sm:text-4xl">招待リンクが見つかりません</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          このリンクは無効か、期限が切れています。招待してくれた人にもう一度リンクを確認してください。
        </p>
      </section>
    </div>
  );
}
