# セキュリティノート — EC ToDo / Candy Stripper MD Tool

最終更新: 2026-06-26

---

## 1. 現状のリスク

| リスク | 説明 |
|---|---|
| URL公開 | 本番URLを知っていれば誰でもアクセスできる（簡易ログインで緩和済） |
| localStorage | 商品データはブラウザのlocalStorageに残る。共有PCでは他者に見られる可能性がある |
| VITE_ 環境変数 | `VITE_` プレフィックスの変数はブラウザバンドルに含まれる。ログインIDとパスワードが難読化されるが、DevToolsで確認できるため完全なセキュリティではない |
| コードへの直書き | パスワード・APIキー・トークンをソースコードに書くとGitHubに残る |
| .env.local 漏洩 | `.env.local` を誤って git add すると認証情報がリポジトリに含まれる |
| CI/CD秘密情報 | Vercel環境変数・GitHub Secretsは慎重に管理する必要がある |

---

## 2. 現在の対策

### 2-1. 簡易ログインゲート（2026-06-26 実装）

- アプリ本体はログイン成功後のみ表示する
- ログイン状態は `localStorage.ecTodo.auth` に保存する
- ログアウトボタンでセッションを削除できる
- IDとパスワードは `.env.local` の環境変数（`VITE_EC_TODO_LOGIN_ID` / `VITE_EC_TODO_LOGIN_PASSWORD`）から読む
- 本番環境では Vercel 環境変数に設定する

### 2-2. 環境変数管理

- `.env.local` は `.gitignore` に明記済みで git 管理外
- `.env.local.example` をリポジトリに含め、設定項目のみドキュメント化
- ソースコードにパスワード・トークン・APIキーを直書きしない

### 2-3. localStorage

- 保存するデータは業務上必要な最小限にする
- 不要になった保存データは画面上の「クリア」機能で削除できる
- **共有PCでは保存データをクリアしてからログアウトすることを推奨する**

---

## 3. 重要な注意事項（Claude Code 作業時）

以下の操作は**絶対に実行しない**こと:

- `git credential fill` を実行してパスワード/トークンを表示する
- `.env.local` の内容を全文出力する
- GitHub token / Vercel token をターミナルに表示する
- `.env.local` を `git add` する
- パスワードをソースコードに直書きする

---

## 4. 現在の認証の限界

現在の簡易ログインには以下の制限がある:

- `VITE_` 環境変数はビルド時にバンドルへ埋め込まれる
- ブラウザの DevTools（Sources / Network）で平文が確認できる
- **URLを知っている技術者は突破できる可能性がある**
- あくまで「URLを知っているだけの第三者を防ぐ」簡易ガードである

---

## 5. 今後の対策ロードマップ

| 優先度 | 対策 | タイミング |
|---|---|---|
| 高 | Vercel環境変数に `VITE_EC_TODO_LOGIN_ID` / `VITE_EC_TODO_LOGIN_PASSWORD` を設定する | 本番反映時 |
| 高 | 実データ投入前に保存先とアクセス権限を確認する | データ連携前 |
| 中 | Supabase Auth / Clerk などのサーバーサイド認証へ移行する | 本格運用前 |
| 中 | localStorageに保存するデータを最小限にする | 継続的に |
| 低 | Vercel側のアクセス制限（Password Protection）を検討する | 予算・要件次第 |
| 低 | 2段階認証・メール認証を追加する | 将来フェーズ |

---

## 6. 環境変数一覧

| 変数名 | 用途 | 保存先 |
|---|---|---|
| `VITE_EC_TODO_LOGIN_ID` | ログインID | `.env.local` / Vercel環境変数 |
| `VITE_EC_TODO_LOGIN_PASSWORD` | ログインパスワード | `.env.local` / Vercel環境変数 |

---

## 7. 参考

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vite Env Variables and Modes](https://vitejs.dev/guide/env-and-mode)
- OWASP Top 10: A07 Identification and Authentication Failures
