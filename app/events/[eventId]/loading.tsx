export default function EventDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="イベント詳細を読み込み中">
      <div className="space-y-3">
        <div className="h-4 w-20 animate-pulse rounded bg-line/70" />
        <div className="h-9 w-3/4 max-w-md animate-pulse rounded bg-line/70" />
        <div className="h-5 w-full max-w-lg animate-pulse rounded bg-line/50" />
      </div>
      <div className="grid gap-3 rounded-control border border-line bg-white p-4 sm:grid-cols-2">
        {["one", "two", "three", "four"].map((key) => <div key={key} className="h-20 animate-pulse rounded-control bg-surface" />)}
      </div>
      <div className="h-40 animate-pulse rounded-control border border-line bg-surface" />
      <div className="h-32 animate-pulse rounded-control border border-line bg-surface" />
    </div>
  );
}
