# TODO / Handoff Notes

> Pick up here when continuing work on `create-llm-wiki` from another machine or session.
>
> **Location**: `D:\create-llm-wiki\` (local git, no remote yet)
> **Status**: v0.1.0 scaffold complete, 43 files, committed (`6a1f170`), smoke-tested, not published.

---

## Status snapshot

- ✅ Zero-dep CLI works: `node bin/cli.js --version` → `create-llm-wiki 0.1.0`
- ✅ `--help` output works in 4 languages (en/ko/zh-CN/ja)
- ✅ End-to-end smoke test: scaffolded a `game` domain project to `/tmp/smoke-test`, template placeholders replaced, git init + initial commit worked
- ✅ All 8 JS files pass `node -c` syntax check
- ⏸️ **Not yet**: GitHub remote, npm publish, package.json `OWNER` replaced, interactive prompts, filled `examples/`, CI

---

## Immediate next steps

### 1. Replace `OWNER` in package.json and READMEs
Before pushing, pick a GitHub username/org and replace `OWNER` everywhere:
```bash
cd D:\create-llm-wiki
# Search first to see all spots:
grep -rn "OWNER" --include="*.json" --include="*.md"
# Then replace. Affects: package.json (3 urls) + all 4 READMEs (links)
```
Files with `OWNER`:
- `package.json` — `repository.url`, `bugs.url`, `homepage`
- `README.md`, `README.ko.md`, `README.zh-CN.md`, `README.ja.md` — header attribution line
- `template/README.md.template` — also has `OWNER` placeholder (used by scaffolded projects)
- `docs/setup-guide.*.md` — check for remaining refs

### 2. Create GitHub repo and push
Recommended repo name: **`create-llm-wiki`** (matches npm convention).
```bash
cd D:\create-llm-wiki
gh repo create create-llm-wiki --public \
  --source=. --push \
  --description "Scaffold an LLM-maintained Obsidian wiki into any project (Karpathy's LLM Wiki pattern + Claude Code integration)"
