# create-llm-wiki

> LLM がメンテナンスする Obsidian ウィキを任意のプロジェクトにスキャフォールド — [Karpathy の LLM Wiki パターン](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) + Claude Code 統合。

**Languages**: [English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## 概要

任意のプロジェクトに完全な LLM メンテナンス知識ベースをスキャフォールドする CLI ツール:

- **Obsidian vault** — Dataview + Marp プラグイン事前インストール済み
- **Claude Code スキル** — `/ingest`, `/query`, `/lint`, `/obsidian-open` でウィキ操作
- **ソフトルール** — ターン開始時にウィキコンテキストを自動読み込み、ターン終了時にドメイン知識を自動反映
- **Hook 安全網** (Stop + UserPromptSubmit) — ソフトルールの判断が漏れた際に LLM へリマインダーを注入。`--no-hooks` でオプトアウト可能
- **Opus サブエージェント** — 集中的な簿記作業用
- **ページテンプレートと YAML スキーマ** — entity, concept, source, synthesis 構造定義
- **ドメインプリセット** — ゲーム、SaaS、研究、小説、または汎用プロジェクト

ウィキは、あらゆる実質的なタスクにおいて **LLM のアクティブコンテキストの一部** となり、セッション間で知識を蓄積します。動機と原理については [Karpathy の gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) を参照してください。

## クイックスタート

### 新規プロジェクト (Greenfield)
```bash
npx create-llm-wiki my-wiki
cd my-wiki
```

### 既存プロジェクト (Retrofit)
```bash
cd my-existing-project
npx create-llm-wiki --retrofit --vault-name my-project
```

### ドメインプリセット付き
```bash
npx create-llm-wiki my-game --domain game
npx create-llm-wiki my-saas --domain saas
npx create-llm-wiki my-research --domain research
npx create-llm-wiki my-novel --domain novel
```

CLI が実行する操作:
1. プロジェクトディレクトリを作成 (または現在のディレクトリを retrofit)
2. すべてのテンプレートファイルをコピー (`CLAUDE.md`, `.claude/`, `vault/`, `scripts/`)
3. 選択したドメインプリセットを `wiki-conventions.md` に適用
4. GitHub releases から Dataview と Marp プラグインをダウンロード
5. Obsidian のインストールを確認 (オプションで winget/brew 経由でインストール)
6. `git init` と初期コミット

## スキャフォールドされる構造

```
my-wiki/
├── CLAUDE.md                   # スキーマ + Claude Code @imports
├── README.md
├── .gitignore
├── vault/                      # Obsidian vault
│   ├── .obsidian/
│   │   ├── app.json
│   │   ├── core-plugins.json
│   │   ├── community-plugins.json
│   │   └── plugins/
│   │       ├── dataview/       # 事前ダウンロード
│   │       └── marp/           # 事前ダウンロード
│   ├── raw/
│   │   ├── sources/            # 不変のソースドキュメント
│   │   └── assets/             # 画像 (Obsidian 添付フォルダ)
│   └── wiki/
│       ├── index.md            # カタログ
│       ├── log.md              # 追記専用変更履歴
│       ├── entities/
│       ├── concepts/
│       ├── sources/
│       └── synthesis/
├── .claude/
│   ├── rules/
│   │   ├── wiki-conventions.md    # YAML + ページテンプレート
│   │   ├── wiki-auto-load.md      # ターン開始読み込みルール
│   │   └── wiki-auto-reflect.md   # ターン終了書き込みルール
│   ├── hooks/                     # 安全網 hook（--no-hooks で省略）
│   │   ├── wiki-reflect-check.ps1 # Stop hook（Windows）
│   │   ├── wiki-reflect-check.py  # Stop hook（Unix）
│   │   ├── wiki-load-check.ps1    # UserPromptSubmit hook（Windows）
│   │   └── wiki-load-check.py     # UserPromptSubmit hook（Unix）
│   ├── settings.json              # Claude Code に hook を登録
│   ├── agents/
│   │   └── wiki-maintainer.md     # opus サブエージェント
│   └── skills/
│       ├── ingest/SKILL.md
│       ├── query/SKILL.md
│       ├── lint/SKILL.md
│       └── obsidian-open/SKILL.md
└── scripts/
    ├── obsidian-open.ps1
    └── obsidian-open.sh
```

## Read-modify-write ループ

```
┌──────────────────────────────────────────────────────────────┐
│ ターン開始 → wiki-auto-load    → index.md + 関連 2-5 ページ読込│
│                                    推論中に引用              │
├──────────────────────────────────────────────────────────────┤
│                     実質的な作業                              │
│         (コード、設計、クエリ、調査、…)                       │
├──────────────────────────────────────────────────────────────┤
│ ターン終了 → wiki-auto-reflect  → 新しい知識が生まれた?      │
│                                     はい → ファイル+ログ+コミット│
│                                     いいえ → 静かにスキップ  │
└──────────────────────────────────────────────────────────────┘
```

両方のルールは**ソフトルール** — LLM は命令によって従い、強制メカニズムはありません。純粋なコード編集、ビルド/ツール変更、ウィキ自体に関するメタ質問はスキップします。

## Hook（安全網）

デフォルトで CLI は `.claude/hooks/` に 2 つの Claude Code hook をインストールし、`.claude/settings.json` に登録します:

| Hook | イベント | 動作 |
| --- | --- | --- |
| `wiki-load-check` | `UserPromptSubmit` | ユーザーのメッセージにドメイン意図キーワードが含まれる場合、*同じターン*のコンテキストに `wiki-auto-load.md` を指す 1 行のリマインダーを注入する。 |
| `wiki-reflect-check` | `Stop` | ターン終了時にトランスクリプトをスキャンし、ソース文書の読み取り/編集または意図キーワードのシグナルがあるのにウィキへの書き込みがなければ、停止をブロックしてリマインダーを注入し、アシスタントが `wiki-auto-reflect.md` をもう一度適用する機会を与える。 |

Hook は**強制せず、nudge（促し）のみを行います**。ルールファイルを指すリマインダーを注入するだけで、実際に何をロード/ファイルするかはアシスタントがソフトルールの判断基準に従って決定します。エラー時は fail open（サイレント exit 0）— hook のバグが作業をブロックすることは絶対にありません。Stop hook はループ防止のため `stop_hook_active` をチェックします。

意図キーワードは選択した `--domain` プリセット（game / saas / research / novel / generic）と CLI `--lang` から自動生成されます。インストール後にカスタマイズするには、4 つの hook スクリプト上部付近の `intent_regex` を直接編集してください。

完全にオプトアウトするには `--no-hooks` で実行 — ソフトルールはそのまま適用され、安全網のみ失われます。

**クロスプラットフォーム**: Windows プロジェクトは PowerShell hook（追加依存なし）。Unix プロジェクトは Python 3 hook（hook 実行時に Python 3.7+ が必要、インストール時は不要）。両ペアとも `.claude/hooks/` に同梱されているため、後から `.claude/settings.json` の `command` フィールドを編集して切り替えられます。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/ingest <パス>` | ソースドキュメントを読む、要約を書く、entities/concepts を更新、index と log を更新 |
| `/query <質問>` | `[[引用]]` 付きでウィキから回答し、オプションで synthesis としてファイル化 |
| `/lint` | ヘルスチェック: 矛盾、古い主張、孤立ページ、欠落したクロスリファレンス |
| `/obsidian-open <パス>` | 実行中の Obsidian アプリでウィキページを開く |

または自然言語で望むことを記述するだけ — スキルは強いセマンティックマッチで発動します。

## CLI オプション

```
npx create-llm-wiki [project-name] [options]

オプション:
  --retrofit              既存プロジェクトに追加 (新しいディレクトリを作らない)
  --vault-dir <path>      Vault の位置 (デフォルト: vault)
  --vault-name <name>     Obsidian vault 名 (デフォルト: プロジェクト名)
  --scripts-dir <path>    スクリプトの位置 (デフォルト: scripts)
  --domain <preset>       ドメインプリセット: generic|game|saas|research|novel
  --commit-policy <p>     auto (デフォルト) または manual
  --skip-obsidian-check   Obsidian インストール確認をスキップ
  --install-obsidian      Obsidian が見つからない場合 winget/brew で自動インストール
  --skip-plugins          Dataview/Marp プラグインをダウンロードしない
  --no-hooks              Stop / UserPromptSubmit hook をインストールしない
  --lang <en|ko|zh-CN|ja> CLI 出力言語
  -y, --yes               すべてのプロンプトをスキップしてデフォルト値を使用
  -h, --help              ヘルプを表示
  -v, --version           バージョンを表示
```

## 前提条件

| ツール | 必須? |
| --- | --- |
| Node.js 18+ | **はい** — CLI が `util.parseArgs` とグローバル `fetch` を使用 |
| git | はい — スキャフォールドコミット用 |
| Obsidian | 使用時必須 (CLI がインストール可能) |
| Claude Code | 使用時必須 — このツールは Claude Code のためにスキャフォールド |
| npm | はい — `npx create-llm-wiki` の実行用 |
| PowerShell 5.1+ | Windows かつ hook 有効時のみ必要（プリインストール済み） |
| Python 3.7+ | macOS/Linux かつ hook 有効時のみ必要 — `brew install python` またはパッケージマネージャでインストール。インストールできない場合は `--no-hooks` を使用。 |

## 完全セットアップガイド

決定木、ファイル別リファレンス、カスタマイズチェックリスト、よくある落とし穴などの完全ガイド:

- [docs/setup-guide.md](docs/setup-guide.md) (English)
- [docs/setup-guide.ko.md](docs/setup-guide.ko.md) (한국어)
- [docs/setup-guide.zh-CN.md](docs/setup-guide.zh-CN.md) (简体中文)
- [docs/setup-guide.ja.md](docs/setup-guide.ja.md) (日本語)

## ライセンス

MIT
