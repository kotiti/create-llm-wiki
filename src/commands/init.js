// init command: scaffold a new wiki into a target directory.
import { mkdir, cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { checkObsidian, tryInstallObsidian, printObsidianInstructions } from '../obsidian-installer.js';
import { downloadPlugins } from '../plugin-downloader.js';
import { applyDomainPreset } from '../domain-presets.js';
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

  const templateDir = join(packageRoot, 'template');
  await copyTemplate(templateDir, targetDir, {
    PROJECT_NAME: opts.projectName || 'Wiki',
    VAULT_NAME: opts.vaultName,
    VAULT_DIR: opts.vaultDir,
    SCRIPTS_DIR: opts.scriptsDir,
    COMMIT_POLICY: opts.commitPolicy,
    DOMAIN: opts.domain,
    YEAR: String(new Date().getFullYear()),
    DATE: new Date().toISOString().slice(0, 10),
  });

  await applyDomainPreset(targetDir, opts.domain);

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

async function copyTemplate(src, dest, vars) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    let destName = entry.name;

    // Strip .template suffix and do placeholder replacement on those
    const isTemplate = destName.endsWith('.template');
    if (isTemplate) destName = destName.slice(0, -'.template'.length);

    // Rewrite vault/ and scripts/ directory names if user overrode them
    if (destName === 'vault' && vars.VAULT_DIR !== 'vault') destName = vars.VAULT_DIR;
    if (destName === 'scripts' && vars.SCRIPTS_DIR !== 'scripts') destName = vars.SCRIPTS_DIR;

    const destPath = join(dest, destName);

    if (entry.isDirectory()) {
      await copyTemplate(srcPath, destPath, vars);
    } else if (entry.isFile()) {
      if (isTemplate) {
        const content = await readFile(srcPath, 'utf8');
        const rendered = renderTemplate(content, vars);
        await writeFile(destPath, rendered, 'utf8');
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
