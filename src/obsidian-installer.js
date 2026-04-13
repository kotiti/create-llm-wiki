// Obsidian detection and (optional) installation.
// Zero-dep, platform-aware.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { spawn } from 'node:child_process';

function which(cmd) {
  // Minimal cross-platform which(1). Returns the first path that exists, or null.
  const envPath = process.env.PATH || '';
  const sep = platform() === 'win32' ? ';' : ':';
  const exts = platform() === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of envPath.split(sep)) {
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

export async function checkObsidian() {
  const plat = platform();

  if (plat === 'win32') {
    const candidates = [
      join(homedir(), 'AppData', 'Local', 'Programs', 'Obsidian', 'Obsidian.exe'),
      join(homedir(), 'AppData', 'Local', 'Obsidian', 'Obsidian.exe'),
      'C:\\Program Files\\Obsidian\\Obsidian.exe',
      'C:\\Program Files (x86)\\Obsidian\\Obsidian.exe',
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  if (plat === 'darwin') {
    const appPath = '/Applications/Obsidian.app';
    if (existsSync(appPath)) return appPath;
    return null;
  }

  // linux
  const binInPath = which('obsidian');
  if (binInPath) return binInPath;
  const linuxCandidates = [
    join(homedir(), '.local', 'bin', 'obsidian'),
    join(homedir(), 'Applications', 'Obsidian.AppImage'),
    '/opt/Obsidian/obsidian',
    '/usr/bin/obsidian',
    '/usr/local/bin/obsidian',
    '/snap/bin/obsidian',
  ];
  for (const p of linuxCandidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function tryInstallObsidian() {
  const plat = platform();
  try {
    if (plat === 'win32' && which('winget')) {
      await exec('winget', [
        'install',
        '--id', 'Obsidian.Obsidian',
        '-e',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ]);
      return true;
    }
    if (plat === 'darwin' && which('brew')) {
      await exec('brew', ['install', '--cask', 'obsidian']);
      return true;
    }
    // linux: no reliable universal installer — we print instructions instead
    return false;
  } catch {
    return false;
  }
}

export function printObsidianInstructions(msg) {
  const plat = platform();
  console.log('');
  if (plat === 'win32') {
    console.log('  ' + msg.obsidianInstallWinget);
  } else if (plat === 'darwin') {
    console.log('  ' + msg.obsidianInstallBrew);
  } else {
    console.log('  ' + msg.obsidianInstallLinux);
  }
  console.log('  ' + msg.obsidianInstallManual);
}

function exec(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: platform() === 'win32' });
    proc.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}
