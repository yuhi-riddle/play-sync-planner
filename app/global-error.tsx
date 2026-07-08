"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body>
        <main
          style={{
            minHeight: "100vh",
            padding: "32px 16px",
            background: "#f7f0e4",
            color: "#23262b",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          }}
        >
          <section
            style={{
              maxWidth: 720,
              margin: "0 auto",
              border: "1px solid rgba(255,255,255,0.75)",
              borderRadius: 8,
              background: "rgba(250,246,237,0.92)",
              padding: 24,
              boxShadow: "0 24px 64px rgba(38, 45, 43, 0.12)"
            }}
          >
            <p style={{ margin: 0, color: "#5f7d65", fontSize: 12, fontWeight: 700, letterSpacing: "0.18em" }}>MADOI</p>
            <h1 style={{ margin: "12px 0 0", fontSize: 32, lineHeight: 1.25 }}>エラーが発生しました</h1>
            <p style={{ margin: "12px 0 0", color: "rgba(35,38,43,0.68)", lineHeight: 1.8 }}>
              画面の表示に失敗しました。時間をおいて、もう一度試してください。
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                marginTop: 20,
                border: 0,
                borderRadius: 999,
                background: "#23262b",
                color: "#fff",
                padding: "10px 22px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              もう一度試す
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
