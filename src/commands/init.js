// init command: scaffold a new wiki into a target directory.
import { mkdir, cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep, posix } from 'node:path';
import { existsSync } from 'node:fs';
import { checkObsidian, tryInstallObsidian, printObsidianInstructions } from '../obsidian-installer.js';
import { downloadPlugins } from '../plugin-downloader.js';
import { applyDomainPreset, getIntentRegex } from '../domain-presets.js';
import { gitInit } from '../git-helper.js';

const VALID_DOMAINS = ['generic', 'game', 'saas', 'research', 'novel'];

export async function init(opts) {
  const { msg, packageRoot } = opts;

  if (!VALID_DOMAINS.includes(opts.domain)) {
    console.error(msg.errUnknownDomain(opts.domain));
    process.exit(1);
  }

  const targetDir = opts.retrofit ? process.cwd() : resolve(process.cwd(), opts.projectName);

  if (!opts.retrofit && existsSync(targetDir)) {
    const entries = await readdir(targetDir).catch(() => []);
    if (entries.length > 0) {
      console.error(msg.errTargetExists(targetDir));
      process.exit(1);
    }
  }

  console.log(`\n${msg.stepScaffold}`);

  // Track whether the user already has a settings.json before we touch anything.
  // Retrofit mode skips existing files during copy, so we'll merge our hooks
  // section into the existing settings.json after the copy step.
  const settingsExistedBeforeCopy = existsSync(join(targetDir, '.claude', 'settings.json'));

  // Build hook command strings per OS, JSON-escaped so they can drop straight
  // into the settings.json.template's "command": "{{...}}" slot without
  // breaking JSON when {{INTENT_REGEX}} or paths contain quotes.
  const isWin = process.platform === 'win32';
  const reflectCmdRaw = isWin
    ? 'powershell -ExecutionPolicy Bypass -File "$CLAUDE_PROJECT_DIR/.claude/hooks/wiki-reflect-check.ps1"'
    : 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/wiki-reflect-check.py"';
  const loadCmdRaw = isWin
    ? 'powershell -ExecutionPolicy Bypass -File "$CLAUDE_PROJECT_DIR/.claude/hooks/wiki-load-check.ps1"'
    : 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/wiki-load-check.py"';

  const intentRegex = getIntentRegex(opts.domain, opts.lang);

  const templateDir = join(packageRoot, 'template');
  const excludeRelPaths = new Set();
  if (opts.noHooks) {
    excludeRelPaths.add(toPosix(join('.claude', 'hooks')));
    excludeRelPaths.add(toPosix(join('.claude', 'settings.json')));
  }

  await copyTemplate(templateDir, targetDir, {
    PROJECT_NAME: opts.projectName || 'Wiki',
    VAULT_NAME: opts.vaultName,
    VAULT_DIR: opts.vaultDir,
    SCRIPTS_DIR: opts.scriptsDir,
    COMMIT_POLICY: opts.commitPolicy,
    DOMAIN: opts.domain,
    YEAR: String(new Date().getFullYear()),
    DATE: new Date().toISOString().slice(0, 10),
    INTENT_REGEX: intentRegex,
    HOOK_CMD_REFLECT: jsonEscape(reflectCmdRaw),
    HOOK_CMD_LOAD: jsonEscape(loadCmdRaw),
  }, opts.retrofit, templateDir, excludeRelPaths);

  await applyDomainPreset(targetDir, opts.domain);

  // Hooks: merge into pre-existing settings.json, or report what we installed.
  if (!opts.noHooks) {
    if (opts.retrofit && settingsExistedBeforeCopy) {
      const merged = await mergeSettingsJsonHooks(packageRoot, targetDir, {
        HOOK_CMD_REFLECT: jsonEscape(reflectCmdRaw),
        HOOK_CMD_LOAD: jsonEscape(loadCmdRaw),
      });
      if (merged) {
        console.log(`  ${msg.stepHooksMerged}`);
      }
    } else {
      console.log(`  ${msg.stepHooksInstalled}`);
    }
  } else {
    console.log(`  ${msg.stepHooksSkipped}`);
  }

  // Handle retrofit: merge CLAUDE.md import lines into existing file instead of overwriting
  if (opts.retrofit) {
    await mergeClaudeMd(targetDir);
  }

  // Obsidian check
  if (!opts.skipObsidianCheck) {
    console.log(`\n${msg.stepObsidianCheck}`);
    const found = await checkObsidian();
    if (found) {
      console.log(msg.stepObsidianFound(found));
    } else {
      console.log(msg.stepObsidianMissing);
      if (opts.installObsidian) {
        console.log(msg.stepObsidianInstall);
        const ok = await tryInstallObsidian();
        if (ok) {
          console.log(msg.stepObsidianInstallSuccess);
        } else {
          console.log(msg.stepObsidianInstallFail);
          printObsidianInstructions(msg);
        }
      } else {
        printObsidianInstructions(msg);
      }
    }
  }

  // Plugin download
  if (!opts.skipPlugins) {
    console.log(`\n${msg.stepPluginsDownload}`);
    const count = await downloadPlugins(join(targetDir, opts.vaultDir, '.obsidian', 'plugins'));
    console.log(msg.stepPluginsDone(count));
  }

  // Git init (greenfield only)
  if (!opts.retrofit) {
    console.log(`\n${msg.stepGitInit}`);
    await gitInit(targetDir);
  }

  console.log(msg.stepDone);
  console.log(msg.nextStepsHeader);
  if (!opts.retrofit) {
    console.log(msg.nextStepCd(opts.projectName));
  }
  console.log(msg.nextStepObsidian);
  console.log(msg.nextStepPlugins);
  console.log(msg.nextStepClaude);
  console.log(msg.nextStepDocs);
}

