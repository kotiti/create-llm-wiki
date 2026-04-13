import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export async function gitInit(cwd) {
  try {
    await exec('git', ['init', '-b', 'main'], cwd);
    await exec('git', ['add', '-A'], cwd);
    await exec('git', ['-c', 'user.email=scaffold@create-llm-wiki', '-c', 'user.name=create-llm-wiki',
                       'commit', '-m', 'chore: scaffold LLM Wiki (Karpathy pattern)'], cwd);
  } catch (err) {
    // Not fatal — user may not have git, or may not want commits
    console.log(`  git init skipped: ${err.message}`);
  }
}

function exec(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    // Do NOT use shell: true here — git handles spaces in args fine when shell is disabled,
    // and shell: true on Windows re-parses the commit message and breaks quoted strings.
    const winCmd = platform() === 'win32' && cmd === 'git' ? 'git.exe' : cmd;
    const proc = spawn(winCmd, args, { cwd, stdio: 'pipe', shell: false });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
}
