# create-llm-wiki

> 为任何项目搭建由 LLM 维护的 Obsidian 知识库 — [Karpathy 的 LLM Wiki 模式](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) + Claude Code 集成。

**Languages**: [English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## 简介

一个 CLI 工具,可将完整的 LLM 维护知识库搭建到任何项目中:

- **Obsidian vault** — 预装 Dataview + Marp 插件
- **Claude Code 技能** — `/ingest`, `/query`, `/lint`, `/obsidian-open` 用于 wiki 操作
- **软规则** — 回合开始时自动加载 wiki 上下文,回合结束时自动反映领域知识
- **Opus 子代理** — 用于集中的簿记工作
- **页面模板和 YAML 架构** — entity, concept, source, synthesis 结构定义
- **领域预设** — 游戏、SaaS、研究、小说或通用项目

Wiki 成为 LLM **在每次实质性任务中活跃上下文的一部分**,并在会话之间累积知识。阅读 [Karpathy 的 gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 了解核心思想。

## 快速开始

### 新项目 (Greenfield)
```bash
npx create-llm-wiki my-wiki
cd my-wiki
```

### 现有项目 (Retrofit)
```bash
cd my-existing-project
npx create-llm-wiki --retrofit --vault-name my-project
```

### 使用领域预设
```bash
npx create-llm-wiki my-game --domain game
npx create-llm-wiki my-saas --domain saas
npx create-llm-wiki my-research --domain research
npx create-llm-wiki my-novel --domain novel
```

CLI 执行的操作:
1. 创建项目目录(或对当前目录进行 retrofit)
2. 复制所有模板文件 (`CLAUDE.md`, `.claude/`, `vault/`, `scripts/`)
3. 将所选的领域预设应用到 `wiki-conventions.md`
4. 从 GitHub releases 下载 Dataview 和 Marp 插件
5. 检查 Obsidian 是否已安装(可选地通过 winget/brew 安装)
6. 运行 `git init` 并提交初始脚手架

## 生成的结构

```
my-wiki/
├── CLAUDE.md                   # 架构 + Claude Code @imports
├── README.md
├── .gitignore
├── vault/                      # Obsidian vault
│   ├── .obsidian/
│   │   ├── app.json
│   │   ├── core-plugins.json
│   │   ├── community-plugins.json
│   │   └── plugins/
│   │       ├── dataview/       # 预下载
│   │       └── marp/           # 预下载
│   ├── raw/
│   │   ├── sources/            # 不可变的源文档
│   │   └── assets/             # 图片 (Obsidian 附件文件夹)
│   └── wiki/
│       ├── index.md            # 目录
│       ├── log.md              # 追加日志
│       ├── entities/
│       ├── concepts/
│       ├── sources/
│       └── synthesis/
├── .claude/
│   ├── rules/
│   │   ├── wiki-conventions.md    # YAML + 页面模板
│   │   ├── wiki-auto-load.md      # 回合开始读取规则
│   │   └── wiki-auto-reflect.md   # 回合结束写入规则
│   ├── agents/
│   │   └── wiki-maintainer.md     # opus 子代理
│   └── skills/
│       ├── ingest/SKILL.md
│       ├── query/SKILL.md
│       ├── lint/SKILL.md
│       └── obsidian-open/SKILL.md
└── scripts/
    ├── obsidian-open.ps1
    └── obsidian-open.sh
```

## 读-改-写循环

```
┌──────────────────────────────────────────────────────────────┐
│ 回合开始  →  wiki-auto-load   →  读取 index.md + 2-5 相关页面│
│                                    在推理中引用              │
├──────────────────────────────────────────────────────────────┤
│                     实质性工作                                │
│         (代码、设计、查询、调查、…)                           │
├──────────────────────────────────────────────────────────────┤
│ 回合结束  →  wiki-auto-reflect  →  产生了新知识吗?          │
│                                     是 → 归档 + 日志 + 提交  │
│                                     否 → 静默跳过           │
└──────────────────────────────────────────────────────────────┘
```

两个规则都是**软规则** — LLM 通过指令遵循它们,而不是 hook。它们跳过纯代码编辑、构建/工具更改以及关于 wiki 本身的元问题。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/ingest <路径>` | 读取源文档、写入摘要、更新 entities/concepts、刷新索引和日志 |
| `/query <问题>` | 从 wiki 回答并带 `[[引用]]`,可选地作为 synthesis 归档 |
| `/lint` | 健康检查:矛盾、过时声明、孤立页面、缺失的交叉引用 |
| `/obsidian-open <路径>` | 在运行中的 Obsidian 应用中打开 wiki 页面 |

或者只用自然语言描述你想要的 — 技能在强语义匹配时触发。

## CLI 选项

```
npx create-llm-wiki [project-name] [options]

选项:
  --retrofit              添加到现有项目(不创建新目录)
  --vault-dir <path>      Vault 位置(默认: vault)
  --vault-name <name>     Obsidian vault 名称(默认: 项目名)
  --scripts-dir <path>    脚本位置(默认: scripts)
  --domain <preset>       领域预设: generic|game|saas|research|novel
  --commit-policy <p>     auto(默认)或 manual
  --skip-obsidian-check   跳过 Obsidian 安装检查
  --install-obsidian      若未找到 Obsidian 则通过 winget/brew 自动安装
  --skip-plugins          不下载 Dataview/Marp 插件
  --lang <en|ko|zh-CN|ja> CLI 输出语言
  -y, --yes               跳过所有提示,使用默认值
  -h, --help              显示帮助
  -v, --version           显示版本
```

## 先决条件

| 工具 | 是否必需? |
| --- | --- |
| Node.js 18+ | **是** — CLI 使用 `util.parseArgs` 和全局 `fetch` |
| git | 是 — 用于脚手架提交 |
| Obsidian | 使用时必需 (CLI 可以安装它) |
| Claude Code | 使用时必需 — 此工具是为 Claude Code 搭建脚手架 |
| npm | 是 — 用于运行 `npx create-llm-wiki` |

## 完整设置指南

查看完整指南,包括决策树、逐文件参考、自定义清单和常见陷阱:

- [docs/setup-guide.md](docs/setup-guide.md) (English)
- [docs/setup-guide.ko.md](docs/setup-guide.ko.md) (한국어)
- [docs/setup-guide.zh-CN.md](docs/setup-guide.zh-CN.md) (简体中文)
- [docs/setup-guide.ja.md](docs/setup-guide.ja.md) (日本語)

## 许可证

MIT
