import { ButtonLink } from "@/components/ui";

export function HomeDraftResumeCard({
  resumeHref,
  onDiscard
}: {
  resumeHref: string;
  onDiscard: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-control border border-moss/24 bg-mist p-4">
      <span className="block text-body font-bold text-ink">イベント作成の下書き</span>
      <span className="mt-1 block text-body text-muted">入力途中のイベントがあります。続きから作成できます。</span>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href={resumeHref}>続きから入力</ButtonLink>
        <form action={onDiscard}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            下書きを破棄
          </button>
        </form>
      </div>
    </div>
  );
}
