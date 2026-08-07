import Link from "next/link";
import React from "react";

import { categoryLabels, EVENT_CATEGORIES } from "@/lib/shared/constants";
import {
  buildEventListHref,
  EVENT_LIST_PAGE_SIZES,
  type EventListFilter,
  type EventListPagination,
  type EventListQuery,
  type EventListSort
} from "@/lib/domain/event/event-filter";

const selectClassName =
  "mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base font-medium text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20";

const sortLabels: Record<EventListSort, string> = {
  newest: "新しく作成した順",
  soonest: "開催日が近い順",
  latest: "開催日が遠い順"
};

const statusLabels: Record<EventListFilter, string> = {
  active: "進行中",
  draft: "下書き",
  completed: "完了",
  cancelled: "中止"
};

const statusOrder: EventListFilter[] = ["active", "draft", "completed", "cancelled"];

export function EventListControls({
  query,
  draftCount,
  pagination
}: {
  query: EventListQuery;
  draftCount: number;
  pagination: EventListPagination;
}) {
  /*
   * 375px では、縦積みのセレクト4つで 629px 使っていて、最初の画面にイベントが1件も入らなかった。
   * 実際に押されるのはほぼ「状態」だけなので、状態はチップで1タップに出し、
   * 残り（カテゴリ・表示順・表示件数）は畳んでおく。立替フォームと同じ段階的開示。
   */
  const isDefaultDetail = query.category === "all" && query.sort === "newest" && query.pageSize === 10;
  const detailSummary = [
    query.category === "all" ? "すべてのカテゴリ" : categoryLabels[query.category],
    sortLabels[query.sort],
    `${query.pageSize}件`
  ].join(" · ");

  return (
    /*
      grid-cols-1（= minmax(0, 1fr)）を明示する。既定の auto トラックだと、
      畳んだ <details> の中の <select> の min-content まで数えてトラックが広がり、
      画面より広くなる（実測 367.78px）。Chrome は閉じた details の中身にも
      レイアウトボックスを残すので、閉じていても効いてしまう。
    */
    <section className="grid grid-cols-1 gap-3">
      {/* 状態は横スクロールの帯に置く。4つとも常に見せると2段になって、また縦に伸びる。 */}
      {/*
        min-w-0 が要る。grid の子は既定の最小幅が min-content なので、
        中の w-max なチップ列がそのまま最小幅になり、overflow-x-auto があっても
        帯自体が画面より広くなって横スクロールが出る（実測 400px > 375px）。
      */}
      <nav aria-label="状態で絞り込む" className="-mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {statusOrder.map((status) => {
            const isCurrent = query.status === status;
            const count = status === "draft" ? draftCount : null;
            return (
              <li key={status}>
                <Link
                  // 絞り込みを変えたら1ページ目に戻す。3ページ目のまま状態だけ変えると空振りする。
                  href={buildEventListHref({ ...query, status }, 1)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${
                    isCurrent
                      ? "border-ink bg-ink text-white"
                      : "border-line-strong bg-surface text-ink hover:border-moss hover:text-pine"
                  }`}
                >
                  {statusLabels[status]}
                  {count !== null && count > 0 ? (
                    <span className={`tabular-nums ${isCurrent ? "text-white/75" : "text-muted"}`}>{count}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        既定以外の条件が入っているときは開いた状態で出す。畳んだままだと
        「なぜこの並び順なのか」が画面のどこにも書かれていないことになる。
      */}
      <details open={!isDefaultDetail} className="rounded-control border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-body text-muted [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate">{detailSummary}</span>
          <span className="whitespace-nowrap font-bold text-pine">条件を変える</span>
          <span aria-hidden="true" className="text-muted">
            ▾
          </span>
        </summary>

        <form
          action="/events"
          method="get"
          aria-label="イベント一覧の表示条件"
          className="grid grid-cols-1 gap-4 border-t border-line p-4 sm:grid-cols-3"
        >
          {/* 状態はチップ側で切り替える。ここで送らないと、条件を変えた瞬間に「進行中」へ戻ってしまう。 */}
          <input type="hidden" name="status" value={query.status} />

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
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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

          <div className="flex flex-wrap gap-2 sm:col-span-3">
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
      </details>

      {pagination.totalItems > 0 ? (
        // 件数とページ送りは1行に収める。375px で縦積みにすると、ここだけで90px 使う。
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
