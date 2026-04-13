// create-llm-wiki main entry
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { init } from './commands/init.js';
import { getMessages, detectLang } from './messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

async function readPkg() {
  const raw = await readFile(join(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

export async function run({ values, positionals }) {
  const pkg = await readPkg();
  const lang = values.lang || detectLang();
  const msg = getMessages(lang);

  if (values.version) {
    console.log(`create-llm-wiki ${pkg.version}`);
    return;
  }
  if (values.help) {
    printHelp(msg, pkg.version);
    return;
  }

  // Resolve project name / target
  const projectName = positionals[0];
  if (!projectName && !values.retrofit) {
    console.error(msg.errProjectNameRequired);
    printHelp(msg, pkg.version);
    process.exit(1);
  }

  await init({
    projectName,
    retrofit: values.retrofit,
    vaultDir: values['vault-dir'],
    vaultName: values['vault-name'] || projectName || 'wiki',
    scriptsDir: values['scripts-dir'],
    domain: values.domain,
    commitPolicy: values['commit-policy'],
    skipObsidianCheck: values['skip-obsidian-check'],
    installObsidian: values['install-obsidian'],
    skipPlugins: values['skip-plugins'],
    yes: values.yes,
    lang,
    msg,
    packageRoot,
  });
}

function printHelp(msg, version) {
  console.log(`
create-llm-wiki v${version}

${msg.helpTagline}

${msg.helpUsage}:
  npx create-llm-wiki [project-name] [options]

${msg.helpExamples}:
  npx create-llm-wiki my-wiki
  npx create-llm-wiki my-wiki --domain game
  cd existing-project && npx create-llm-wiki --retrofit

${msg.helpOptions}:
  --retrofit              ${msg.optRetrofit}
  --vault-dir <path>      ${msg.optVaultDir} (default: vault)
  --vault-name <name>     ${msg.optVaultName}
  --scripts-dir <path>    ${msg.optScriptsDir} (default: scripts)
  --domain <preset>       ${msg.optDomain} (generic|game|saas|research|novel)
  --commit-policy <p>     ${msg.optCommitPolicy} (auto|manual)
  --skip-obsidian-check   ${msg.optSkipObsidianCheck}
  --install-obsidian      ${msg.optInstallObsidian}
  --skip-plugins          ${msg.optSkipPlugins}
  --lang <en|ko|zh-CN|ja> ${msg.optLang}
  -y, --yes               ${msg.optYes}
  -h, --help              ${msg.optHelp}
  -v, --version           ${msg.optVersion}

${msg.helpDocs}: https://github.com/kotiti/create-llm-wiki
`);
}
