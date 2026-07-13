# Madoi 通知をGASで1時間ごとに実行する手順

Google Apps Script（GAS）からMadoiの通知APIを1時間ごとに呼び出す手順です。Vercelの無料プランでも、PCを閉じたまま定期通知を生成できます。

Madoi側には、すでに次のAPIがあります。新しいAPIを作る必要はありません。

```text
URL: https://play-sync-planner.vercel.app/api/cron/notifications
HTTPメソッド: GET
認証: Authorization: Bearer <CRON_SECRET>
```

> [!WARNING]
> `CRON_SECRET` はVercelへ設定した値と完全に同じ値を使います。GASのコードへ直接書かず、スクリプトプロパティへ保存します。チャット、Git、画面共有には貼り付けません。

## 1. GASプロジェクトを作る

1. [Google Apps Script](https://script.google.com/home) を開く。
2. Madoiを管理しているGoogleアカウントでログインする。
3. 左上の `新しいプロジェクト` を押す。
4. 左上の `無題のプロジェクト` を押す。
5. 名前を `Madoi notification scheduler` に変更する。
6. `Code.gs` を開く。
7. 最初から入っているコードをすべて削除する。

## 2. 秘密値をスクリプトプロパティへ保存する

1. 左側の歯車アイコン `プロジェクトの設定` を押す。
2. 下へスクロールして `スクリプト プロパティ` を探す。
3. `スクリプト プロパティを追加` を押す。
4. 1件目を次のように入力する。

```text
プロパティ: MADOI_CRON_URL
値: https://play-sync-planner.vercel.app/api/cron/notifications
```

5. もう一度 `スクリプト プロパティを追加` を押す。
6. 2件目を次のように入力する。

```text
プロパティ: MADOI_CRON_SECRET
値: VercelのCRON_SECRETと同じ値
```

7. `スクリプト プロパティを保存` を押す。

## 3. コードを貼り付ける

1. 左側の `エディタ` を押す。
2. `Code.gs` を開く。
3. 次のコードをそのまま貼り付ける。
4. 上部の保存アイコンを押す。

```javascript
function runMadoiNotificationCron() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty("MADOI_CRON_URL");
  const secret = properties.getProperty("MADOI_CRON_SECRET");

  if (!url || !secret) {
    throw new Error("MADOI_CRON_URL または MADOI_CRON_SECRET が未設定です。");
  }

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: `Bearer ${secret}`
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(`Madoi通知APIの呼び出しに失敗しました。status=${status}, body=${body}`);
  }

  console.log(`Madoi通知APIを実行しました。status=${status}, body=${body}`);
}
```

## 4. 1回だけ手動実行する

1. エディタ上部の関数選択欄で `runMadoiNotificationCron` を選ぶ。
2. `実行` を押す。
3. 初回の権限確認画面が出たら、`権限を確認` を押す。
4. 自分のGoogleアカウントを選ぶ。
5. 外部URLへのアクセス許可を求められたら、内容を確認して `許可` を押す。
6. 画面下部の `実行ログ` を開く。
7. 次のように `status=200` が出れば成功です。

```text
Madoi通知APIを実行しました。status=200, body={"created":0}
```

`created` の数字は、その実行で処理した通知候補の数です。0でもエラーではありません。

## 5. 1時間おきのトリガーを作る

1. 左側の時計アイコン `トリガー` を押す。
2. 右下の `トリガーを追加` を押す。
3. 次のように選ぶ。

```text
実行する関数を選択: runMadoiNotificationCron
実行するデプロイを選択: Head
イベントのソースを選択: 時間主導型
時間ベースのトリガーのタイプを選択: 時間ベースのタイマー
時間の間隔を選択: 1時間おき
```

4. `失敗通知設定` は `毎日通知を受け取る` を選ぶ。
5. `保存` を押す。
6. 一覧に `runMadoiNotificationCron` と `1時間おき` が表示されれば完了です。

GASの時間主導トリガーは、毎時ぴったりの秒に動くものではありません。数分程度のずれは起こりえます。回答期限の数分前に必ず知らせる用途ではなく、未回答や期限接近を定期確認する用途として使います。

## 6. 失敗した時の確認場所

1. GASで左側の `実行数` または `実行履歴` を押す。
2. 赤い失敗行を押す。
3. エラー全文を確認する。

| 表示 | 原因と直し方 |
| --- | --- |
| `status=401` | GASの `MADOI_CRON_SECRET` とVercelの `CRON_SECRET` が違う。両方を同じ値にする。 |
| `status=500` | VercelのSupabase環境変数が未設定。Vercelで値を確認して再デプロイする。 |
| `MADOI_CRON_URL または MADOI_CRON_SECRET が未設定` | GASの `プロジェクトの設定` -> `スクリプト プロパティ` を確認する。 |
| 権限エラー | 手順4をもう一度実行し、Googleアカウントで権限を許可する。 |

## 7. 停止する方法

1. GASの `トリガー` を開く。
2. `runMadoiNotificationCron` の行の右端にある3点メニューを押す。
3. `トリガーを削除` を押す。
4. 確認画面で削除する。

GASの定期実行だけが止まります。日程回答直後の通知は、通常の画面操作で作られるためそのまま動きます。
