# LLM Wiki セットアップガイド

> Obsidian スタイルの LLM メンテナンスウィキと Claude Code 統合を任意のプロジェクトにセットアップするための実用的なガイド。
>
> **参考**: [Andrej Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
>
> **`create-llm-wiki` CLI がほとんどを自動化します**。このガイドは CLI が生成するもの、カスタマイズ方法、既存プロジェクトへの適用方法を理解するためのものです。

---

## 0. このシステムとは何か、なぜやるのか

**核心のアイデア**: LLM がクエリのたびに RAG のように生のソースから再導出するのではなく、**セッション間で持続的に蓄積するウィキ**を維持する。新しいソースが入ってくると、LLM は既存の entity/concept ページを更新し、クロスリファレンスを維持する。人間はキュレーションと方向性の指示を、LLM は簿記を行う。

**実用的な利点**:
- セッション間で知識が蓄積される(モデルの重みは変わらないが、外部メモリが成長する)
- 「これ前に決めたよね?」の再発見コストが消える
- 設計決定の監査証跡(`raw/` オリジナルと `wiki/` サマリーの分離)
- 時間とともに複利で価値が増加(初期は薄い、後に豊か)

---

## 1. アーキテクチャ — 3 層 + 2 方向

### 3 層 (Karpathy gist)
```
raw/       ← 不変のオリジナル (人間が投入、LLM は読むだけ)
   ↓ ingest
wiki/      ← LLM メンテナンスのコンパイルされた知識
   ↑ スキーマ参照
CLAUDE.md  ← スキーマ (LLM が上記 2 つをどう扱うか)
```

### 2 方向 (load/reflect ループ)
```
[ターン開始] wiki-auto-load    → index.md + 2-5 ページ読み込み → コンテキストとして使用
                ↓
            実質的な作業
                ↓
[ターン終了] wiki-auto-reflect → 新しい知識? → ファイル/更新 → log.md 追記
```

両方向がペアにならなければならない。読み取りだけ → 陳腐化。書き込みだけ → 孤立。

---

## 2. 前提条件

| ツール | 目的 | 必須? |
|---|---|---|
| **Obsidian** (デスクトップ) | Vault ビューア、グラフビュー、プラグインランタイム | 必須 |
| **Claude Code** | skills/agents/rules のロードと実行 | 必須 |
| **git** | ウィキが git リポジトリ | 必須 |
| **Node.js 18+** | CLI が Node で動作; qmd にも必要 (オプション) | CLI に必須 |
| **gh CLI** | GitHub リポジトリ作成とプッシュ | オプション |
| **Python 3** | スクリプトでの URL エンコード (フォールバックあり) | オプション |

インストール確認:
```bash
node --version      # >= 18.0.0
claude --version
git --version
```

---

## 3. 決定木 — 開始前に決めること

### Q1: プロジェクトの状態?

**Greenfield (新規プロジェクト)** → § 5
- リポジトリなし、または空のディレクトリ
- 任意のファイルを自由に作成可能
- 使用: `npx create-llm-wiki my-project`

**Retrofit (既存プロジェクト)** → § 6
- 既に `CLAUDE.md`、`LLM.md`、`.claude/`、`docs/` などがある
- 重要な原則: 既存ファイルに触れない
- 使用: `cd existing-project && npx create-llm-wiki --retrofit`

### Q2: Vault の場所?

| 状況 | 推奨 |
|---|---|
| コードプロジェクトがルートを占有 (`package.json` など) | **vault をサブフォルダに** (`vault/`, `wiki-vault/`) |
| ウィキ専用リポジトリ (コードなし) | リポジトリルート = vault ルート |
| 既存プロジェクトの改造 | **vault をサブフォルダに** (既存構造を保護) |

**注**: gist の例 (`attachmentFolderPath: raw/assets`) は vault 相対パスを使用するため、vault がサブフォルダであっても vault の*内部*構造は gist の記述通りに保たれます。

### Q3: スクリプトの場所?

既存の慣習に合わせる:
- 慣習なし / 新規プロジェクト → `scripts/obsidian-open.{ps1,sh}`
- 既存の `Tools/` 慣習 → `Tools/wiki/obsidian-open.{ps1,sh}`
- `bin/`, `tools/`, `utils/` → 適合するものを使用

`--scripts-dir <path>` で渡す。

### Q4: コミットポリシー?

| 状況 | ポリシー |
|---|---|
| 自分のリポジトリ、main に自由にコミット | **自動コミット** (`ingest:`, `wiki(auto):`) |
| チームリポジトリ、feature ブランチ、レビュー必須 | **ステージのみ**、ユーザーがコミット |
| チームリポジトリ、専用のウィキブランチ | 専用ブランチで自動コミット |

`--commit-policy auto|manual` で渡す。

---

## 4. 完全なファイル構造

### Vault (ウィキコンテンツ)
```
vault/
├── .obsidian/
│   ├── app.json                    ← 添付フォルダ固定など
│   ├── core-plugins.json           ← graph, backlink など有効化
│   ├── community-plugins.json      ← ["dataview", "marp"]
│   └── plugins/
│       ├── dataview/{main.js, manifest.json, styles.css}
│       └── marp/{main.js, manifest.json}
├── raw/
│   ├── sources/                    ← 不変のソース
│   └── assets/                     ← 画像 (添付フォルダ)
└── wiki/
    ├── index.md                    ← カタログ
    ├── log.md                      ← 変更履歴
    ├── entities/                   ← モノ: キャラクター、アイテム、システム、ツール
    ├── concepts/                   ← アイデア: メカニクス、パターン、アーキテクチャ
    ├── sources/                    ← raw ドキュメントごとのサマリー (1:1)
    └── synthesis/                  ← 横断分析、決定
```

### Claude Code 統合 (`.claude/`)
```
.claude/
├── rules/
│   ├── wiki-conventions.md         ← ページテンプレート + YAML スキーマ
│   ├── wiki-auto-load.md           ← ターン開始ソフトルール (読み取り)
│   └── wiki-auto-reflect.md        ← ターン終了ソフトルール (書き込み)
├── agents/
│   └── wiki-maintainer.md          ← 大規模処理用の opus サブエージェント
└── skills/
    ├── ingest/SKILL.md             ← /ingest <path>
    ├── query/SKILL.md              ← /query <question>
    ├── lint/SKILL.md                ← /lint
    └── obsidian-open/SKILL.md      ← ページを開く
```

### ルート
```
CLAUDE.md                            ← スキーマ + @ imports
README.md                            ← 使用ガイド
scripts/obsidian-open.{ps1,sh}       ← URI ラッパー (または Tools/wiki/ など)
```

---

## 5. Greenfield セットアップ (新規プロジェクト)

### 自動 (推奨)
```bash
npx create-llm-wiki my-wiki --domain generic
cd my-wiki
```

次に Obsidian で vault を開き、プラグインを有効化。完了。

### 手動 (何が起こるか理解したい場合)

**ステップ 1**: ディレクトリ構造
```bash
mkdir -p my-wiki/{vault/raw/sources,vault/raw/assets,vault/wiki/{entities,concepts,sources,synthesis},vault/.obsidian/plugins/{dataview,marp},.claude/{rules,agents,skills/{ingest,query,lint,obsidian-open}},scripts}
cd my-wiki
git init -b main
```

**ステップ 2**: Obsidian プラグインのダウンロード
```bash
cd vault/.obsidian/plugins/dataview
curl -sSL -o main.js     "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/main.js"
curl -sSL -o manifest.json "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/manifest.json"
curl -sSL -o styles.css  "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/styles.css"
cd -

cd vault/.obsidian/plugins/marp
curl -sSL -o main.js     "https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/main.js"
curl -sSL -o manifest.json "https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/manifest.json"
cd -
```

**ステップ 3**: このリポジトリの `template/` ディレクトリのテンプレートを開始点として使用してファイルを書く

**ステップ 4**: § 7 に従ってカスタマイズ

**ステップ 5**: コミット + プッシュ
```bash
git add -A
git commit -m "chore: scaffold LLM Wiki (Karpathy pattern)"
gh repo create my-wiki --private --source=. --push
```

**ステップ 6**: Obsidian で開く
1. Obsidian を起動 → "Open folder as vault" → `./vault`
2. 名前を付ける (`--vault-name` またはフォルダ名と一致)
3. Settings → Community plugins → 制限モードを解除 → Dataview と Marp を有効化

---

## 6. Retrofit セットアップ (既存プロジェクト)

### ステップ 1: 何も壊さずに検査
```bash
cd /path/to/existing-project
git status --short
git branch --show-current
ls -la
cat CLAUDE.md 2>/dev/null
cat LLM.md 2>/dev/null
ls .claude/rules/ .claude/agents/ .claude/skills/ 2>/dev/null
```

チェックリスト:
- [ ] 既存の `CLAUDE.md` / `LLM.md` — コンテンツファイルまたはポインタ?
- [ ] 既存の `.claude/rules/*.md` — どのルールが既に定義されている?
- [ ] 既存の `.claude/skills/*/` — 名前の衝突はない?
- [ ] 既存の `.claude/agents/*.md` — 名前の衝突はない?
- [ ] 既存の `docs/`, `design/` — ドキュメントはどこにある?
- [ ] 既存の `scripts/`, `Tools/`, `bin/` — スクリプトの慣習?
- [ ] `.gitignore` — プラグインバイナリを無視するか検討

### ステップ 2: 最優先事項 — 上書きしない
- **絶対に上書きしない**: 既存の `CLAUDE.md`、`LLM.md`、既存の rule/agent/skill ファイル
- **名前の衝突を避ける**: 新しい skill/agent 名は既存のものと競合しないこと
- **最小限の変更**: ルートの `CLAUDE.md` に 1-2 個の `@` インポートを追加 (既存のコンテンツはそのまま)

### ステップ 3: retrofit を実行
```bash
cd /path/to/existing-project
npx create-llm-wiki --retrofit --vault-name my-project --scripts-dir Tools/wiki
```

これにより `vault/`、`.claude/rules/wiki-*.md`、`.claude/agents/wiki-maintainer.md`、`.claude/skills/{ingest,query,lint,obsidian-open}/`、およびスクリプトが追加されます — 既存ファイルに触れずに。

`CLAUDE.md` が既に存在する場合、CLI は上書きせずに `@ imports` を追加します:
```markdown
(既存のコンテンツ)

<!-- create-llm-wiki: auto-added imports -->
- @.claude/rules/wiki-auto-load.md
- @.claude/rules/wiki-auto-reflect.md
```

### ステップ 4: SKIP リストを調整
独自のルール/スキルを持つプロジェクト固有の作業を `wiki-auto-load.md` と `wiki-auto-reflect.md` の SKIP セクションに追加します。例:
```
- GameData テーブル実装 → 既存の skill `gamedata-table-create`
- Protocol enum ビルド → 既存の skill `protocol-enum-build`
- スタイル規則 → 既存の rule `csharp-style.md`
```

これにより、ウィキが既存のツールと重複することを防ぎます。

### ステップ 5: 自動的にコミットしない
CLI は retrofit モードで `git init` をスキップします。`git status --short` を確認し、準備ができたらコミットします。

---

## 7. カスタマイズチェックリスト (プロジェクトごと)

各項目をプロジェクトに合わせて調整します。コピーしてそのまま使用しないこと。

### 7.1 Vault
- [ ] **Vault 名** (Obsidian 登録名、URI で使用)
  - デフォルト: フォルダ名。`--vault-name` で上書き。
  - スクリプトの `$Vault` デフォルト値が一致する必要があります。

### 7.2 Entity/Concept カテゴリ (`wiki-conventions.md`)
ドメインに合わせる。CLI は `game`、`saas`、`research`、`novel`、`generic` のプリセットを提供。必要に応じて拡張または置換。

| プロジェクトタイプ | Entity カテゴリ | Concept カテゴリ |
|---|---|---|
| ゲーム | character, npc, mob, item, skill, buff, quest, map, costume, pet, currency, tool | architecture, mechanic, combat, progression, economy, social, balance |
| SaaS/Web アプリ | user, role, subscription, plan, integration, webhook, api-endpoint, service | auth, billing, multi-tenancy, rbac, event-sourcing |
| 研究/論文 | paper, author, dataset, model, benchmark, hypothesis, experiment | method, finding, open-question, replication-status, theory |
| 小説/世界観 | character, faction, location, artifact, event, timeline-entry, creature | theme, plot-thread, motif, worldbuilding-rule, magic-system |

### 7.3 ソースの場所
- [ ] 既存の `docs/` 慣習? → `/ingest` skill はリポジトリ相対パスを受け入れます。
- [ ] `raw:` frontmatter フィールドは `vault/raw/sources/` または既存の場所を参照できます。

### 7.4 スクリプトの場所
- [ ] `scripts/` vs `Tools/wiki/` vs `bin/` — 既存の慣習に合わせる。
- [ ] 正しいパスで `obsidian-open` skill の `SKILL.md` を更新。

### 7.5 コミットポリシー
- [ ] `wiki-auto-reflect.md` の "Commit policy" セクションを調整。
- [ ] 自動コミット vs ステージのみ。
- [ ] コミットメッセージの接頭辞 (`wiki(auto):`, `wiki(ingest):`)。

### 7.6 権威の境界 (重要)
- [ ] コード規則が既に存在する場所 (`.claude/rules/*.md`, `LLM.md`) → ウィキは再定義しない。
- [ ] ビルド/検証プロセス → ウィキスコープ外。
- [ ] 既存の設計ドキュメントの場所 → `wiki-auto-load.md` のフォールバックパスに追加。

### 7.7 真実のソースの階層
- [ ] トップレベルの仕様ドキュメントはありますか?あれば `wiki-conventions.md` で "authoritative" としてマーク。
- [ ] ウィキと仕様が衝突した場合、どちらが勝つ?

### 7.8 タグ語彙
- [ ] プロジェクト固有のタグ (例: `mvp`, `live`, `experimental`, 機能名)。
- [ ] `wiki-conventions.md` の "Tags" セクションにリスト。

### 7.9 `.gitignore`
```gitignore
# Obsidian ユーザー状態 (vault 設定は保持、ユーザー状態は削除)
**/.obsidian/workspace
**/.obsidian/workspace.json
**/.obsidian/workspace-mobile.json
**/.obsidian/cache
**/.obsidian/plugins/*/data.json
```

プラグインバイナリ (`main.js`, ~6MB) をコミットするか決定:
- 個人プロジェクト / 全員が事前インストールを希望 → コミット
- チームリポジトリ / バイナリを避けたい → `**/.obsidian/plugins/` を追加し、README にインストール手順を記載

---

## 8. 検証

### 8.1 ファイルの整合性
```bash
find vault -type f -not -path "*.git*" | sort
find .claude -type f | sort
```

### 8.2 Obsidian
- [ ] "Open folder as vault" → `vault` → 開く
- [ ] ファイルエクスプローラに `raw/`, `wiki/` が表示される
- [ ] Settings → Community plugins → Dataview, Marp が切り替え可能
- [ ] グラフビューに空のグラフが表示される (正常)

### 8.3 Claude Code
新しい会話を開始:
1. "CLAUDE.md からプロジェクトを説明して" → 正確なプロジェクト名とレイアウト
2. `/ingest <テストファイル>` → `vault/wiki/sources/<slug>.md` が作成される
3. `/query <任意の質問>` → 最初に `vault/wiki/index.md` を読み、回答する
4. ドメイン質問をする → ウィキが自動ロードされ、引用される (auto-load が発動)
5. 設計決定を議論し、ターンを終了 → サマリーで auto-reflect が告知される

---

## 9. よくある落とし穴

### 9.1 スキーマが読み込まれない
**症状**: `/ingest` を呼び出しているがスキルが発動しない
**原因**: `CLAUDE.md` が `@` インポートではなく markdown リンク (`[rule](path)`) で参照している
**修正**: `@.claude/rules/wiki-*.md` を使用する — `@` プレフィックスが Claude Code がファイルをロードする方法

### 9.2 auto-reflect が過剰 / 不足
**修正**: プロジェクトごとに SKIP リストをカスタマイズする

### 9.3 Obsidian のパスが一致しない
**修正**: `--vault-name` と Obsidian で開くときに選ぶ名前を一致させる

### 9.4 チームリポジトリ内のプラグインバイナリ
**修正**: `**/.obsidian/plugins/` を `.gitignore` に追加、README にインストール手順を記載

### 9.5 既存の `CLAUDE.md` / `LLM.md` の上書き
**修正**: CLI の retrofit モードは特にこれを避けます。手動で実行する場合は、**常に `Read` してから `Edit` で追加**する、絶対に `Write` で上書きしない。

### 9.6 権威の境界のぼやけ
**修正**: ウィキをドメインのみに明示的にスコープする。`wiki-conventions.md` で「ウィキはドメイン用、コードルールは既存のルールファイルに存在する」と明記する。

### 9.7 Vault 名が "vault" (見苦しい)
**修正**: スキャフォールド時に `--vault-name MyProject` を渡す、または Obsidian で開くときに名前を変更する

### 9.8 陳腐化したウィキ
**修正**: 定期的に `/lint` を実行する、特にリリースとマイルストーンの前に

---

## 10. セットアップ後のメンテナンス

### 週次
- `/lint` を一度実行して矛盾と孤立をチェック
- 最近のターン終了サマリーを見直して見逃した auto-reflect がないか

### 月次
- `wiki-conventions.md` のカテゴリを見直す — ドメインの進化を反映
- `vault/wiki/log.md` を閲覧して作業フローを振り返る
- 古いページ (`updated` > 30 日) をチェック

### 四半期
- ウィキスキーマ自体を見直す — カテゴリを変更?テンプレートを調整?
- `docs/` に蓄積された新しいドキュメントを一括取り込み

---

## 11. 参考

### コア
- [Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Obsidian](https://obsidian.md)
- [Claude Code](https://docs.claude.com/claude/claude-code)

### プラグイン
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — YAML frontmatter クエリ (`v0.5.70`)
- [Marp (for Obsidian)](https://github.com/JichouP/obsidian-marp-plugin) — markdown スライド (`v1.5.0`)

### 検索 (オプション)
- [qmd](https://github.com/tobi/qmd) — ローカル BM25 + ベクトル + LLM リランキング検索 (`@tobilu/qmd`)

### このリポジトリ
- `template/` — すべてのファイルテンプレート (CLI がコピーするもの)
- `src/` — CLI ソースコード
- `docs/` — 4 言語のガイド

---

_このガイドは LLM Wiki パターンのための実用的なマニュアルです。生き続けるように — 新しいプロジェクトに適用するたびに学びを追加してください。_
