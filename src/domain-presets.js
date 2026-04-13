// Domain presets customize wiki-conventions.md with domain-specific entity/concept categories.
// The template ships with generic placeholders; this file replaces them after copy.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PRESETS = {
  generic: {
    entityCategories: ['thing', 'person', 'tool', 'system', 'artifact'],
    entityExample: 'thing',
    conceptCategories: ['concept', 'pattern', 'process', 'decision'],
    conceptExample: 'pattern',
    tagVocab: ['mvp', 'draft', 'stable', 'deprecated'],
  },
  game: {
    entityCategories: ['character', 'npc', 'mob', 'item', 'skill', 'buff', 'quest', 'map', 'stage', 'currency', 'tool'],
    entityExample: 'mob',
    conceptCategories: ['architecture', 'mechanic', 'combat', 'progression', 'economy', 'social', 'balance', 'design-pattern'],
    conceptExample: 'mechanic',
    tagVocab: ['mvp', 'live', 'experimental', 'balance', 'client', 'server', 'shared'],
  },
  saas: {
    entityCategories: ['user', 'role', 'subscription', 'plan', 'integration', 'webhook', 'api-endpoint', 'service', 'job'],
    entityExample: 'user',
    conceptCategories: ['auth', 'billing', 'multi-tenancy', 'rbac', 'event-sourcing', 'architecture', 'api-contract'],
    conceptExample: 'auth',
    tagVocab: ['mvp', 'beta', 'ga', 'enterprise', 'breaking'],
  },
  research: {
    entityCategories: ['paper', 'author', 'dataset', 'model', 'benchmark', 'hypothesis', 'experiment', 'tool'],
    entityExample: 'paper',
    conceptCategories: ['method', 'finding', 'open-question', 'replication-status', 'theory'],
    conceptExample: 'method',
    tagVocab: ['reviewed', 'pending', 'contradicts', 'supports', 'seminal'],
  },
  novel: {
    entityCategories: ['character', 'faction', 'location', 'artifact', 'event', 'timeline-entry', 'creature'],
    entityExample: 'character',
    conceptCategories: ['theme', 'plot-thread', 'motif', 'worldbuilding-rule', 'magic-system'],
    conceptExample: 'theme',
    tagVocab: ['draft', 'canon', 'retcon', 'foreshadow'],
  },
};

export async function applyDomainPreset(targetDir, domain) {
  const preset = PRESETS[domain] || PRESETS.generic;
  const conventionsPath = join(targetDir, '.claude', 'rules', 'wiki-conventions.md');
  if (!existsSync(conventionsPath)) return;

  let content = await readFile(conventionsPath, 'utf8');
  content = content
    .replace(/\{\{ENTITY_CATEGORIES\}\}/g, preset.entityCategories.join(' | '))
    .replace(/\{\{ENTITY_EXAMPLE\}\}/g, preset.entityExample)
    .replace(/\{\{CONCEPT_CATEGORIES\}\}/g, preset.conceptCategories.join(' | '))
    .replace(/\{\{CONCEPT_EXAMPLE\}\}/g, preset.conceptExample)
    .replace(/\{\{TAG_VOCAB\}\}/g, preset.tagVocab.map((t) => '`' + t + '`').join(', '));
  await writeFile(conventionsPath, content, 'utf8');
}
