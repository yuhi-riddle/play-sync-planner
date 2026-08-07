"use client";

import React, { useEffect, useRef } from "react";

/**
 * 親の <details> が開いたら、フォームを画面中央へ寄せる。
 *
 * iOS はキーボードを画面に重ね、Android はレイアウトをリサイズするため、
 * 放っておくと開いた入力欄がキーボードに隠れる。
 * <details> の開閉自体は JS ゼロのままにしたいので、この部品だけを中に置く。
 */
export function DetailsScrollIntoView() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const details = anchorRef.current?.closest("details");
    if (!details) {
      return;
    }

    const handleToggle = () => {
      if (!details.open) {
        return;
      }

      // jsdom には scrollIntoView が無いのでオプショナル呼び出しにする（テストで落とさない）。
      // reduced-motion のときは smooth を使わない。components/plan-form.tsx の書き方に合わせている。
      const reducedMotion =
        typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      details.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    };

    details.addEventListener("toggle", handleToggle);
    return () => details.removeEventListener("toggle", handleToggle);
  }, []);

  return <span ref={anchorRef} aria-hidden="true" className="hidden" />;
}
