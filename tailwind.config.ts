import type { Config } from "tailwindcss";

/**
 * 値の出どころは design/tokens.css。使い方のルールは design/rules.md。
 * どちらかだけ直すとズレるので、変更時は必ず両方を更新する。
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // 面: 3段。カードは必ず不透明にする
        canvas: "#f7f3ef",
        surface: "#fffdf7",
        sunken: "#f6f0e4",

        // 旧名。canvas / surface のエイリアスとして残す
        paper: "#f7f3ef",
        cream: "#fffdf7",

        // 線
        line: {
          DEFAULT: "#e4dac6",
          strong: "#cbbfa6"
        },

        // 文字: 暖色グレー3段。黒の透明度を重ねない
        ink: "#262320", // 本文・見出し。主CTAには使わない
        muted: "#6f665c", // 補足・ラベル
        subtle: "#948a7d", // 装飾専用。AA不足なので本文に使わない

        // アクセント: 値ではなく「使い道」を決めてある
        moss: "#5f7d65", // 線・アイコン・面
        pine: "#344f43", // 強調文字・確定・hover・主CTAグラデーションの起点
        "pine-deep": "#2c4638", // 主CTAグラデーションの終端
        clay: "#df7d69", // 期限・要対応（面/線）
        "clay-ink": "#a8492f", // 期限・要対応（文字）
        honey: "#d9aa4f", // 調整中（面/線）
        "honey-ink": "#7f5c19", // 調整中（文字）
        skywash: "#d9e8e7",
        mist: "#eff3ee"
      },
      /*
       * Web フォントは使わない。
       * Zen Kaku Gothic New を入れていたが、Google Fonts の latin サブセットには日本語グリフが
       * 含まれず、画面の大半を占める日本語には一切効いていなかった（英数字だけに適用され、
       * その代償に 30 ファイル / 268KB を読み込んでいた）。日本語グリフを含めると数 MB になる。
       * OS 標準の日本語ゴシックで十分きれいに出るため、システムフォントで組む。
       */
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "BIZ UDPGothic",
          "Meiryo",
          "sans-serif"
        ]
      },
      fontSize: {
        display: ["1.875rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" }],
        title: ["1.0625rem", { lineHeight: "1.5", fontWeight: "700" }],
        body: ["0.875rem", { lineHeight: "1.75" }],
        caption: ["0.75rem", { lineHeight: "1.6" }],
        eyebrow: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.16em", fontWeight: "700" }],
        stat: ["1.625rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }]
      },
      borderRadius: {
        card: "20px",
        control: "14px"
      },
      boxShadow: {
        // 輪郭は border が担う。影は「浮き」の表現だけに使う
        raise: "0 1px 2px rgba(62, 51, 39, 0.04), 0 3px 10px rgba(62, 51, 39, 0.05)",
        soft: "0 8px 26px rgba(62, 51, 39, 0.09)",
        lift: "0 20px 48px rgba(62, 51, 39, 0.15)"
      }
    }
  },
  plugins: []
};

export default config;
