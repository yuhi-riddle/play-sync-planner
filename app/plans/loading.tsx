import { Card } from "@/components/ui";

export default function PlansLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-label="カレンダーを読み込み中">
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-line" />
        <div className="h-9 w-44 animate-pulse rounded bg-line" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-line" />
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <div className="h-11 w-11 animate-pulse rounded-full bg-line" />
          <div className="h-8 w-32 animate-pulse rounded bg-line" />
          <div className="h-11 w-11 animate-pulse rounded-full bg-line" />
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }, (_, index) => (
            <div key={index} className="min-h-16 animate-pulse rounded-control bg-line sm:min-h-20" />
          ))}
        </div>
      </Card>
      <Card className="min-h-48">
        <div className="h-32 animate-pulse rounded-control bg-line" />
      </Card>
    </div>
  );
}
