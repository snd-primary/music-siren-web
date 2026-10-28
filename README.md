# music-siren-web

ヤマハのミュージックサイレン（第1世代機）を、Web Audio による音響シミュレーションと Three.js による 3D モデルで再現する、個人の趣味プロジェクトです（完全非営利）。

**非公式のプロジェクトで、ヤマハ株式会社とは無関係です。** ロゴ・銘板は再現しません。

## 方針

- 音と見た目を、同じ1つの機構モデル（`src/mechanism/`）から導く。
- `src/mechanism/` は DOM にも Web Audio にも依存しない純粋な関数と状態だけにする。
- 機種は配列表（取扱説明書）をそのままデータ化したプリセット（`src/presets/`）で切り替える。
- 調査メモは `docs/music-siren-project.md`。

## 開発

Node 22 以上と pnpm 10.28 以上（`corepack enable` で `packageManager` のバージョンが使われます）。

```bash
pnpm install
pnpm dev        # 開発サーバー
pnpm test       # Vitest
pnpm typecheck  # tsc --noEmit
pnpm check      # typecheck + test + audit
```

## 依存パッケージの扱い（サプライチェーン対策）

`pnpm-workspace.yaml` で次を有効にしています。

- `minimumReleaseAge: 10080`：公開から 7 日たっていないバージョンは入れない。
- `trustPolicy: no-downgrade`：provenance 付きで公開されていたパッケージが provenance 無しに戻ったら拒否。
- `onlyBuiltDependencies: []` と `strictDepBuilds: true`：依存のインストールスクリプトは一切実行しない。必要になったら明示的に許可する。
- `blockExoticSubdeps: true`：依存の依存が git や URL から解決されるのを禁止。
- `verifyDepsBeforeRun: error`、`saveExact: true`、`engineStrict: true`。

実行時依存は `three` のみです。CI（GitHub Actions）では `--frozen-lockfile` でインストールし、`pnpm audit` を通します。Dependabot は 7 日の cooldown 付きで週次更新します。

## 権利まわり

- 取扱説明書の PDF はコミットしません（`.gitignore`）。説明書から読み取った数値（事実）だけを使います。
- 曲は保護期間の切れたものだけを扱います。
