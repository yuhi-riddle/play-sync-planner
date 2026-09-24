import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="読み込み中" className="space-y-7">
      <Skeleton className="h-28 w-full" />
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </Card>
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-56 w-full" />
      </Card>
    </div>
  );
}
