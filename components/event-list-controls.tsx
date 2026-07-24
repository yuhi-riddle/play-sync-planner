import Link from "next/link";
import React from "react";

import { categoryLabels, EVENT_CATEGORIES } from "@/lib/constants";
import {
  buildEventListHref,
  EVENT_LIST_PAGE_SIZES,
  type EventListPagination,
  type EventListQuery
} from "@/lib/event-filter";

const selectClassName =
  "mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base font-medium text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20";

export function EventListControls({
  query,
  draftCount,
  pagination
}: {
  query: EventListQuery;
  draftCount: number;
  pagination: EventListPagination;
}) {
  return (
    <section className="grid gap-4 rounded-card border border-line bg-surface p-5 shadow-raise">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-title text-ink">絞り込み</h2>
          <p className="mt-1 text-caption text-muted">状態、カテゴリ、表示順をまとめて変更できます。</p>
        </div>
        {draftCount > 0 ? (
          <span className="inline-flex w-fit items-center rounded-full border border-honey/45 bg-honey/18 px-3 py-1 text-caption font-bold text-honey-ink">
            下書き {draftCount}件
          </span>
        ) : null}
      </div>

      <form
        action="/events"
        method="get"
        aria-label="イベント一覧の表示条件"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className="text-body font-medium text-muted">
          状態
          <select name="status" defaultValue={query.status} className={selectClassName}>
            <option value="active">進行中</option>
            <option value="draft">下書き ({draftCount})</option>
            <option value="cancelled">中止</option>
            <option value="completed">完了</option>
          </select>
        </label>

        <label className="text-body font-medium text-muted">
          カテゴリ
          <select name="category" defaultValue={query.category} className={selectClassName}>
            <option value="all">すべて</option>
            {EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-body font-medium text-muted">
          表示順
          <select name="sort" defaultValue={query.sort} className={selectClassName}>
            <option value="newest">新しく作成した順</option>
            <option value="soonest">開催日が近い順</option>
            <option value="latest">開催日が遠い順</option>
          </select>
        </label>

        <label className="text-body font-medium text-muted">
          表示件数
          <select name="limit" defaultValue={String(query.pageSize)} className={selectClassName}>
            {EVENT_LIST_PAGE_SIZES.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}件
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            表示する
          </button>
          <Link
            href="/events"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            条件をリセット
          </Link>
        </div>
      </form>

      {pagination.totalItems > 0 ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption tabular-nums text-muted">
            {pagination.from}-{pagination.to} / {pagination.totalItems}件
          </p>
          {pagination.totalPages > 1 ? (
            <nav aria-label="イベント一覧のページ送り" className="flex items-center gap-2">
              {pagination.page > 1 ? (
                <Link
                  href={buildEventListHref(query, pagination.page - 1)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                >
                  前のページ
                </Link>
              ) : null}
              <span className="min-w-16 text-center text-caption tabular-nums text-muted">
                {pagination.page} / {pagination.totalPages}
              </span>
              {pagination.page < pagination.totalPages ? (
                <Link
                  href={buildEventListHref(query, pagination.page + 1)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                >
                  次のページ
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