```
Public is recommended for discoverability, but private is fine if you want to iterate before sharing.

### 3. npm publish (first time)
```bash
cd D:\create-llm-wiki
npm login                    # one-time; uses your npm credentials
npm publish --access public  # first publish
```
**Before publishing, verify**:
- `package.json` `name` is not taken: https://www.npmjs.com/package/create-llm-wiki
  - If taken, rename to `@<scope>/create-llm-wiki` or similar and update `bin` name in `package.json`
- `files` field in `package.json` already restricts what gets published (good)
- Run `npm pack --dry-run` to see exactly what will be shipped

After first publish, `npx create-llm-wiki my-project` works globally.

### 4. Tag the release
```bash
git tag v0.1.0
git push --tags
gh release create v0.1.0 --title "v0.1.0" --notes "Initial release — greenfield + retrofit scaffolding, 5 domain presets, 4 languages, Obsidian auto-install, plugin pre-download"
```

---

## Known minor issues to fix before v0.2.0

### Cross-platform git commit (fixed but verify on macOS/Linux)
`src/git-helper.js` was originally using `shell: true` on Windows, which re-parsed the commit message and split on spaces. Fixed by using `shell: false` and directly calling `git.exe` on win32. **Needs verification on macOS/Linux** — the fix should be portable but wasn't tested on those platforms.

### CRLF warnings on Windows
Git prints "LF will be replaced by CRLF" warnings on every commit on Windows. Consider adding a `.gitattributes` file:
```
* text=auto eol=lf
*.ps1 text eol=crlf
```

### Plugin download errors are silent
`src/plugin-downloader.js` logs individual file failures but the `count` still counts partial successes. Consider returning `{ success: N, failed: [...] }` and warning the user if any failed.

### `PATHEXT` parsing in obsidian-installer `which()`
Line 13 of `src/obsidian-installer.js` splits `PATHEXT` without the leading dot. Should work but worth a sanity check on Windows.

---

## v0.2.0 candidate features

### Interactive prompts (currently all flags/defaults)
Use Node's `readline/promises` to add interactive prompts when args are missing:
- Project name (if not provided and not `--retrofit`)
- Greenfield vs retrofit
- Domain preset
- Vault location / scripts location
- Commit policy
- Install Obsidian? (if not found)

Skip prompts when `--yes` is passed. Keep flags fully working for CI / automated use.

### Filled `examples/`
Two concrete example vaults showing what a "lived-in" wiki looks like:
- `examples/game-mvp/` — 10-15 wiki pages for a small game: a few entities (character, mob, item), a few concepts (combat loop, economy), 2-3 source pages, 1-2 synthesis pages
- `examples/research-notes/` — academic research wiki example: 3-5 paper sources, a few concept pages on methods, 1 synthesis comparing approaches

These show new users what to aim for without having to ingest anything first.

### Tests
Minimal smoke test using Node's built-in test runner:
```js
// test/smoke.test.js
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('scaffold greenfield project', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'llmwiki-'));
  const result = spawnSync('node', [
    'bin/cli.js', 'test-project',
    '--skip-plugins', '--skip-obsidian-check', '--domain', 'generic',
  ], { cwd: '.', stdio: 'pipe' });
  // assertions on result.status, files existing, etc.
  rmSync(tmp, { recursive: true, force: true });
});
```

### CI (GitHub Actions)
`.github/workflows/test.yml` — run `node --test` on Node 18, 20, 22 on ubuntu-latest, macos-latest, windows-latest.

### Domain preset extensibility
Currently presets are hardcoded in `src/domain-presets.js`. Consider reading from `template/presets/<name>.json` so users can contribute new presets via PR without touching JS.

### Optional `--install-claude-code`
If Claude Code isn't installed, offer to install it. Detection is harder since Claude Code is newer — check for `claude` binary in PATH.

### Uninstall / rollback
`npx create-llm-wiki --uninstall` that removes wiki-specific files from a retrofit project (useful if user wants to abandon the experiment).

---

## Implementation constraints (do NOT break)

- **Zero runtime dependencies**. Uses only Node 18+ built-ins: `util.parseArgs`, global `fetch`, `fs/promises`, `path`, `os`, `child_process`, `readline/promises`, `url`. This is a hard constraint — do not add `chalk`, `commander`, `prompts`, `inquirer`, etc. Keeps `npx` cold-start fast and removes supply chain risk.
- **Node 18+ minimum**. `util.parseArgs` requires 18.3+ and global `fetch` is 18.0+. Set in `package.json` `engines`.
- **No network calls during scaffold except plugin downloads** (`--skip-plugins` disables even those). The CLI must work offline if `--skip-plugins` is passed.
- **Retrofit mode must never overwrite existing files**. Use `Edit`-style append for `CLAUDE.md`, check `existsSync` for everything else.

---

## Key files to know

| Purpose | File |
|---|---|
| CLI entry | `bin/cli.js` |
| Main flow | `src/index.js` |
| Scaffold logic | `src/commands/init.js` |
| i18n | `src/messages.js` |
| Obsidian detect/install | `src/obsidian-installer.js` |
| Plugin download | `src/plugin-downloader.js` |
| Domain presets | `src/domain-presets.js` |
| Git init helper | `src/git-helper.js` |
| Template files | `template/**` |
| Docs | `docs/setup-guide.*.md` + root `README.*.md` |

---

## Related local references (for my own memory, not users)

- `D:\ProjectMMO\` — greenfield reference implementation, already pushed to `github.com/kotiti/ProjectMMO`
- `D:\Wanted\virgame\` — retrofit reference, local only, on `feature/villain-company-base` branch
- `D:\llm-wiki-guide\llm-wiki-setup-guide.md` — original Korean setup guide draft; `create-llm-wiki/docs/setup-guide.ko.md` is the cleaned-up version

These are the projects I extracted the pattern from. Do NOT reference them in public files (READMEs, docs) — they're private. The scaffold and docs already have those references scrubbed.

---

_Last updated: 2026-04-13 by create-llm-wiki v0.1.0 scaffold session._
