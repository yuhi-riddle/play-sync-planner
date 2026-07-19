import React from "react";

export default function ConnectionsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="つながりを読み込み中">
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-24 rounded bg-ink/10" />
        <div className="h-8 w-32 rounded bg-ink/10" />
        <div className="h-4 max-w-md rounded bg-ink/10" />
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-11 w-full max-w-sm rounded-control bg-ink/10 sm:w-80" />
        {[0, 1, 2].map((index) => <div key={index} className="h-24 rounded-control border border-line bg-surface" />)}
      </div>
    </div>
  );
}
