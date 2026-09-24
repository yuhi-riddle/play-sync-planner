import React from "react";

/**
 * ログイン・同意画面の枠。中身が少ないので、余った高さを上下に分けて真ん中に置き、
 * PCでは見出しとカードを同じ幅にそろえて横も真ん中に寄せる。
 * 高さはレイアウト側（フッターを画面下に固定する flex の縦並び）に従う。
 */
export function AuthPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="mx-auto w-full max-w-xl space-y-6">{children}</div>
    </div>
  );
}
