# LLM Wiki Setup Guide

> 어느 프로젝트에든 Obsidian 스타일 LLM-maintained wiki + Claude Code 통합을 셋업하기 위한 실전 가이드.
>
> **레퍼런스**: [Andrej Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
>
> **`create-llm-wiki` CLI가 대부분 자동화합니다**. 이 가이드는 CLI가 무엇을 생성하는지, 어떻게 커스터마이즈하는지, 기존 프로젝트에 어떻게 retrofit하는지 이해하기 위한 것입니다.

---

## 0. 이 시스템이 뭐고 왜 하는가

**핵심 아이디어**: LLM이 RAG처럼 매번 원본을 re-derive하지 않고, **영속적이고 복리로 쌓이는 위키**를 유지한다. 새 소스가 들어오면 LLM이 기존 페이지들을 업데이트하고 교차 참조를 관리한다. 사용자는 큐레이션·방향 제시, LLM은 bookkeeping.

**실질 이득**:
- 세션 간 지식 누적 (모델 weight는 안 변하지만 외부 메모리가 쌓임)
- "이거 예전에 결정했던 건데?"의 재발견 비용 제거
- 설계 결정의 감사 추적 (`raw/` 원본 + `wiki/` 요약 분리)
- 6개월 후 복리로 가치 커짐 (초기엔 얇음)

---

## 1. Architecture — 3 layers + 2 directions

### 3 Layers (Karpathy gist)
```
raw/       ← 불변 원본 (사람이 넣음, LLM 읽기만)
   ↓ ingest
wiki/      ← LLM이 유지하는 컴파일된 지식
   ↑ 스키마 참조
CLAUDE.md  ← 스키마 (위 둘을 어떻게 다룰지)
```

### 2 Directions (load/reflect 루프)
```
[턴 시작]  wiki-auto-load   → index.md + 관련 2-5 페이지 읽음 → 맥락으로 사용
             ↓
         실제 작업 (코드든 설계든 질의든)
             ↓
[턴 종료]  wiki-auto-reflect → 새 도메인 지식 있으면 파일/업데이트 → log.md append
```

두 방향이 짝을 이뤄야 위키가 살아있다. 읽기만 있으면 stale, 쓰기만 있으면 고립됨.

---

## 2. Prerequisites

| 도구 | 용도 | 필수 여부 |
|---|---|---|
| **Obsidian** (desktop) | vault 뷰어, 그래프 뷰, 플러그인 런타임 | 필수 |
| **Claude Code** | skill/agent/rule 로드 및 실행 | 필수 |
| **git** | 위키가 곧 git 레포 | 필수 |
| **Node.js + npm** | qmd 설치용 (`@tobilu/qmd`) | 선택 (검색용) |
| **gh CLI** | GitHub 레포 생성·푸시 | 선택 |
| **Python 3** | 스크립트의 URL 인코딩 (fallback 있음) | 선택 |

설치 확인:
```bash
obsidian --version    # 또는 Obsidian 앱 설치 여부
claude --version
git --version
npm -v
gh auth status
```

---

## 3. Decision tree — 시작 전 결정

### Q1: 프로젝트 상태?

**Greenfield (새 프로젝트)** → § 5 Greenfield Setup
- 레포 없음 → 새로 만들거나 기존 빈 디렉토리 사용
- 모든 파일 자유롭게 생성 가능
- 예: ProjectMMO

**Retrofit (기존 프로젝트)** → § 6 Retrofit Setup
- 이미 `CLAUDE.md`, `LLM.md`, `.claude/`, `docs/` 등이 존재
- 기존 팀/문서 건드리지 않는 게 핵심
- 예: virgame

### Q2: Vault 위치?

| 상황 | 권장 |
|---|---|
| 코드 프로젝트가 루트 차지 (package.json 등) | **vault를 서브폴더로** (`vault/`, `wiki-vault/` 등) |
| 위키 전용 레포 (코드 없음) | 레포 루트 = vault 루트 |
| 기존 프로젝트 retrofit | **vault를 서브폴더로** (기존 구조 보호) |

**주의**: gist의 예시(`attachmentFolderPath: raw/assets`)는 vault 루트 기준 상대경로 — vault가 서브폴더여도 vault *내부* 구조는 gist 그대로 유지된다.

### Q3: 스크립트 위치?

기존 프로젝트 관습에 맞춘다:
- 관습 없음 / 새 프로젝트 → `scripts/obsidian-open.{ps1,sh}`
- `Tools/` 관습 있음 → `Tools/wiki/obsidian-open.{ps1,sh}`
- `bin/`, `tools/`, `utils/` 등 각자 맞춤

### Q4: 커밋 정책?

| 상황 | 정책 |
|---|---|
| 본인 소유 레포, 메인 브랜치 자유 | **자동 커밋** (`ingest:`, `wiki(auto):` 등) |
| 팀 레포, feature 브랜치, 리뷰 필수 | **stage만**, 커밋은 사용자 판단 |
| 팀 레포, 위키 전용 분리 브랜치 | 분리 브랜치에 자동 커밋 가능 |

---

## 4. 전체 파일 구조 (공통)

### Vault (위키 콘텐츠)
```
vault/
├── .obsidian/
│   ├── app.json                    ← 첨부폴더 고정 등
│   ├── core-plugins.json           ← graph, backlink 등 활성화
│   ├── community-plugins.json      ← Dataview, Marp 활성화
│   └── plugins/
│       ├── dataview/{main.js, manifest.json, styles.css}
│       └── marp/{main.js, manifest.json}
├── raw/
│   ├── sources/                    ← 원본 문서 (불변)
│   └── assets/                     ← 이미지 (첨부폴더)
└── wiki/
    ├── index.md                    ← 카탈로그
    ├── log.md                      ← 변경 이력
    ├── entities/                   ← 것들: 캐릭터, 아이템, 몹, 시스템, 툴
    ├── concepts/                   ← 개념: 메커닉, 패턴, 아키텍처
    ├── sources/                    ← 소스별 요약 (1:1)
    └── synthesis/                  ← 교차 분석, 결정 노트
```

### Claude Code 통합 (`.claude/`)
```
.claude/
├── rules/
│   ├── wiki-conventions.md         ← 페이지 템플릿 + YAML 스키마
│   ├── wiki-auto-load.md           ← 턴 시작 소프트 룰 (읽기)
│   └── wiki-auto-reflect.md        ← 턴 종료 소프트 룰 (쓰기)
├── agents/
│   └── wiki-maintainer.md          ← opus 서브에이전트 (대량 작업용)
└── skills/
    ├── ingest/SKILL.md             ← /ingest <path>
    ├── query/SKILL.md              ← /query <question>
    ├── lint/SKILL.md                ← /lint
    └── obsidian-open/SKILL.md      ← 페이지 열기
```

### 루트
```
CLAUDE.md                            ← 스키마 + @ import (뒷부분 참조)
README.md                            ← 사용법 안내
scripts/obsidian-open.{ps1,sh}       ← URI 래퍼 (또는 Tools/wiki/ 등)
```

---

## 5. Greenfield Setup (새 프로젝트)

### Step 1: 레포 및 디렉토리 생성
```bash
mkdir -p MyProject/{vault/raw/sources,vault/raw/assets,vault/wiki/{entities,concepts,sources,synthesis},vault/.obsidian/plugins/{dataview,marp},.claude/{rules,agents,skills/{ingest,query,lint,obsidian-open}},scripts}
cd MyProject
git init -b main
```

### Step 2: Obsidian 플러그인 다운로드
```bash
# Dataview
cd vault/.obsidian/plugins/dataview
curl -sSL -o main.js     "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/main.js"
curl -sSL -o manifest.json "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/manifest.json"
curl -sSL -o styles.css  "https://github.com/blacksmithgu/obsidian-dataview/releases/download/0.5.70/styles.css"
cd -

# Marp
cd vault/.obsidian/plugins/marp
curl -sSL -o main.js     "https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/main.js"
curl -sSL -o manifest.json "https://github.com/JichouP/obsidian-marp-plugin/releases/download/1.5.0/manifest.json"
cd -
```

**참고**: 기존 구현(ProjectMMO, virgame)에서 그냥 복사해도 됨:
```bash
cp -r /d/ProjectMMO/vault/.obsidian/plugins/dataview ./vault/.obsidian/plugins/
cp -r /d/ProjectMMO/vault/.obsidian/plugins/marp     ./vault/.obsidian/plugins/
```

### Step 3: qmd 설치 (선택, 검색용)
```bash
npm install -g @tobilu/qmd
qmd --version
```

### Step 4: 파일 생성
§ 8 Templates에서 각 파일 내용을 복사 → 프로젝트에 맞게 커스터마이즈.

생성할 파일 (최소):
- `CLAUDE.md`
- `README.md`
- `.gitignore`
- `vault/.obsidian/app.json`
- `vault/.obsidian/core-plugins.json`
- `vault/.obsidian/community-plugins.json`
- `vault/wiki/index.md`
- `vault/wiki/log.md`
- `.claude/rules/wiki-conventions.md`
- `.claude/rules/wiki-auto-load.md`
- `.claude/rules/wiki-auto-reflect.md`
- `.claude/agents/wiki-maintainer.md`
- `.claude/skills/ingest/SKILL.md`
- `.claude/skills/query/SKILL.md`
- `.claude/skills/lint/SKILL.md`
- `.claude/skills/obsidian-open/SKILL.md`
- `scripts/obsidian-open.ps1`
- `scripts/obsidian-open.sh`
- `vault/wiki/{entities,concepts,sources,synthesis}/.gitkeep`
- `vault/raw/{sources,assets}/.gitkeep`

### Step 5: 커스터마이즈 (§ 7 Customization)

### Step 6: 커밋 + 푸시
```bash
git add -A
git commit -m "chore: scaffold LLM Wiki (Karpathy pattern)"
gh repo create MyProject --private --source=. --push
```

### Step 7: Obsidian에서 vault 열기
1. Obsidian 실행 → "Open folder as vault" → `./vault` 선택
2. vault 이름을 `MyProject`(또는 원하는 이름)로 지정
3. Settings → Community plugins → Restricted mode off → Dataview·Marp 각각 enable

### Step 8: 검증 (§ 9)

---

## 6. Retrofit Setup (기존 프로젝트)

### Step 1: 기존 구조 파악 (파괴하지 않기)
```bash
cd /path/to/existing-project
git status --short            # 깨끗한지 확인
git branch --show-current     # 어느 브랜치인지
ls -la                         # 루트 레이아웃
cat CLAUDE.md 2>/dev/null
cat LLM.md 2>/dev/null
ls .claude/rules/ .claude/agents/ .claude/skills/ 2>/dev/null
```

체크할 것:
- [ ] 기존 `CLAUDE.md` / `LLM.md` — 내용 있음? 포인터 파일?
- [ ] 기존 `.claude/rules/*.md` — 어떤 룰 이미 있음?
- [ ] 기존 `.claude/skills/*/` — 이름 충돌할 skill 없나?
- [ ] 기존 `.claude/agents/*.md` — 이름 충돌할 agent 없나?
- [ ] 기존 `docs/`, `design/` 등 — 문서 어디 있음?
- [ ] 기존 `scripts/`, `Tools/`, `bin/` — 스크립트 관습?
- [ ] `.gitignore` — 플러그인 바이너리 제외할지 정책 고려

### Step 2: 원칙 — 기존 파일 건드리지 않기
- **절대 덮어쓰기 금지**: `CLAUDE.md`, `LLM.md`, 기존 rule/agent/skill 파일
- **이름 충돌 회피**: 새 skill/agent 이름이 기존과 안 겹치게
- **최소 touch**: 루트 `CLAUDE.md`에 `@` import 한두 줄 추가 (기존 내용은 유지)

### Step 3: Vault 추가 (§ 5의 Step 1-4와 동일하게 진행하되 서브폴더에)
`vault/` 서브폴더에 모든 것을 넣는다. 기존 `raw/`, `wiki/` 등이 있어도 충돌 없음.

### Step 4: `.claude/` 추가 (기존 파일 건드리지 않고)
새 파일만 추가:
- `.claude/rules/wiki-conventions.md` (새)
- `.claude/rules/wiki-auto-load.md` (새)
- `.claude/rules/wiki-auto-reflect.md` (새)
- `.claude/agents/wiki-maintainer.md` (새)
- `.claude/skills/{ingest,query,lint,obsidian-open}/` (새)

### Step 5: 루트 `CLAUDE.md`에 import 추가 (최소 touch)

기존이 포인터 파일이면:
```markdown
# Project X

- [LLM.md](LLM.md)
- @.claude/rules/wiki-auto-load.md       ← 추가
- @.claude/rules/wiki-auto-reflect.md    ← 추가
```

기존이 내용 파일이면 맨 아래에 섹션 추가:
```markdown
## Wiki integration (LLM Wiki pattern)
- **/ingest `<path>`** — 소스 문서 요약해서 위키에 파일
- **/query `<question>`** — 위키 기반 답변, 필요시 synthesis 생성
- **/lint** — 위키 헬스 체크
- Auto-load rule: @.claude/rules/wiki-auto-load.md
- Auto-reflect rule: @.claude/rules/wiki-auto-reflect.md
```

### Step 6: 스킵 리스트 조정
`wiki-auto-reflect.md`와 `wiki-auto-load.md`의 "SKIP" 섹션에 **기존 skill/rule이 이미 커버하는 작업**을 명시. 예 (virgame):
```
- GameData 테이블 구현 → .claude/skills/gamedata-table-create/
- Protocol enum 빌드 → .claude/skills/protocol-enum-build/
- Unity 콘솔 체크 → .claude/skills/unity-build-check/
- C# 스타일 → .claude/rules/csharp-style.md
```
이렇게 해야 wiki가 코드/빌드/컨벤션 영역을 침범하지 않는다.

### Step 7: 커밋 안 함 (stage만)
```bash
git status --short    # 새 파일만 추가된 것 확인
# 사용자가 직접 리뷰 후 커밋
```

---

## 7. Customization Checklist (프로젝트별)

아래 항목을 **각각** 프로젝트 맞춤으로 조정. 그냥 복사하면 안 됨.

### 7.1 Vault
- [ ] **Vault 이름** (Obsidian 등록 이름, URI에 사용)
  - 기본: 폴더명 (`vault` → 보기 싫으면 프로젝트명으로 지정)
  - 스크립트의 `$Vault` 기본값 맞출 것

### 7.2 Entity/Concept 카테고리 (`wiki-conventions.md`)
도메인에 맞게 수정:

| 프로젝트 유형 | Entity 카테고리 예 | Concept 카테고리 예 |
|---|---|---|
| 게임 (MMO) | character, npc, mob, item, skill, buff, quest, map, costume, pet, currency, gamedata-table, tool | architecture, battle-system, auto-combat, progression, economy, social, balance |
| SaaS/웹앱 | user, role, subscription, plan, integration, webhook, api-endpoint, service | auth, billing, multi-tenancy, rbac, event-sourcing |
| 연구/논문 | paper, researcher, dataset, model, benchmark, hypothesis | method, finding, open-question, replication-status |
| 소설/세계관 | character, faction, location, artifact, event, timeline | theme, plot-thread, motif, worldbuilding-rule |

### 7.3 Source 위치
- [ ] 기존 `docs/` 관습이 있나? → skill의 `/ingest`가 기존 경로도 받도록 명시
- [ ] `raw:` frontmatter 필드가 `vault/raw/sources/` 외에도 `docs/design/`, `design/` 등을 참조할 수 있게

### 7.4 스크립트 위치
- [ ] `scripts/obsidian-open.*` vs `Tools/wiki/obsidian-open.*` vs `bin/` — 기존 관습에 맞출 것
- [ ] `obsidian-open` skill의 SKILL.md에 경로 업데이트

### 7.5 커밋 정책
- [ ] `wiki-auto-reflect.md`의 "Commit policy" 섹션 조정
- [ ] 자동 커밋 vs stage-only
- [ ] 커밋 메시지 prefix (`wiki(auto):`, `wiki(ingest):` 등)

### 7.6 권위 경계 (매우 중요)
- [ ] 코드 컨벤션이 이미 있는 곳 (`.claude/rules/*.md`, `LLM.md`) → wiki가 재정의 금지
- [ ] 빌드/검증 프로세스 → wiki 스코프 외 명시
- [ ] 기존 설계 문서 위치 → wiki-auto-load의 fallback 경로로 추가

### 7.7 Source of Truth 계층
- [ ] 최상위 spec 문서가 있나? (예: 프로젝트 컨셉 문서, 핵심 설계 명세)
- [ ] 있으면 `wiki-conventions.md`·`wiki-auto-reflect.md`에 "authoritative"로 표시
- [ ] 모순 시 어느 쪽이 이기는지 명시

### 7.8 Tag Vocabulary
- [ ] 프로젝트 특유 태그 정의 (예: `mvp`, `live`, `experimental`, 기능명)
- [ ] `wiki-conventions.md`의 "Tags" 섹션에 나열

### 7.9 .gitignore
```gitignore
# Obsidian 사용자 상태 (vault 설정은 유지, 개인 상태는 제외)
**/.obsidian/workspace
**/.obsidian/workspace.json
**/.obsidian/workspace-mobile.json
**/.obsidian/cache
**/.obsidian/plugins/*/data.json
```

플러그인 바이너리(`main.js`, ~6MB)를 커밋할지 결정:
- 개인 프로젝트 / 모든 사용자 사전설치 원함 → 커밋
- 팀 레포 / 바이너리 싫음 → `**/.obsidian/plugins/` 추가하고 README에 설치 안내

---

## 8. File Templates

> 각 파일의 실제 내용은 이 리포지토리의 `template/` 디렉토리에 있습니다. CLI가 `npx create-llm-wiki`로 자동 복사하지만, 수동으로 하려면 `template/` 내용을 대상 디렉토리로 복사한 뒤 § 7 Customization Checklist 항목 각각 적용하세요.

### 8.1 핵심 파일 요약 (목적만)

| 파일 | 역할 | 커스터마이즈 포인트 |
|---|---|---|
| `CLAUDE.md` | 루트 스키마 + @ imports | 프로젝트명, 스택, 권위 경계 |
| `vault/.obsidian/app.json` | Obsidian 설정 (첨부폴더) | 그대로 OK |
| `vault/.obsidian/community-plugins.json` | `["dataview", "marp"]` | 그대로 |
| `vault/wiki/index.md` | 카탈로그, 첫 ingest 후보 힌트 | 후보 문서 목록 |
| `vault/wiki/log.md` | 변경 이력 | `## [YYYY-MM-DD] init` 항목으로 시작 |
| `.claude/rules/wiki-conventions.md` | Entity/Concept 카테고리 + YAML 템플릿 | **카테고리 도메인 맞춤 필수** |
| `.claude/rules/wiki-auto-load.md` | 턴 시작 읽기 룰 | SKIP 리스트에 기존 skill 명시 |
| `.claude/rules/wiki-auto-reflect.md` | 턴 종료 쓰기 룰 | Commit policy, SKIP 리스트 |
| `.claude/skills/ingest/SKILL.md` | `/ingest` 플로우 | 경로 규칙, 커밋 메시지 |
| `.claude/skills/query/SKILL.md` | `/query` 플로우 | 권위 경계 명시 |
| `.claude/skills/lint/SKILL.md` | `/lint` 체크 리스트 | 프로젝트 특유 드리프트 체크 |
| `.claude/skills/obsidian-open/SKILL.md` | URI 스킴 래퍼 호출 | 스크립트 경로 |
| `.claude/agents/wiki-maintainer.md` | opus 서브에이전트 | 스코프 경계 |
| `scripts/obsidian-open.{ps1,sh}` | URI 스킴 launcher | Vault 기본값 |

### 8.2 루트 CLAUDE.md 골격
```markdown
# {{ProjectName}}

{{1-2줄 프로젝트 설명}}. 전체 스펙은 `{{concept-doc-path}}`.

## Stack
- **{{Client}}**: ...
- **{{Server}}**: ...

## Layout
- `{{code-dirs}}/` — 코드
- `vault/` — Obsidian vault
  - `vault/raw/sources/` — 불변 소스
  - `vault/wiki/` — LLM 관리
- `.claude/` — 툴링
- `scripts/` — 헬퍼

## Operations
- **/ingest `<path>`** — 소스 → 위키
- **/query `<question>`** — 위키 기반 답변
- **/lint** — 헬스 체크
- **Auto-load**: @.claude/rules/wiki-auto-load.md
- **Auto-reflect**: @.claude/rules/wiki-auto-reflect.md

## Project rules
{{domain-specific guardrails — authority categories, conventions, etc.}}

## Git
{{commit policy}}
```

---

## 9. Verification

### 9.1 파일 무결성
```bash
# vault 구조 확인
find vault -type f -not -path "*.git*" | sort

# .claude/ 구조 확인
find .claude -type f | sort

# 중요 파일 존재 확인
test -f CLAUDE.md && echo "OK: CLAUDE.md"
test -f vault/wiki/index.md && echo "OK: index.md"
test -f .claude/rules/wiki-conventions.md && echo "OK: conventions"
test -f .claude/rules/wiki-auto-load.md && echo "OK: auto-load"
test -f .claude/rules/wiki-auto-reflect.md && echo "OK: auto-reflect"
```

### 9.2 Obsidian 동작
- [ ] `Open folder as vault` → `vault` 선택하면 열림
- [ ] 좌측 파일 탐색기에 `raw/`, `wiki/` 보임
- [ ] Settings → Community plugins → Dataview, Marp 토글 가능
- [ ] 그래프 뷰에서 빈 그래프 표시 (정상)

### 9.3 Claude Code 동작
새 대화 열어서:
1. `루트 CLAUDE.md 읽어서 프로젝트 설명해줘` → 프로젝트명·스택 정확히 답변
2. `/ingest <테스트 파일>` → `vault/wiki/sources/<slug>.md` 생성됨
3. `/query 아무 질문` → `vault/wiki/index.md` 읽고 답변
4. 실제 도메인 질문 → 자동으로 위키 로드하고 인용 (auto-load 동작)
5. 설계 결정 논의 후 턴 종료 → auto-reflect 발동 여부 요약에 표시

### 9.4 스크립트 동작
```bash
./scripts/obsidian-open.sh wiki/index.md
# Obsidian 앱이 index.md를 엶
```

---

## 10. Common Pitfalls

### 10.1 스키마 불러오지 못함
**증상**: `/ingest`를 호출해도 스킬이 안 떠오름
**원인**: `CLAUDE.md`에 `@.claude/rules/wiki-*.md` 없음, 또는 마크다운 링크로만 참조
**해결**: `@` prefix로 import해야 Claude Code가 로드함

### 10.2 auto-reflect가 안 됨 / 과도함
**증상**: 설계 논의했는데 기록 안 됨 / 코드 변경마다 위키 파일 생성됨
**원인**: `wiki-auto-reflect.md`의 트리거 조건·SKIP 리스트가 프로젝트에 안 맞음
**해결**: SKIP 리스트에 프로젝트 특유 작업 명시 (ProjectMMO는 권위 카테고리 결정은 항상 트리거, virgame은 GameData 테이블 작업은 항상 스킵)

### 10.3 Obsidian 경로 불일치
**증상**: `obsidian-open` 스킬이 실행돼도 파일이 안 열림
**원인**: 스크립트 `$Vault` 기본값과 Obsidian에 등록된 vault 이름 불일치
**해결**: Obsidian에 vault 열 때 이름을 스크립트 기본값과 맞춤 (보통 폴더명)

### 10.4 팀 레포에 플러그인 바이너리 커밋
**증상**: `main.js` 파일들(~6MB)이 git에 들어감
**영향**: 레포 크기 증가, LFS 필요할 수도
**해결**: `.gitignore`에 `**/.obsidian/plugins/` 추가, README에 플러그인 설치 안내

### 10.5 기존 LLM.md / CLAUDE.md 덮어쓰기
**증상**: retrofit 할 때 기존 팀 컨벤션 날아감
**해결**: **절대 `Write`로 덮어쓰지 말고 `Read` 후 `Edit`로 append만**, 또는 건드리지 말고 새 파일로만 작업

### 10.6 권위 경계 흐려짐
**증상**: 위키가 코드 컨벤션까지 재정의해서 `.claude/rules/`와 모순
**해결**: `wiki-conventions.md`·`wiki-auto-*.md` 스코프 섹션에 "wiki는 도메인만, 코드 규칙은 기존 rule" 명시

### 10.7 vault 이름 = "vault" (못생김)
**증상**: Obsidian 탭에 "vault - wiki/..." 표시
**해결**: `Open folder as vault` 할 때 커스텀 이름 지정 + 스크립트 기본값 맞춤

### 10.8 stale wiki
**증상**: 위키가 턴 3 결정 유지, 실제 코드는 턴 10에 바뀜
**해결**: 주기적 `/lint`, 특히 배포·마일스톤 전

---

## 11. Post-setup Maintenance

### 주간
- `/lint` 한 번 실행해서 contradictions, orphans 체크
- 최근 턴 종료 summary에서 auto-reflect 놓친 것 있는지 회고

### 월간
- `wiki-conventions.md`의 카테고리 보고 도메인 변화 반영
- `vault/wiki/log.md` 훑으며 작업 흐름 회고
- stale 페이지 (`updated`가 30일 이상) 수동 체크

### 분기
- 위키 스키마 자체 리뷰 — 카테고리 바꿀지, 템플릿 조정할지
- `docs/`, `design/` 등에 새로 쌓인 문서 일괄 ingest

---

## 12. References

### Core
- [Karpathy — LLM Wiki pattern (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Obsidian](https://obsidian.md) — vault 뷰어
- [Claude Code](https://docs.claude.com/claude/claude-code) — skill/agent/rule 런타임

### Plugins
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — YAML frontmatter 쿼리 (`v0.5.70`)
- [Marp (for Obsidian)](https://github.com/JichouP/obsidian-marp-plugin) — 마크다운 슬라이드 (`v1.5.0`)
- [Obsidian Web Clipper](https://obsidian.md/clipper) — 브라우저 아티클 → 마크다운

### Search (optional)
- [qmd](https://github.com/tobi/qmd) — 로컬 BM25+벡터+LLM 리랭킹 검색 (`@tobilu/qmd`)
  ```bash
  qmd collection add vault/wiki --name my-wiki
  qmd embed
  qmd query "질문"
  ```

### This repository
- `template/` — 모든 파일 템플릿 (CLI가 복사하는 것)
- `src/` — CLI 소스 코드
- `docs/` — 4개 언어 가이드

---

## 13. Quick Reference (한 페이지 요약)

```
설치     : Obsidian + Claude Code (+ npm, gh, qmd 선택)
구조     : vault/{raw,wiki,.obsidian}/ + .claude/{rules,agents,skills}/ + scripts/
핵심 파일 : CLAUDE.md (@ import)
           .claude/rules/wiki-conventions.md (카테고리 도메인 맞춤)
           .claude/rules/wiki-auto-load.md   (턴 시작 읽기)
           .claude/rules/wiki-auto-reflect.md (턴 종료 쓰기)
           .claude/skills/{ingest,query,lint,obsidian-open}/SKILL.md
명령어   : /ingest <path>   → 소스를 위키에 파일
          /query <question> → 위키 기반 답변 (필요시 synthesis)
          /lint             → 헬스 체크
          "위키에 반영해줘" → 자연어로도 OK
자동     : auto-load  = 턴 시작 시 조용히 관련 페이지 로드
          auto-reflect = 턴 종료 시 도메인 지식 있으면 파일
          (코드 편집·빌드·리팩터는 둘 다 스킵)
커스텀 포인트:
  1. Entity/Concept 카테고리 (도메인별 다름)
  2. SKIP 리스트 (기존 skill/rule 존중)
  3. Source 경로 (vault/raw/ vs 기존 docs/)
  4. 스크립트 위치 (scripts/ vs Tools/)
  5. 커밋 정책 (자동 vs stage-only)
  6. Vault 이름 (Obsidian 등록명)
  7. 권위 경계 (wiki 스코프 명시)
  8. Tag vocabulary
금기:
  - 기존 CLAUDE.md/LLM.md 덮어쓰기
  - wiki가 코드 컨벤션 재정의
  - raw/ 수정
  - 매 코드 편집마다 reflect
검증:
  1. Obsidian에서 vault 열림 + 플러그인 토글
  2. /ingest 동작
  3. 도메인 질문 시 자동 로드
  4. 설계 논의 후 턴 종료 요약에 reflect 표시
```

---

_이 문서는 LLM Wiki 패턴의 실전 적용 지침서다. 스스로 살아있도록 — 새 프로젝트에 적용할 때마다 배운 점을 여기에 append 할 것._
