# create-llm-wiki

> 어느 프로젝트에든 LLM이 관리하는 Obsidian 위키를 셋업하는 CLI — [Karpathy의 LLM Wiki 패턴](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) + Claude Code 통합.

**Languages**: [English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## 개요

어느 프로젝트에든 LLM이 관리하는 완전한 지식 베이스를 셋업하는 CLI 도구입니다:

- **Obsidian vault** — Dataview + Marp 플러그인 사전 설치
- **Claude Code 스킬** — `/ingest`, `/query`, `/lint`, `/obsidian-open` 위키 연산
- **소프트 룰** — 턴 시작 시 위키 자동 로드, 턴 종료 시 도메인 지식 자동 반영
- **훅 안전망** (Stop + UserPromptSubmit) — 소프트 룰 판단이 누락될 때 LLM 에 reminder 주입. `--no-hooks` 로 옵트아웃
- **Opus 서브에이전트** — 집중적인 bookkeeping 작업용
- **페이지 템플릿과 YAML 스키마** — entity, concept, source, synthesis 구조 정의
- **도메인 프리셋** — 게임, SaaS, 연구, 소설, 또는 범용 프로젝트

위키가 모든 substantive 작업에서 **LLM의 활성 컨텍스트의 일부**가 되고, 세션 간에 지식이 누적됩니다. 동기와 원리는 [Karpathy의 gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)를 참고하세요.

## 빠른 시작

### 새 프로젝트 (Greenfield)
```bash
npx create-llm-wiki my-wiki
cd my-wiki
```

### 기존 프로젝트 (Retrofit)
```bash
cd my-existing-project
npx create-llm-wiki --retrofit --vault-name my-project
```

### 도메인 프리셋과 함께
```bash
npx create-llm-wiki my-game --domain game
npx create-llm-wiki my-saas --domain saas
npx create-llm-wiki my-research --domain research
npx create-llm-wiki my-novel --domain novel
```

CLI가 수행하는 작업:
1. 프로젝트 디렉토리 생성 (또는 현재 디렉토리 retrofit)
2. 모든 템플릿 파일 복사 (`CLAUDE.md`, `.claude/`, `vault/`, `scripts/`)
3. 선택한 도메인 프리셋을 `wiki-conventions.md`에 적용
4. GitHub releases에서 Dataview와 Marp 플러그인 다운로드
5. Obsidian 설치 확인 (옵션으로 winget/brew 경유 설치)
6. `git init` 및 초기 커밋

## 생성되는 구조

```
my-wiki/
├── CLAUDE.md                   # 스키마 + Claude Code @imports
├── README.md
├── .gitignore
├── vault/                      # Obsidian vault
│   ├── .obsidian/
│   │   ├── app.json
│   │   ├── core-plugins.json
│   │   ├── community-plugins.json
│   │   └── plugins/
│   │       ├── dataview/       # 사전 다운로드됨
│   │       └── marp/           # 사전 다운로드됨
│   ├── raw/
│   │   ├── sources/            # 불변 소스 문서
│   │   └── assets/             # 이미지 (Obsidian 첨부폴더)
│   └── wiki/
│       ├── index.md            # 카탈로그
│       ├── log.md              # 변경 이력
│       ├── entities/
│       ├── concepts/
│       ├── sources/
│       └── synthesis/
├── .claude/
│   ├── rules/
│   │   ├── wiki-conventions.md    # YAML + 페이지 템플릿
│   │   ├── wiki-auto-load.md      # 턴 시작 읽기 룰
│   │   └── wiki-auto-reflect.md   # 턴 종료 쓰기 룰
│   ├── hooks/                     # 안전망 훅 (--no-hooks 시 생략)
│   │   ├── wiki-reflect-check.ps1 # Stop 훅 (Windows)
│   │   ├── wiki-reflect-check.py  # Stop 훅 (Unix)
│   │   ├── wiki-load-check.ps1    # UserPromptSubmit 훅 (Windows)
│   │   └── wiki-load-check.py     # UserPromptSubmit 훅 (Unix)
│   ├── settings.json              # Claude Code 에 훅 등록
│   ├── agents/
│   │   └── wiki-maintainer.md     # opus 서브에이전트
│   └── skills/
│       ├── ingest/SKILL.md
│       ├── query/SKILL.md
│       ├── lint/SKILL.md
│       └── obsidian-open/SKILL.md
└── scripts/
    ├── obsidian-open.ps1
    └── obsidian-open.sh
```

## Read-modify-write 루프

```
┌──────────────────────────────────────────────────────────────┐
│ 턴 시작  →  wiki-auto-load  →  index.md + 관련 2-5 페이지 읽음│
│                                 추론 시 인용                  │
├──────────────────────────────────────────────────────────────┤
│                     실제 작업                                 │
│         (코드, 설계, 질의, 조사, …)                           │
├──────────────────────────────────────────────────────────────┤
│ 턴 종료  →  wiki-auto-reflect  →  새 지식 생겼나?            │
│                                    예 → 파일 + 로그 + 커밋   │
│                                    아니오 → 조용히 스킵     │
└──────────────────────────────────────────────────────────────┘
```

두 룰 모두 **소프트 룰** — LLM이 instruction으로 따르며 강제 메커니즘은 없습니다. 순수 코드 편집, 빌드/툴링 변경, 위키 자체에 대한 메타 질문은 스킵합니다.

## 훅 (안전망)

기본적으로 CLI 는 두 개의 Claude Code 훅을 `.claude/hooks/` 에 설치하고 `.claude/settings.json` 에 등록합니다:

| 훅 | 이벤트 | 동작 |
| --- | --- | --- |
| `wiki-load-check` | `UserPromptSubmit` | 사용자 메시지에 도메인 의도 키워드가 있으면 *같은 턴* 컨텍스트에 wiki-auto-load.md 를 가리키는 한 줄 reminder 주입 |
| `wiki-reflect-check` | `Stop` | 턴 종료 시 transcript 를 스캔해 디자인 문서 read/edit 또는 의도 키워드가 있는데 위키에 아무것도 안 썼으면, Stop 을 block + reminder 주입해서 어시스턴트가 한 번 더 wiki-auto-reflect.md 판단 기회를 갖게 함 |

훅은 **강제하지 않고 nudge 만 합니다.** 룰 파일을 가리키는 reminder 를 주입할 뿐, 실제로 무엇을 load/file 할지는 어시스턴트가 룰의 판단 기준대로 결정합니다. 모든 에러에서 fail-open (silent exit 0) — 훅 버그가 작업을 멈추는 일은 절대 없습니다. Stop 훅은 `stop_hook_active` 를 체크해 무한 루프를 방지합니다.

의도 키워드는 `--domain` 프리셋(game / saas / research / novel / generic)과 CLI `--lang` 에서 자동 생성됩니다. 설치 후 커스터마이즈하려면 4개 훅 스크립트 상단의 `intent_regex` 를 직접 수정하세요.

완전히 옵트아웃하려면 `--no-hooks` — 소프트 룰은 그대로 적용되고 안전망만 사라집니다.

**크로스 플랫폼**: Windows 프로젝트는 PowerShell 훅 (추가 의존성 없음). Unix 프로젝트는 Python 3 훅 (실행 시점에 Python 3.7+ 필요, 설치 시점에는 불필요). 두 페어 모두 `.claude/hooks/` 에 들어 있어서 나중에 `.claude/settings.json` 의 `command` 를 편집해서 전환할 수 있습니다.

## 명령어

| 명령어 | 동작 |
| --- | --- |
| `/ingest <경로>` | 소스 문서 읽기, 요약 작성, entities/concepts 업데이트, index/log 갱신 |
| `/query <질문>` | `[[인용]]`과 함께 위키 기반 답변, 필요시 synthesis 파일 생성 |
| `/lint` | 모순·스테일·고아 페이지·교차 참조 누락 헬스 체크 |
| `/obsidian-open <경로>` | 실행 중인 Obsidian 앱에서 위키 페이지 열기 |

또는 자연어로 원하는 것을 설명해도 — 의미 매칭이 강하면 skill이 자동 트리거됩니다.

## CLI 옵션

```
npx create-llm-wiki [project-name] [options]

옵션:
  --retrofit              기존 프로젝트에 추가 (새 디렉토리 생성 안 함)
  --vault-dir <경로>      Vault 위치 (기본: vault)
  --vault-name <이름>     Obsidian vault 이름 (기본: 프로젝트명)
  --scripts-dir <경로>    스크립트 위치 (기본: scripts)
  --domain <프리셋>       도메인 프리셋: generic|game|saas|research|novel
  --commit-policy <p>     auto (기본) 또는 manual
  --skip-obsidian-check   Obsidian 설치 확인 건너뛰기
  --install-obsidian      Obsidian 없으면 winget/brew로 자동 설치
  --skip-plugins          Dataview/Marp 플러그인 다운로드 안 함
  --no-hooks              Stop / UserPromptSubmit 훅 설치 안 함
  --lang <en|ko|zh-CN|ja> CLI 출력 언어
  -y, --yes               모든 프롬프트 건너뛰고 기본값 사용
  -h, --help              도움말
  -v, --version           버전
```

## 전제 조건

| 도구 | 필수 여부 |
| --- | --- |
| Node.js 18+ | **필수** — CLI가 `util.parseArgs`와 전역 `fetch` 사용 |
| git | 필수 — 스캐폴드 커밋용 |
| Obsidian | 사용 시점 필수 (CLI가 설치 도와줌) |
| Claude Code | 사용 시점 필수 — 이 도구가 Claude Code용 스캐폴드 |
| npm | 필수 — `npx create-llm-wiki` 실행용 |
| PowerShell 5.1+ | Windows + 훅 사용 시에만 필요 (사전 설치되어 있음) |
| Python 3.7+ | macOS/Linux + 훅 사용 시에만 필요 — `brew install python` 또는 패키지 매니저로 설치. 설치할 수 없으면 `--no-hooks` 사용 |

## 전체 셋업 가이드

Decision tree, 파일별 레퍼런스, 커스터마이즈 체크리스트, 흔한 함정 등 전체 가이드:

- [docs/setup-guide.md](docs/setup-guide.md) (English)
- [docs/setup-guide.ko.md](docs/setup-guide.ko.md) (한국어)
- [docs/setup-guide.zh-CN.md](docs/setup-guide.zh-CN.md) (简体中文)
- [docs/setup-guide.ja.md](docs/setup-guide.ja.md) (日本語)

## 라이선스

MIT
