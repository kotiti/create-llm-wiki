# LLM Wiki 设置指南

> 一个将 Obsidian 风格的 LLM 维护 wiki 与 Claude Code 集成到任何项目的实用指南。
>
> **参考**: [Andrej Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
>
> **`create-llm-wiki` CLI 会自动化其中的大部分**。本指南帮助你理解 CLI 产生的内容、如何自定义以及如何改造现有项目。

---

## 0. 这个系统是什么,为什么

**核心思想**:与其让 LLM 在每次查询时从原始源头重新推导知识(RAG),不如维护一个**在会话之间持续累积的 wiki**。当新的源文档进来时,LLM 会更新现有的 entity/concept 页面并维护交叉引用。人类做策展和方向指引,LLM 做簿记。

**实际好处**:
- 知识在会话之间累积(模型权重不变,但外部记忆增长)
- "这个我们之前决定过吧?"的重复发现成本消失
- 设计决策有审计踪迹(`raw/` 原本和 `wiki/` 摘要分离)
- 随时间复利增长(初期稀薄,后期丰富)

---

## 1. 架构 — 3 层 + 2 个方向

### 3 层 (Karpathy gist)
```
raw/       ← 不可变的原始文档 (人类放入, LLM 只读)
   ↓ ingest
wiki/      ← LLM 维护的编译后知识
   ↑ 架构引用
CLAUDE.md  ← 架构 (LLM 如何对待上面两者)
```

### 2 个方向 (load/reflect 循环)
```
[回合开始]  wiki-auto-load    → 读取 index.md + 2-5 页面 → 用作上下文
               ↓
           实质性工作
               ↓
[回合结束]  wiki-auto-reflect → 新知识? → 归档/更新 → append log.md
```

两个方向必须配对。只读 → 陈旧。只写 → 孤立。

---

## 2. 先决条件

| 工具 | 用途 | 必需? |
|---|---|---|
| **Obsidian** (桌面版) | Vault 查看器、图谱视图、插件运行时 | 必需 |
| **Claude Code** | 加载和运行 skills/agents/rules | 必需 |
| **git** | Wiki 就是一个 git 仓库 | 必需 |
| **Node.js 18+** | CLI 运行于 Node; qmd 也需要 (可选) | CLI 必需 |
| **gh CLI** | GitHub 仓库创建和推送 | 可选 |
| **Python 3** | 脚本中的 URL 编码 (有 fallback) | 可选 |

安装检查:
```bash
node --version      # >= 18.0.0
claude --version
git --version
```

---

## 3. 决策树 — 开始前需要做的选择

### Q1: 项目状态?

**Greenfield (新项目)** → § 5
- 没有仓库或空目录
- 可以自由创建任何文件
- 使用: `npx create-llm-wiki my-project`

**Retrofit (现有项目)** → § 6
- 已有 `CLAUDE.md`、`LLM.md`、`.claude/`、`docs/` 等
- 关键原则:不碰现有文件
- 使用: `cd existing-project && npx create-llm-wiki --retrofit`

### Q2: Vault 位置?

| 情况 | 建议 |
|---|---|
| 代码项目占用根目录 (`package.json` 等) | **vault 作为子文件夹** (`vault/`、`wiki-vault/`) |
| 仅 wiki 的仓库 (没有代码) | 仓库根 = vault 根 |
| 改造现有项目 | **vault 作为子文件夹** (保护现有结构) |

**注意**: gist 的示例 (`attachmentFolderPath: raw/assets`) 使用 vault 相对路径,所以即使 vault 是子文件夹,vault 的*内部*结构仍然保持 gist 所描述的样子。

### Q3: 脚本位置?

匹配现有约定:
- 无约定 / 新项目 → `scripts/obsidian-open.{ps1,sh}`
- 现有 `Tools/` 约定 → `Tools/wiki/obsidian-open.{ps1,sh}`
- `bin/`、`tools/`、`utils/` → 按适合的来

通过 `--scripts-dir <path>` 传递。

### Q4: 提交策略?

| 情况 | 策略 |
|---|---|
| 自己的仓库,main 上可自由提交 | **自动提交** (`ingest:`、`wiki(auto):`) |
| 团队仓库,feature 分支,需要审查 | **只暂存**,用户提交 |
| 团队仓库,专门的 wiki 分支 | 在专门的分支上自动提交 |

通过 `--commit-policy auto|manual` 传递。

---

## 4. 完整文件结构

### Vault (wiki 内容)
```
vault/
├── .obsidian/
│   ├── app.json                    ← 附件文件夹固定等
│   ├── core-plugins.json           ← 启用 graph, backlink 等
│   ├── community-plugins.json      ← ["dataview", "marp"]
│   └── plugins/
│       ├── dataview/{main.js, manifest.json, styles.css}
│       └── marp/{main.js, manifest.json}
├── raw/
│   ├── sources/                    ← 不可变源文档
│   └── assets/                     ← 图片 (附件文件夹)
└── wiki/
    ├── index.md                    ← 目录
    ├── log.md                      ← 变更日志
    ├── entities/                   ← 事物: 角色、物品、系统、工具
    ├── concepts/                   ← 概念: 机制、模式、架构
    ├── sources/                    ← 每个 raw 文档的摘要 (1:1)
    └── synthesis/                  ← 跨领域分析、决策
```

### Claude Code 集成 (`.claude/`)
```
.claude/
├── rules/
│   ├── wiki-conventions.md         ← 页面模板 + YAML 架构
│   ├── wiki-auto-load.md           ← 回合开始软规则 (读取)
│   └── wiki-auto-reflect.md        ← 回合结束软规则 (写入)
├── agents/
│   └── wiki-maintainer.md          ← opus 子代理用于大型处理
└── skills/
    ├── ingest/SKILL.md             ← /ingest <path>
    ├── query/SKILL.md              ← /query <question>
    ├── lint/SKILL.md                ← /lint
    └── obsidian-open/SKILL.md      ← 打开页面
```

### 根目录
```
CLAUDE.md                            ← 架构 + @ imports
README.md                            ← 使用指南
scripts/obsidian-open.{ps1,sh}       ← URI 包装器 (或 Tools/wiki/ 等)
```

---

## 5. Greenfield 设置 (新项目)

### 自动 (推荐)
```bash
npx create-llm-wiki my-wiki --domain generic
cd my-wiki
```

然后在 Obsidian 中打开 vault 并启用插件。完成。

### 手动 (如果你想了解发生了什么)

**步骤 1**: 目录结构
```bash
mkdir -p my-wiki/{vault/raw/sources,vault/raw/assets,vault/wiki/{entities,concepts,sources,synthesis},vault/.obsidian/plugins/{dataview,marp},.claude/{rules,agents,skills/{ingest,query,lint,obsidian-open}},scripts}
cd my-wiki
git init -b main
```

**步骤 2**: 下载 Obsidian 插件
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

**步骤 3**: 使用此仓库 `template/` 目录中的模板作为起点来编写文件

**步骤 4**: 按 § 7 自定义

**步骤 5**: 提交 + 推送
```bash
git add -A
git commit -m "chore: scaffold LLM Wiki (Karpathy pattern)"
gh repo create my-wiki --private --source=. --push
```

**步骤 6**: 在 Obsidian 中打开
1. 启动 Obsidian → "Open folder as vault" → `./vault`
2. 命名它 (与 `--vault-name` 或文件夹名匹配)
3. Settings → Community plugins → 关闭限制模式 → 启用 Dataview 和 Marp

---

## 6. Retrofit 设置 (现有项目)

### 步骤 1: 在不破坏任何东西的情况下检查
```bash
cd /path/to/existing-project
git status --short
git branch --show-current
ls -la
cat CLAUDE.md 2>/dev/null
cat LLM.md 2>/dev/null
ls .claude/rules/ .claude/agents/ .claude/skills/ 2>/dev/null
```

检查清单:
- [ ] 现有 `CLAUDE.md` / `LLM.md` — 内容文件还是指针?
- [ ] 现有 `.claude/rules/*.md` — 已定义哪些规则?
- [ ] 现有 `.claude/skills/*/` — 有任何命名冲突吗?
- [ ] 现有 `.claude/agents/*.md` — 有任何命名冲突吗?
- [ ] 现有 `docs/`、`design/` — 文档在哪里?
- [ ] 现有 `scripts/`、`Tools/`、`bin/` — 脚本约定?
- [ ] `.gitignore` — 考虑是否忽略插件二进制

### 步骤 2: 首要原则 — 不要覆盖
- **绝不覆盖**: 现有 `CLAUDE.md`、`LLM.md`、现有 rule/agent/skill 文件
- **避免命名冲突**: 新的 skill/agent 名称不能与现有的冲突
- **最小修改**: 在根 `CLAUDE.md` 附加一两个 `@` 导入 (现有内容保留)

### 步骤 3: 运行 retrofit
```bash
cd /path/to/existing-project
npx create-llm-wiki --retrofit --vault-name my-project --scripts-dir Tools/wiki
```

这会添加 `vault/`、`.claude/rules/wiki-*.md`、`.claude/agents/wiki-maintainer.md`、`.claude/skills/{ingest,query,lint,obsidian-open}/` 和脚本 — 不触碰现有文件。

如果 `CLAUDE.md` 已存在,CLI 会追加 `@ imports` 而不是覆盖:
```markdown
(现有内容)

<!-- create-llm-wiki: auto-added imports -->
- @.claude/rules/wiki-auto-load.md
- @.claude/rules/wiki-auto-reflect.md
```

### 步骤 4: 调整 SKIP 列表
将有自己规则/技能的项目特定工作添加到 `wiki-auto-load.md` 和 `wiki-auto-reflect.md` 的 SKIP 部分。例如:
```
- GameData 表实现 → 现有 skill `gamedata-table-create`
- Protocol enum 构建 → 现有 skill `protocol-enum-build`
- 样式约定 → 现有 rule `csharp-style.md`
```

这可以防止 wiki 与现有工具重叠。

### 步骤 5: 不要自动提交
CLI 在 retrofit 模式下跳过 `git init`。审查 `git status --short`,准备好后再提交。

---

## 7. 自定义清单 (每个项目)

为你的项目调整每一项。不要只是复制。

### 7.1 Vault
- [ ] **Vault 名称** (Obsidian 注册名称,URI 中使用)
  - 默认: 文件夹名。用 `--vault-name` 覆盖。
  - 脚本的 `$Vault` 默认值必须匹配。

### 7.2 Entity/Concept 类别 (`wiki-conventions.md`)
匹配你的领域。CLI 为 `game`、`saas`、`research`、`novel`、`generic` 提供预设。按需扩展或替换。

| 项目类型 | Entity 类别 | Concept 类别 |
|---|---|---|
| 游戏 | character, npc, mob, item, skill, buff, quest, map, costume, pet, currency, tool | architecture, mechanic, combat, progression, economy, social, balance |
| SaaS/Web 应用 | user, role, subscription, plan, integration, webhook, api-endpoint, service | auth, billing, multi-tenancy, rbac, event-sourcing |
| 研究/论文 | paper, author, dataset, model, benchmark, hypothesis, experiment | method, finding, open-question, replication-status, theory |
| 小说/世界观 | character, faction, location, artifact, event, timeline-entry, creature | theme, plot-thread, motif, worldbuilding-rule, magic-system |

### 7.3 源位置
- [ ] 现有的 `docs/` 约定? → `/ingest` skill 接受仓库相对路径。
- [ ] `raw:` frontmatter 字段可以引用 `vault/raw/sources/` 或现有位置。

### 7.4 脚本位置
- [ ] `scripts/` vs `Tools/wiki/` vs `bin/` — 匹配现有约定。
- [ ] 用正确的路径更新 `obsidian-open` skill 的 `SKILL.md`。

### 7.5 提交策略
- [ ] 调整 `wiki-auto-reflect.md` 的 "Commit policy" 部分。
- [ ] 自动提交 vs 只暂存。
- [ ] 提交消息前缀 (`wiki(auto):`、`wiki(ingest):`)。

### 7.6 权威边界 (重要)
- [ ] 代码约定已存在的地方 (`.claude/rules/*.md`、`LLM.md`) → wiki 不得重新定义。
- [ ] 构建/验证流程 → wiki 范围之外。
- [ ] 现有设计文档位置 → 添加到 `wiki-auto-load.md` 的 fallback 路径。

### 7.7 真相来源层次结构
- [ ] 有顶级规范文档吗?如果有,在 `wiki-conventions.md` 中标记为"权威"。
- [ ] 当 wiki 和规范冲突时,谁胜出?

### 7.8 标签词汇
- [ ] 项目特定标签 (例如: `mvp`、`live`、`experimental`、功能名称)。
- [ ] 在 `wiki-conventions.md` 的 "Tags" 部分列出。

### 7.9 `.gitignore`
```gitignore
# Obsidian 用户状态 (保留 vault 配置,丢弃用户状态)
**/.obsidian/workspace
**/.obsidian/workspace.json
**/.obsidian/workspace-mobile.json
**/.obsidian/cache
**/.obsidian/plugins/*/data.json
```

决定是否提交插件二进制 (`main.js`, ~6MB):
- 个人项目 / 每个人都希望预装 → 提交
- 团队仓库 / 避免二进制 → 添加 `**/.obsidian/plugins/` 并在 README 中记录安装步骤

---

## 8. 验证

### 8.1 文件完整性
```bash
find vault -type f -not -path "*.git*" | sort
find .claude -type f | sort
```

### 8.2 Obsidian
- [ ] "Open folder as vault" → `vault` → 打开
- [ ] 文件浏览器显示 `raw/`、`wiki/`
- [ ] Settings → Community plugins → Dataview、Marp 可切换
- [ ] 图谱视图显示空图谱 (正常)

### 8.3 Claude Code
开始新对话:
1. "根据 CLAUDE.md 描述项目" → 准确的项目名和布局
2. `/ingest <测试文件>` → 创建 `vault/wiki/sources/<slug>.md`
3. `/query <任何问题>` → 先读 `vault/wiki/index.md`,然后回答
4. 问一个领域问题 → wiki 自动加载并引用 (auto-load 触发)
5. 讨论设计决策,结束回合 → 在摘要中宣布 auto-reflect

---

## 9. 常见陷阱

### 9.1 架构没有加载
**症状**: 调用了 `/ingest` 但技能没有触发
**原因**: `CLAUDE.md` 通过 markdown 链接引用 (`[rule](path)`) 而不是 `@` 导入
**修复**: 使用 `@.claude/rules/wiki-*.md` — `@` 前缀是 Claude Code 加载文件的方式

### 9.2 auto-reflect 过度或不足
**症状**: 设计讨论没有记录 / 每次代码更改都创建 wiki 文件
**原因**: 触发条件和 SKIP 列表不匹配项目
**修复**: 按项目自定义 SKIP 列表

### 9.3 Obsidian 路径不匹配
**症状**: `obsidian-open` 运行但文件未打开
**原因**: 脚本 `$Vault` 默认值与 Obsidian 中注册的 vault 名称不匹配
**修复**: 确保你在 Obsidian 中打开时选择的 vault 名称与 `--vault-name` 匹配

### 9.4 团队仓库中的插件二进制
**修复**: 将 `**/.obsidian/plugins/` 添加到 `.gitignore`,在 README 中记录安装步骤

### 9.5 覆盖现有 `CLAUDE.md` / `LLM.md`
**修复**: CLI 的 retrofit 模式专门避免这个。如果手动运行,**始终先 `Read` 然后 `Edit` 追加**,永远不要用 `Write` 覆盖。

### 9.6 权威边界模糊
**修复**: 将 wiki 明确限定在领域范围内。在 `wiki-conventions.md` 中声明"wiki 用于领域,代码规则在现有规则文件中"。

### 9.7 Vault 名为 "vault" (难看)
**修复**: 在脚手架时传递 `--vault-name MyProject`,或在 Obsidian 中打开时重命名

### 9.8 陈旧的 wiki
**修复**: 定期运行 `/lint`,特别是在发布和里程碑之前

---

## 10. 设置后维护

### 每周
- 运行一次 `/lint` 检查矛盾和孤立
- 回顾最近的回合结束摘要,查看是否有遗漏的 auto-reflect

### 每月
- 审查 `wiki-conventions.md` 类别 — 反映领域演变
- 浏览 `vault/wiki/log.md` 回顾工作流程
- 检查陈旧页面 (`updated` > 30 天)

### 每季度
- 审查 wiki 架构本身 — 更改类别?调整模板?
- 批量摄取在 `docs/` 中累积的任何新文档

---

## 11. 参考

### 核心
- [Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Obsidian](https://obsidian.md)
- [Claude Code](https://docs.claude.com/claude/claude-code)

### 插件
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — YAML frontmatter 查询 (`v0.5.70`)
- [Marp (for Obsidian)](https://github.com/JichouP/obsidian-marp-plugin) — markdown 幻灯片 (`v1.5.0`)

### 搜索 (可选)
- [qmd](https://github.com/tobi/qmd) — 本地 BM25 + 向量 + LLM 重排搜索 (`@tobilu/qmd`)

### 此仓库
- `template/` — 所有文件模板 (CLI 复制的内容)
- `src/` — CLI 源代码
- `docs/` — 4 种语言的指南

---

_此指南是 LLM Wiki 模式的实用手册。让它活着 — 每次应用到新项目时附加你的学习。_
