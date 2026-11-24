# 0018. Cloudflare Workers にデプロイする（Workers Builds、静的アセットのみ）

- 状態：採用
- 日付：2026-11-25

## 背景

これまでは手元の `pnpm dev` でしか動かしていなかった。人に見せられる URL が欲しい。
サイトは Vite のビルド出力（`dist/`：`index.html` と JS 2 本、約 650 KB）だけで、サーバー側の処理は無い。
依存のサプライチェーン対策（`pnpm-workspace.yaml`：インストールスクリプト禁止など）は崩したくない。

## 決定

- Cloudflare Workers の静的アセットとして `dist/` を配信する。Worker のスクリプトは書かない（`wrangler.jsonc` は `assets.directory` だけ）。
- デプロイは Workers Builds（Cloudflare 側の Git 連携）で行う。`main` への push でビルドとデプロイが走る。
  - ビルドコマンド：`pnpm build`、デプロイコマンド：`npx wrangler deploy`（既定）。
- 公開先は `music-siren-web.<サブドメイン>.workers.dev`。独自ドメインは付けない。
- wrangler は `devDependencies` に入れない。

## 根拠

- wrangler を依存に入れると、`esbuild`・`workerd`・`sharp` のインストールスクリプトが `strictDepBuilds` に掛かり、許可か無視の例外を書くことになる。Workers Builds なら wrangler は Cloudflare のビルド環境でだけ動き、リポジトリの依存は増えない。
- GitHub Actions からのデプロイは、Cloudflare の API トークンを GitHub の Secrets に置く必要がある。Workers Builds は置かなくて済む。
- 静的アセットだけの Worker はリクエスト課金の対象外で、無料枠で足りる。

## 結果

- `wrangler.jsonc` を追加した。Cloudflare のダッシュボードでリポジトリを接続する（手作業、1 回だけ）。
- GitHub Actions の CI（typecheck・test・build・audit）はそのまま残す。Workers Builds は CI の結果を待たないので、`main` に入れる前に `pnpm check` を通す。
- 公開されるのは `dist/` だけ。説明書の PDF・録音・映像（`.gitignore` 済み）はビルドに入らない。画面には「非公式で、ヤマハとは無関係」の表記がある。
- 手元から試すときは `pnpm build && pnpm dlx wrangler deploy --dry-run`。
