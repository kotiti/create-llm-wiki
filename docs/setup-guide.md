# LLM Wiki Setup Guide

> A practical guide to setting up an Obsidian-style LLM-maintained wiki with Claude Code integration in any project.
>
> **Reference**: [Andrej Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
>
> **The `create-llm-wiki` CLI automates most of this**. Read this guide to understand what it produces, how to customize it, and how to retrofit it into existing projects.

---

## 0. What this system is, and why

**The core idea**: Instead of the LLM re-deriving knowledge from raw sources on every query (RAG), maintain a **persistent, compounding wiki** that accumulates across sessions. When a new source comes in, the LLM updates existing entity/concept pages and maintains cross-references. The human curates and directs; the LLM does the bookkeeping.

**Practical benefits**:
- Knowledge accumulates across sessions (model weights don't change, but external memory grows)
- The "we decided this before, didn't we?" re-discovery cost disappears
- Audit trail for design decisions (separated `raw/` originals and `wiki/` summaries)
- Compounding value over months (thin at first, rich later)

---

## 1. Architecture — 3 layers + 2 directions

### 3 layers (Karpathy gist)
```
raw/       ← immutable originals (humans drop in, LLM only reads)
   ↓ ingest
wiki/      ← LLM-maintained compiled knowledge
   ↑ schema reference
CLAUDE.md  ← schema (how the LLM should treat the above two)
```

### 2 directions (load/reflect loop)
```
[turn start]  wiki-auto-load    → read index.md + 2-5 pages → use as context
                 ↓
             substantive work
                 ↓
[turn end]    wiki-auto-reflect → new knowledge? → file/update → append log.md
```

Both directions must be paired. Read-only → stale. Write-only → isolated.

---

## 2. Prerequisites

| Tool | Purpose | Required? |
|---|---|---|
| **Obsidian** (desktop) | Vault viewer, graph view, plugin runtime | Required |
| **Claude Code** | Loads skills/agents/rules and runs them | Required |
| **git** | The wiki IS a git repo | Required |
| **Node.js 18+** | CLI runs on Node; also for qmd (optional) | Required for CLI |
| **gh CLI** | GitHub repo creation and push | Optional |
| **Python 3** | URL encoding in scripts (with fallback) | Optional |

Installation check:
```bash
node --version      # >= 18.0.0
claude --version
git --version
```

---

## 3. Decision tree — choices to make before starting

### Q1: Project state?

**Greenfield (new project)** → § 5 Greenfield Setup
- No repo, or empty directory
- Free to create any files
- Use: `npx create-llm-wiki my-project`

**Retrofit (existing project)** → § 6 Retrofit Setup
- Already has `CLAUDE.md`, `LLM.md`, `.claude/`, `docs/`, etc.
- Key principle: don't touch existing files
- Use: `cd existing-project && npx create-llm-wiki --retrofit`

### Q2: Vault location?

| Situation | Recommendation |
|---|---|
| Code project occupies the root (`package.json`, etc.) | **Vault as subfolder** (`vault/`, `wiki-vault/`) |
| Wiki-only repo (no code) | Repo root = vault root |
| Retrofitting existing project | **Vault as subfolder** (protect existing structure) |

**Note**: The gist's example (`attachmentFolderPath: raw/assets`) uses a vault-relative path, so the vault's *internal* structure stays as the gist describes even when vault is a subfolder.

### Q3: Scripts location?

Match existing conventions:
- No convention / new project → `scripts/obsidian-open.{ps1,sh}`
- Existing `Tools/` convention → `Tools/wiki/obsidian-open.{ps1,sh}`
- `bin/`, `tools/`, `utils/` → use whatever fits

Pass via `--scripts-dir <path>`.

### Q4: Commit policy?

| Situation | Policy |
|---|---|
| Your own repo, free commits on main | **Auto-commit** (`ingest:`, `wiki(auto):`) |
| Team repo, feature branch, review required | **Stage only**, user commits |
| Team repo, dedicated wiki branch | Auto-commit on the dedicated branch |

Pass via `--commit-policy auto|manual`.

---

## 4. Full file structure (what gets generated)

### Vault (wiki content)
```
vault/
├── .obsidian/
│   ├── app.json                    ← attachment folder pinned, etc.
│   ├── core-plugins.json           ← graph, backlink, etc. enabled
│   ├── community-plugins.json      ← ["dataview", "marp"]
│   └── plugins/
│       ├── dataview/{main.js, manifest.json, styles.css}
│       └── marp/{main.js, manifest.json}
├── raw/
│   ├── sources/                    ← immutable sources
│   └── assets/                     ← images (attachment folder)
└── wiki/
    ├── index.md                    ← catalog
    ├── log.md                      ← changelog
    ├── entities/                   ← things: characters, items, systems, tools
    ├── concepts/                   ← ideas: mechanics, patterns, architecture
    ├── sources/                    ← one summary per raw doc (1:1)
    └── synthesis/                  ← cross-cutting analyses, decisions
```

### Claude Code integration (`.claude/`)
```
.claude/
├── rules/
│   ├── wiki-conventions.md         ← page templates + YAML schema
│   ├── wiki-auto-load.md           ← turn-start soft rule (read)
│   └── wiki-auto-reflect.md        ← turn-end soft rule (write)
├── agents/
│   └── wiki-maintainer.md          ← opus subagent for big passes
└── skills/
    ├── ingest/SKILL.md             ← /ingest <path>
    ├── query/SKILL.md              ← /query <question>
    ├── lint/SKILL.md                ← /lint
    └── obsidian-open/SKILL.md      ← open a page
```

### Root
```
CLAUDE.md                            ← schema + @ imports
README.md                            ← usage guide
scripts/obsidian-open.{ps1,sh}       ← URI wrapper (or Tools/wiki/ etc.)
```

---

## 5. Greenfield Setup (new project)

### Automated (recommended)
```bash
npx create-llm-wiki my-wiki --domain generic
cd my-wiki
```

Then open the vault in Obsidian and enable plugins. Done.

### Manual (if you want to understand what happens)

**Step 1**: Directory structure
```bash
mkdir -p my-wiki/{vault/raw/sources,vault/raw/assets,vault/wiki/{entities,concepts,sources,synthesis},vault/.obsidian/plugins/{dataview,marp},.claude/{rules,agents,skills/{ingest,query,lint,obsidian-open}},scripts}
cd my-wiki
git init -b main
```

**Step 2**: Download Obsidian plugins
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

**Step 3**: Write files (use the templates in `template/` as a starting point)
- `CLAUDE.md`, `README.md`, `.gitignore`
- `vault/.obsidian/{app.json, core-plugins.json, community-plugins.json}`
- `vault/wiki/index.md`, `vault/wiki/log.md`
- `.claude/rules/{wiki-conventions.md, wiki-auto-load.md, wiki-auto-reflect.md}`
- `.claude/agents/wiki-maintainer.md`
- `.claude/skills/{ingest,query,lint,obsidian-open}/SKILL.md`
- `scripts/obsidian-open.{ps1,sh}`
- `.gitkeep` files in empty directories

**Step 4**: Customize per § 7

**Step 5**: Commit + push
```bash
git add -A
git commit -m "chore: scaffold LLM Wiki (Karpathy pattern)"
gh repo create my-wiki --private --source=. --push
```

**Step 6**: Open in Obsidian
1. Launch Obsidian → "Open folder as vault" → `./vault`
2. Name it (match your `--vault-name` or folder name)
3. Settings → Community plugins → disable restricted mode → enable Dataview & Marp

---

## 6. Retrofit Setup (existing project)

### Step 1: Inspect without breaking anything
```bash
cd /path/to/existing-project
git status --short
git branch --show-current
ls -la
cat CLAUDE.md 2>/dev/null
cat LLM.md 2>/dev/null
ls .claude/rules/ .claude/agents/ .claude/skills/ 2>/dev/null
```

Checklist:
- [ ] Existing `CLAUDE.md` / `LLM.md` — content file or pointer?
- [ ] Existing `.claude/rules/*.md` — what rules already defined?
- [ ] Existing `.claude/skills/*/` — any name collisions?
- [ ] Existing `.claude/agents/*.md` — any name collisions?
- [ ] Existing `docs/`, `design/` — where are documents located?
- [ ] Existing `scripts/`, `Tools/`, `bin/` — script convention?
- [ ] `.gitignore` — consider whether to ignore plugin binaries

### Step 2: The prime directive — don't overwrite
- **Never overwrite**: existing `CLAUDE.md`, `LLM.md`, existing rule/agent/skill files
- **Avoid name collisions**: new skill/agent names must not conflict with existing
- **Minimal touch**: append one or two `@` imports to root `CLAUDE.md` (existing content stays)

### Step 3: Run the retrofit
```bash
cd /path/to/existing-project
npx create-llm-wiki --retrofit --vault-name my-project --scripts-dir Tools/wiki
```

This adds `vault/`, `.claude/rules/wiki-*.md`, `.claude/agents/wiki-maintainer.md`, `.claude/skills/{ingest,query,lint,obsidian-open}/`, and scripts — without touching existing files.

If `CLAUDE.md` already exists, the CLI appends `@ imports` to it instead of overwriting:
```markdown
(existing content)

<!-- create-llm-wiki: auto-added imports -->
- @.claude/rules/wiki-auto-load.md
- @.claude/rules/wiki-auto-reflect.md
```

### Step 4: Adjust SKIP lists
Add project-specific work that has its own rules/skills to the SKIP sections in `wiki-auto-load.md` and `wiki-auto-reflect.md`. Example:
```
- GameData table implementation → existing skill `gamedata-table-create`
- Protocol enum build → existing skill `protocol-enum-build`
- Style conventions → existing rule `csharp-style.md`
```

This prevents the wiki from overlapping with existing tooling.

### Step 5: Don't commit automatically
The CLI skips `git init` in retrofit mode. Review `git status --short`, then commit when ready.

---

## 7. Customization Checklist (per project)

Adjust each item for your project. Don't just copy.

### 7.1 Vault
- [ ] **Vault name** (Obsidian registered name, used in URIs)
  - Default: folder name. Override with `--vault-name`.
  - Script's `$Vault` default must match.

### 7.2 Entity/Concept categories (`wiki-conventions.md`)
Match your domain. The CLI provides presets for `game`, `saas`, `research`, `novel`, `generic`. Extend or replace as needed.

| Project type | Entity categories | Concept categories |
|---|---|---|
| Game | character, npc, mob, item, skill, buff, quest, map, costume, pet, currency, tool | architecture, mechanic, combat, progression, economy, social, balance |
| SaaS/webapp | user, role, subscription, plan, integration, webhook, api-endpoint, service | auth, billing, multi-tenancy, rbac, event-sourcing |
| Research/paper | paper, author, dataset, model, benchmark, hypothesis, experiment | method, finding, open-question, replication-status, theory |
| Novel/worldbuilding | character, faction, location, artifact, event, timeline-entry, creature | theme, plot-thread, motif, worldbuilding-rule, magic-system |

### 7.3 Source location
- [ ] Existing `docs/` convention? → `/ingest` skill accepts repo-relative paths.
- [ ] `raw:` frontmatter field can reference `vault/raw/sources/` OR existing locations (`docs/design/`, etc.).

### 7.4 Scripts location
- [ ] `scripts/` vs `Tools/wiki/` vs `bin/` — match existing convention.
- [ ] Update `obsidian-open` skill's `SKILL.md` with the correct path.

### 7.5 Commit policy
- [ ] Adjust `wiki-auto-reflect.md`'s "Commit policy" section.
- [ ] Auto-commit vs stage-only.
- [ ] Commit message prefix (`wiki(auto):`, `wiki(ingest):`).

### 7.6 Authority boundaries (important)
- [ ] Where code conventions already live (`.claude/rules/*.md`, `LLM.md`) → wiki must NOT redefine.
- [ ] Build/verify processes → outside wiki scope.
- [ ] Existing design doc locations → add to `wiki-auto-load.md` fallback paths.

### 7.7 Source of Truth hierarchy
- [ ] Is there a top-level spec document? If yes, mark it as "authoritative" in `wiki-conventions.md`.
- [ ] When the wiki and the spec conflict, which wins?

### 7.8 Tag vocabulary
- [ ] Project-specific tags (e.g., `mvp`, `live`, `experimental`, feature names).
- [ ] List them in `wiki-conventions.md`'s "Tags" section.

### 7.9 `.gitignore`
```gitignore
# Obsidian user state (keep vault config, drop per-user state)
**/.obsidian/workspace
**/.obsidian/workspace.json
**/.obsidian/workspace-mobile.json
**/.obsidian/cache
**/.obsidian/plugins/*/data.json
```

Decide whether to commit plugin binaries (`main.js`, ~6MB):
- Personal project / everyone wants pre-install → commit
- Team repo / avoid binaries → add `**/.obsidian/plugins/` and document install in README

---

## 8. Verification

### 8.1 File integrity
```bash
find vault -type f -not -path "*.git*" | sort
find .claude -type f | sort

test -f CLAUDE.md && echo "OK: CLAUDE.md"
test -f vault/wiki/index.md && echo "OK: index.md"
test -f .claude/rules/wiki-conventions.md && echo "OK: conventions"
test -f .claude/rules/wiki-auto-load.md && echo "OK: auto-load"
test -f .claude/rules/wiki-auto-reflect.md && echo "OK: auto-reflect"
```

### 8.2 Obsidian
- [ ] "Open folder as vault" → `vault` → opens
- [ ] File explorer shows `raw/`, `wiki/`
- [ ] Settings → Community plugins → Dataview, Marp togglable
- [ ] Graph view shows empty graph (normal)

### 8.3 Claude Code
Start a new conversation:
1. "Describe the project from CLAUDE.md" → accurate project name and layout
2. `/ingest <test-file>` → `vault/wiki/sources/<slug>.md` created
3. `/query <any question>` → reads `vault/wiki/index.md` first, answers
4. Ask a domain question → wiki auto-loaded and cited (auto-load fires)
5. Discuss a design decision, end turn → auto-reflect announcement in summary

### 8.4 Script
```bash
./scripts/obsidian-open.sh wiki/index.md
# Obsidian opens index.md
```

---

## 9. Common Pitfalls

### 9.1 Schema not loading
**Symptom**: `/ingest` invoked but skill doesn't trigger
**Cause**: `CLAUDE.md` references via markdown link (`[rule](path)`) instead of `@` import
**Fix**: Use `@.claude/rules/wiki-*.md` — the `@` prefix is how Claude Code loads the file

### 9.2 auto-reflect too eager / too lazy
**Symptom**: Design discussions not recorded / every code change creates wiki files
**Cause**: Trigger conditions and SKIP list don't match project
**Fix**: Customize SKIP list per project. Game: always reflect balance decisions. SaaS: always reflect billing decisions.

### 9.3 Obsidian path mismatch
**Symptom**: `obsidian-open` runs but file doesn't open
**Cause**: Script `$Vault` default doesn't match the vault name registered in Obsidian
**Fix**: Make sure the vault name you pick when opening matches `--vault-name`

### 9.4 Plugin binaries in team repo
**Symptom**: `main.js` files (~6MB) committed
**Impact**: Repo size grows, may need LFS
**Fix**: Add `**/.obsidian/plugins/` to `.gitignore`, document install steps

### 9.5 Overwriting existing `CLAUDE.md` / `LLM.md`
**Symptom**: Existing team conventions gone after retrofit
**Fix**: The CLI's retrofit mode specifically avoids this. If you run manually, **always `Read` then `Edit` to append**, never `Write` to overwrite.

### 9.6 Authority boundary blurring
**Symptom**: Wiki redefines code conventions that already live in `.claude/rules/`
**Fix**: Explicitly scope the wiki to domain only. State "wiki is for domain, code rules live in existing rule files" in `wiki-conventions.md`.

### 9.7 Vault named "vault" (ugly)
**Symptom**: Obsidian tab shows "vault - wiki/..."
**Fix**: Pass `--vault-name MyProject` when scaffolding, or rename when opening in Obsidian

### 9.8 Stale wiki
**Symptom**: Wiki reflects turn-3 decisions, code has moved to turn-10
**Fix**: Run `/lint` periodically, especially before releases and milestones

---

## 10. Post-setup maintenance

### Weekly
- Run `/lint` once to check for contradictions and orphans
- Review recent turn-end summaries for missed auto-reflects

### Monthly
- Review `wiki-conventions.md` categories — reflect domain evolution
- Browse `vault/wiki/log.md` to retrospect work flow
- Check stale pages (`updated` > 30 days)

### Quarterly
- Review the wiki schema itself — change categories? adjust templates?
- Bulk-ingest any new documents that accumulated in `docs/`

---

## 11. References

### Core
- [Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Obsidian](https://obsidian.md)
- [Claude Code](https://docs.claude.com/claude/claude-code)

### Plugins
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — YAML frontmatter queries (`v0.5.70`)
- [Marp (for Obsidian)](https://github.com/JichouP/obsidian-marp-plugin) — markdown slide decks (`v1.5.0`)
- [Obsidian Web Clipper](https://obsidian.md/clipper) — browser → markdown

### Search (optional)
- [qmd](https://github.com/tobi/qmd) — local BM25 + vector + LLM reranking search (`@tobilu/qmd`)
  ```bash
  npm install -g @tobilu/qmd
  qmd collection add vault/wiki --name my-wiki
  qmd embed
  qmd query "any question"
  ```

---

## 12. Quick Reference (one-page summary)

```
Install    : Obsidian + Claude Code + Node 18+ (+ optional: gh, qmd)
Structure  : vault/{raw,wiki,.obsidian}/ + .claude/{rules,agents,skills}/ + scripts/
Key files  : CLAUDE.md (@ imports)
             .claude/rules/wiki-conventions.md (domain-specific categories)
             .claude/rules/wiki-auto-load.md   (turn-start read)
             .claude/rules/wiki-auto-reflect.md (turn-end write)
             .claude/skills/{ingest,query,lint,obsidian-open}/SKILL.md
Commands   : /ingest <path>   → file a source into the wiki
             /query <question> → answer from the wiki (synthesis optional)
             /lint             → health check
             natural language  → also works
Automatic  : auto-load  = silently read relevant pages at turn start
             auto-reflect = file domain knowledge at turn end
             (both skip pure code edits and build/tooling work)
Customize  :
  1. Entity/Concept categories (domain-dependent)
  2. SKIP lists (respect existing skills/rules)
  3. Source paths (vault/raw/ vs existing docs/)
  4. Scripts location (scripts/ vs Tools/wiki/)
  5. Commit policy (auto vs stage-only)
  6. Vault name (Obsidian registered name)
  7. Authority boundaries (wiki scope explicit)
  8. Tag vocabulary
Never:
  - Overwrite existing CLAUDE.md/LLM.md
  - Let wiki redefine code conventions
  - Modify raw/
  - Reflect on every code edit
Verify:
  1. Obsidian opens vault + plugins togglable
  2. /ingest works
  3. Domain question → auto-loaded
  4. Design discussion → auto-reflect announced
```

---

_This guide is a practical manual for the LLM Wiki pattern. Let it live — append learnings as you apply it to new projects._
