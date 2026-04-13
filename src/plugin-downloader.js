// Download Obsidian community plugins (Dataview, Marp) from GitHub releases.
// Zero-dep: uses Node 18+ global fetch.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PLUGINS = [
  {
    id: 'dataview',
    version: '0.5.70',
    files: [
      { name: 'main.js',      url: 'https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/main.js' },
      { name: 'manifest.json', url: 'https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/manifest.json' },
      { name: 'styles.css',   url: 'https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/styles.css' },
    ],
  },
  {
    id: 'marp',
    version: '1.5.0',
    files: [
      { name: 'main.js',      url: 'https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/main.js' },
      { name: 'manifest.json', url: 'https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/manifest.json' },
    ],
  },
];

export async function downloadPlugins(pluginsDir) {
  let count = 0;
  for (const plugin of PLUGINS) {
    const dir = join(pluginsDir, plugin.id);
    await mkdir(dir, { recursive: true });
    for (const file of plugin.files) {
      const destPath = join(dir, file.name);
      try {
        const buf = await downloadFile(file.url);
        await writeFile(destPath, buf);
        count += 1;
      } catch (err) {
        console.error(`  failed to download ${file.url}: ${err.message}`);
      }
    }
  }
  return count;
}

async function downloadFile(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
