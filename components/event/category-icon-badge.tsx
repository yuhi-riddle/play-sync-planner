import React from "react";
import { clsx } from "clsx";

import { categoryAccent } from "@/lib/domain/event/category-color";
import { categoryIcon } from "@/lib/domain/event/category-icon";

export function CategoryIconBadge({ category }: { category: string }) {
  const accent = categoryAccent(category);
  const Icon = categoryIcon(category);

  return (
    <div className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white", accent.dot)}>
      <Icon aria-hidden="true" className="h-5 w-5" />
    </div>
  );
}
