import React from "react";

import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="読み込み中" className="space-y-6">
      <Skeleton className="h-32 w-full" />

      <div data-testid="event-tab-skeleton" className="flex border-b border-line">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex-1 px-2 py-2">
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </div>

      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}
