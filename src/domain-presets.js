// Domain presets customize wiki-conventions.md with domain-specific entity/concept categories.
// They also provide intent keywords for the auto-load/auto-reflect hook scripts.
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
    intentKeywords: {
      en: ['design', 'spec', 'specify', 'decide', 'decision', 'tradeoff', 'architecture', 'system', 'requirement', 'rationale', 'why does', 'how does', 'should we'],
      ko: ['디자인', '설계', '결정', '판단', '근거', '아키텍처', '시스템', '요구사항', '왜', '어떻게'],
      ja: ['設計', '決定', '判断', 'アーキテクチャ', 'システム', '要件', 'なぜ', 'どのように'],
      'zh-CN': ['设计', '决定', '判断', '架构', '系统', '需求', '为什么', '如何'],
    },
  },
  game: {
    entityCategories: ['character', 'npc', 'mob', 'item', 'skill', 'buff', 'quest', 'map', 'stage', 'currency', 'tool'],
    entityExample: 'mob',
    conceptCategories: ['architecture', 'mechanic', 'combat', 'progression', 'economy', 'social', 'balance', 'design-pattern'],
    conceptExample: 'mechanic',
    tagVocab: ['mvp', 'live', 'experimental', 'balance', 'client', 'server', 'shared'],
    intentKeywords: {
      en: ['design', 'spec', 'balance', 'tune', 'tuning', 'progression', 'economy', 'mechanic', 'character', 'npc', 'mob', 'item', 'skill', 'quest', 'lore', 'combat', 'tradeoff', 'meta', 'gameplay'],
      ko: ['디자인', '기획', '설계', '밸런스', '밸런싱', '튜닝', '조정', '성장', '진행도', '경제', '메카닉', '캐릭터', '몬스터', '아이템', '스킬', '퀘스트', '전투', '게임플레이'],
      ja: ['設計', 'バランス', '調整', '成長', '進行度', 'メカニクス', 'キャラクター', 'モンスター', 'アイテム', 'スキル', 'クエスト', '戦闘'],
      'zh-CN': ['设计', '平衡', '调整', '成长', '进度', '机制', '角色', '怪物', '物品', '技能', '任务', '战斗'],
    },
  },
  saas: {
    entityCategories: ['user', 'role', 'subscription', 'plan', 'integration', 'webhook', 'api-endpoint', 'service', 'job'],
    entityExample: 'user',
    conceptCategories: ['auth', 'billing', 'multi-tenancy', 'rbac', 'event-sourcing', 'architecture', 'api-contract'],
    conceptExample: 'auth',
    tagVocab: ['mvp', 'beta', 'ga', 'enterprise', 'breaking'],
    intentKeywords: {
      en: ['design', 'spec', 'plan', 'pricing', 'billing', 'subscription', 'tenant', 'tenancy', 'role', 'permission', 'rbac', 'integration', 'webhook', 'api contract', 'sla', 'requirement', 'tradeoff', 'flow'],
      ko: ['디자인', '설계', '플랜', '요금제', '과금', '구독', '테넌트', '권한', '통합', '웹훅', 'API 계약', '요구사항', '플로우'],
      ja: ['設計', '料金', '課金', 'サブスクリプション', 'テナント', '権限', '統合', 'API契約', '要件', 'フロー'],
      'zh-CN': ['设计', '定价', '计费', '订阅', '租户', '权限', '集成', '需求', '流程'],
    },
  },
  research: {
    entityCategories: ['paper', 'author', 'dataset', 'model', 'benchmark', 'hypothesis', 'experiment', 'tool'],
    entityExample: 'paper',
    conceptCategories: ['method', 'finding', 'open-question', 'replication-status', 'theory'],
    conceptExample: 'method',
    tagVocab: ['reviewed', 'pending', 'contradicts', 'supports', 'seminal'],
    intentKeywords: {
      en: ['paper', 'hypothesis', 'experiment', 'finding', 'replicate', 'replication', 'cite', 'citation', 'dataset', 'benchmark', 'theory', 'method', 'methodology', 'ablation', 'baseline', 'related work'],
      ko: ['논문', '가설', '실험', '결과', '재현', '인용', '데이터셋', '벤치마크', '이론', '방법론', '베이스라인', '관련 연구'],
      ja: ['論文', '仮説', '実験', '結果', '再現', '引用', 'データセット', 'ベンチマーク', '理論', '方法論', '関連研究'],
      'zh-CN': ['论文', '假设', '实验', '结果', '复现', '引用', '数据集', '基准', '理论', '方法', '相关工作'],
    },
  },
  novel: {
    entityCategories: ['character', 'faction', 'location', 'artifact', 'event', 'timeline-entry', 'creature'],
    entityExample: 'character',
    conceptCategories: ['theme', 'plot-thread', 'motif', 'worldbuilding-rule', 'magic-system'],
    conceptExample: 'theme',
    tagVocab: ['draft', 'canon', 'retcon', 'foreshadow'],
    intentKeywords: {
      en: ['character', 'plot', 'scene', 'chapter', 'theme', 'motif', 'lore', 'worldbuilding', 'magic', 'faction', 'history', 'timeline', 'arc', 'foreshadow', 'canon'],
      ko: ['캐릭터', '인물', '플롯', '장면', '챕터', '테마', '모티프', '설정', '세계관', '마법', '진영', '역사', '연대기', '복선'],
      ja: ['キャラクター', '人物', 'プロット', 'シーン', '章', 'テーマ', '設定', '世界観', '魔法', '勢力', '歴史', '伏線'],
      'zh-CN': ['角色', '人物', '情节', '场景', '章节', '主题', '设定', '世界观', '魔法', '势力', '历史', '伏笔'],
    },
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

// Build a regex alternation string from preset intent keywords for English + the
// user's CLI locale. Used by the hook script templates ({{INTENT_REGEX}}).
// Keywords are kept simple (alphanumeric / CJK) so no regex escaping is needed.
export function getIntentRegex(domain, lang = 'en') {
  const preset = PRESETS[domain] || PRESETS.generic;
  const en = preset.intentKeywords?.en || [];
  const localized = lang !== 'en' ? preset.intentKeywords?.[lang] || [] : [];
  const all = Array.from(new Set([...en, ...localized]));
  return all.join('|');
}