function toPosix(p) {
  return p.split(sep).join('/');
}

// Escape a string so it can be inserted between double-quotes in a JSON literal.
function jsonEscape(s) {
  return JSON.stringify(s).slice(1, -1);
}

async function copyTemplate(src, dest, vars, retrofit, templateRoot, excludeRelPaths) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);

    // Determine the *output* relative path (post template-name stripping and
    // post vault/scripts dir rewriting) so excludes work the way users expect.
    let outName = entry.name;
    const isTemplate = outName.endsWith('.template');
    if (isTemplate) outName = outName.slice(0, -'.template'.length);
    if (outName === 'vault' && vars.VAULT_DIR !== 'vault') outName = vars.VAULT_DIR;
    if (outName === 'scripts' && vars.SCRIPTS_DIR !== 'scripts') outName = vars.SCRIPTS_DIR;

    const destPath = join(dest, outName);
    const relFromTemplate = toPosix(relative(templateRoot, srcPath));
    const relStrippedTemplate = isTemplate
      ? relFromTemplate.slice(0, -'.template'.length)
      : relFromTemplate;

    if (excludeRelPaths && (excludeRelPaths.has(relFromTemplate) || excludeRelPaths.has(relStrippedTemplate))) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyTemplate(srcPath, destPath, vars, retrofit, templateRoot, excludeRelPaths);
    } else if (entry.isFile()) {
      if (retrofit && existsSync(destPath)) {
        console.log(`  skip (exists): ${destPath}`);
        continue;
      }
      if (isTemplate) {
        const content = await readFile(srcPath, 'utf8');
        const rendered = renderTemplate(content, vars);
        // PowerShell on Windows defaults to the system codepage (e.g. cp949 in
        // Korean Windows). Without a BOM it mis-decodes UTF-8 multibyte
        // characters in the rendered intent regex and the parser fails. The
        // BOM (\uFEFF) makes PowerShell read the file as UTF-8 unambiguously.
        const needsBom = destPath.endsWith('.ps1');
        const finalContent = needsBom && !rendered.startsWith('\uFEFF') ? '\uFEFF' + rendered : rendered;
        await writeFile(destPath, finalContent, 'utf8');
      } else {
        await cp(srcPath, destPath);
      }
    }
  }
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : `{{${key}}}`));
}

async function mergeClaudeMd(targetDir) {
  // Retrofit: if CLAUDE.md already exists, append our @ imports to it instead of overwriting.
  const claudePath = join(targetDir, 'CLAUDE.md');
  const imports = [
    '',
    '<!-- create-llm-wiki: auto-added imports -->',
    '- @.claude/rules/wiki-auto-load.md',
    '- @.claude/rules/wiki-auto-reflect.md',
    '',
  ].join('\n');

  if (existsSync(claudePath)) {
    const existing = await readFile(claudePath, 'utf8');
    if (!existing.includes('wiki-auto-load.md')) {
      await writeFile(claudePath, existing.trimEnd() + '\n' + imports, 'utf8');
    }
  }
  // If retrofit and we created a new CLAUDE.md from template, leave it alone.
}

// In retrofit mode, the template's settings.json was skipped because the user
// already had one. Merge our hooks section into the existing file, deduping by
// command string so re-running retrofit is idempotent.
async function mergeSettingsJsonHooks(packageRoot, targetDir, vars) {
  const settingsPath = join(targetDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return false;

  const templatePath = join(packageRoot, 'template', '.claude', 'settings.json.template');
  if (!existsSync(templatePath)) return false;

  let ourSettings;
  try {
    const raw = await readFile(templatePath, 'utf8');
    const rendered = renderTemplate(raw, vars);
    ourSettings = JSON.parse(rendered);
  } catch {
    return false;
  }

  let existing;
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    // Existing file isn't valid JSON — don't touch it. User has to merge manually.
    return false;
  }

  existing.hooks = existing.hooks || {};
  for (const [eventName, entries] of Object.entries(ourSettings.hooks || {})) {
    existing.hooks[eventName] = existing.hooks[eventName] || [];
    for (const newEntry of entries) {
      const newCmd = newEntry?.hooks?.[0]?.command;
      if (!newCmd) continue;
      const duplicate = existing.hooks[eventName].some((e) =>
        Array.isArray(e?.hooks) && e.hooks.some((h) => h?.command === newCmd)
      );
      if (!duplicate) {
        existing.hooks[eventName].push(newEntry);
      }
    }
  }

  await writeFile(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  return true;
}
