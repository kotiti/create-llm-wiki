# create-llm-wiki

> Scaffold an LLM-maintained Obsidian wiki into any project — [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) + Claude Code integration.

**Languages**: [English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## What it is

A CLI tool that scaffolds a complete LLM-maintained knowledge base into any project:

- **Obsidian vault** with Dataview + Marp plugins pre-installed
- **Claude Code skills** (`/ingest`, `/query`, `/lint`, `/obsidian-open`) for wiki operations
- **Soft rules** for auto-loading wiki context at turn-start and auto-reflecting domain knowledge at turn-end
- **Opus subagent** for focused bookkeeping passes
- **Page templates and YAML schemas** for entities, concepts, sources, and synthesis
- **Domain presets** for games, SaaS, research, novels, or generic projects

The wiki becomes **part of your LLM's active context** for every substantive task, and accumulates knowledge across sessions. Read [Karpathy's gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) for the motivating idea.

## Quick start

### New project (greenfield)
```bash
npx create-llm-wiki my-wiki
cd my-wiki
```

### Existing project (retrofit)
```bash
cd my-existing-project
npx create-llm-wiki --retrofit --vault-name my-project
```

### With a domain preset
```bash
npx create-llm-wiki my-game --domain game
npx create-llm-wiki my-saas --domain saas
npx create-llm-wiki my-research --domain research
npx create-llm-wiki my-novel --domain novel
```

The CLI:
1. Creates the project directory (or retrofits the current one)
2. Copies all template files (`CLAUDE.md`, `.claude/`, `vault/`, `scripts/`)
3. Applies the chosen domain preset to `wiki-conventions.md`
4. Downloads Dataview and Marp plugins from GitHub releases
5. Checks if Obsidian is installed (optionally installs it via winget/brew)
6. Runs `git init` and commits the initial scaffold

## What gets scaffolded

```
my-wiki/
├── CLAUDE.md                   # schema + Claude Code @imports
├── README.md
├── .gitignore
├── vault/                      # Obsidian vault
│   ├── .obsidian/
│   │   ├── app.json
│   │   ├── core-plugins.json
│   │   ├── community-plugins.json
│   │   └── plugins/
│   │       ├── dataview/       # pre-downloaded
│   │       └── marp/           # pre-downloaded
│   ├── raw/
│   │   ├── sources/            # immutable source documents
│   │   └── assets/             # images (Obsidian attachment folder)
│   └── wiki/
│       ├── index.md            # catalog
│       ├── log.md              # append-only changelog
│       ├── entities/
│       ├── concepts/
│       ├── sources/
│       └── synthesis/
├── .claude/
│   ├── rules/
│   │   ├── wiki-conventions.md    # YAML + page templates
│   │   ├── wiki-auto-load.md      # turn-start read rule
│   │   └── wiki-auto-reflect.md   # turn-end write rule
│   ├── agents/
│   │   └── wiki-maintainer.md     # opus subagent
│   └── skills/
│       ├── ingest/SKILL.md
│       ├── query/SKILL.md
│       ├── lint/SKILL.md
│       └── obsidian-open/SKILL.md
└── scripts/
    ├── obsidian-open.ps1
    └── obsidian-open.sh
```

## The read-modify-write loop

```
┌──────────────────────────────────────────────────────────────┐
│ Turn start  →  wiki-auto-load  →  read index.md + 2-5 pages │
│                                    cite them in reasoning    │
├──────────────────────────────────────────────────────────────┤
│                     Substantive work                         │
│         (code, design, query, investigation, …)              │
├──────────────────────────────────────────────────────────────┤
│ Turn end  →  wiki-auto-reflect  →  new knowledge produced?  │
│                                     yes → file + log + commit│
│                                     no  → skip silently     │
└──────────────────────────────────────────────────────────────┘
```

Both rules are **soft** — the LLM follows them via instructions, not hooks. They skip pure code edits, build/tooling changes, and meta-questions about the wiki itself.

## Commands

| Command | What it does |
| --- | --- |
| `/ingest <path>` | Read a source doc, write a summary, update entities/concepts, refresh index & log |
| `/query <question>` | Answer from the wiki with `[[citations]]`, optionally file as synthesis |
| `/lint` | Health-check for contradictions, stale claims, orphans, missing cross-refs |
| `/obsidian-open <path>` | Launch a wiki page in the running Obsidian app |

Or just describe what you want in natural language — the skills trigger on strong semantic matches.

## CLI options

```
npx create-llm-wiki [project-name] [options]

Options:
  --retrofit              Add to existing project (don't create a new directory)
  --vault-dir <path>      Vault location (default: vault)
  --vault-name <name>     Obsidian vault name (default: project name)
  --scripts-dir <path>    Scripts location (default: scripts)
  --domain <preset>       Domain preset: generic|game|saas|research|novel
  --commit-policy <p>     auto (default) or manual
  --skip-obsidian-check   Don't check for Obsidian installation
  --install-obsidian      Auto-install Obsidian via winget/brew if missing
  --skip-plugins          Don't download Dataview/Marp plugins
  --lang <en|ko|zh-CN|ja> CLI output language
  -y, --yes               Skip all prompts, use defaults
  -h, --help              Show help
  -v, --version           Show version
```

## Prerequisites

| Tool | Required? |
| --- | --- |
| Node.js 18+ | **yes** — CLI uses `util.parseArgs` and global `fetch` |
| git | yes — for scaffold commit |
| Obsidian | yes at use-time (CLI can install it) |
| Claude Code | yes at use-time — this tool scaffolds FOR Claude Code |
| npm | yes — to run `npx create-llm-wiki` |

## Full setup guide

See the full guide for decision trees, file-by-file reference, customization checklist, and common pitfalls:

- [docs/setup-guide.md](docs/setup-guide.md) (English)
- [docs/setup-guide.ko.md](docs/setup-guide.ko.md) (한국어)
- [docs/setup-guide.zh-CN.md](docs/setup-guide.zh-CN.md) (简体中文)
- [docs/setup-guide.ja.md](docs/setup-guide.ja.md) (日本語)

## License

MIT
