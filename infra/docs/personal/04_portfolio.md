# 🏆 포트폴리오 (Portfolio)

**프로젝트 명:** GitCat (생성형 AI 코딩 환경에서의 안전한 작업 관리 및 스마트 병합 솔루션)
**담당 역할:** Infra & AI Engineer (VS Code Extension 로컬 스토리지 구축 및 AI 병합 초안 파이프라인 개발)

---

## 1. 프로젝트 개요 (Overview)
사용자가 AI와 함께 코드를 작성할 때 커밋되지 않은 로컬 작업 상태를 'AI 작업 단위'로 자동 저장(스냅샷) 및 원복하고, 브랜치 병합 이전 단계에서 충돌 가능성을 예측해 AI 기반 병합 초안 및 중재안을 제시하는 VS Code Extension입니다. 

**인프라 및 AI 파트 전담 개발자**로서 "로컬 파일 시스템 및 SQLite 기반 하이브리드 스토리지 아키텍처 구축", "정적 분석 기반 AI 할루시네이션 방어", "안전한 AI API Key 관리" 등 프로젝트의 근간이 되는 인프라 환경과 핵심 지능형 모듈을 구현했습니다. 특히 서버가 없는 **서버리스(Serverless) 모노레포 구조에서 빠르고 안전한 데이터 입출력 파이프라인을 직접 설계·문서화**하여 팀의 협업 기준을 수립했습니다.

---

## 2. 주요 구현 기능 및 성과 (Key Achievements)

### 💾 2.1 하이브리드 로컬 스토리지 아키텍처 설계 및 구현 (Infra)
*   **문제**: 수많은 스냅샷 원본 파일과 변경 이력, 분석 결과 메타데이터를 효율적으로 관리하고 필요 시 즉각적으로 원복할 수 있는 안전한 로컬 저장 구조가 필요함.
*   **해결 — 하이브리드 아키텍처 (File System + DB)**: 
    - 검색 및 필터링이 잦은 메타데이터(Session, Snapshot, ChangeRecord 등 총 15개 릴레이션)는 Node.js 환경 최고 성능의 동기식 드라이버인 `better-sqlite3`를 사용하여 `SQLite`에 저장하도록 분리.
    - 실제 코드 원본과 같이 용량이 크고 단순 I/O가 잦은 파일은 `로컬 파일 시스템` 내 `.vscode/gitcat/` 디렉터리에 `src__auth__user.ts`와 같이 평탄화(Flatten) 규칙을 적용하여 안전하게 저장 및 원복하는 로직 구현.
*   **해결 — DB 설계 기여 및 인프라 보안**:
    - 백엔드 팀의 원활한 쿼리 작성을 위해 `sqlite` 패키지 내부에 `client`, `migrations`, `repositories` (DAO 패턴) 구조를 세팅하여 확장성 높은 아키텍처를 제공함.
    - AI 패턴 분석에 필수적인 테이블(`InferenceRun`, `ProposalFeedback`)을 ERD에 추가 설계 및 스키마(`schema.ts`) 적용.
    - AI 호출을 위한 API Key를 평문으로 저장하지 않고, **VS Code Secrets API**를 활용한 민감 정보 저장 래퍼(Wrapper)를 구축하여 보안성 강화.
*   **해결 — 서비스 강건성 강화 (Fallback & Timeout)**:
    - 로컬 I/O 시나리오의 잠재적 취약점(대용량 파일 스냅샷 시 타임아웃 등)을 방어하기 위해 안전장치(예외 처리, Timeout 설정) 코드 적용.
*   **성과**: 
    - 데이터베이스 비대화를 방지하고 대용량 스냅샷의 물리적 복원 속도를 극대화하는 엔터프라이즈급 로컬 저장소 환경 구축.
    - 백엔드(서버) 없이 100% 로컬 환경에서 사용자 소스코드 유출 없이 구동되는 안전한 익스텐션의 핵심 기반 마련.

---

### 🤖 2.2 AI 병합 충돌 예측 및 정적 분석 파이프라인 (AI Pipeline)
*   **문제**: 단순 텍스트 프롬프트 기반의 병합 제안은 AI 특유의 할루시네이션(환각)으로 인해 괄호 누락, 참조 불일치 등 구조적 문법 오류를 동반할 위험이 큼.
*   **해결 — 알고리즘 및 데이터 전략**:
    - 공식 OpenAI SDK를 연동한 클라이언트 통신 뼈대(client.ts)와 시스템 프롬프트 모듈을 구축했습니다. 특히 문서화된 `ai_input_payload` 스키마를 바탕으로 프롬프트 구조를 모듈화하여, AI 담당자가 비즈니스 로직에만 집중할 수 있도록 진입점과 JSDoc 상세 가이드라인을 제공했습니다.
*   **해결 — 정적 분석기(AST) 기반 방어 레이어**:
    - AI가 응답한 코드를 UI로 바로 노출하지 않고, 백그라운드에서 `TypeScript Compiler API` 및 `ESLint`를 동적으로 호출하여 코드의 유효성을 1차 검증하는 **Fail-safe Design** 적용.
*   **성과**:
    - 사용자가 최종 병합 코드를 신뢰할 수 있도록 룰 기반(Rule-based) 검증 단계를 추가하여 확장 프로그램의 안정성과 사용자 경험(UX)을 대폭 향상.

---

## 3. 기술 스택 (Tech Stack)

| 분류 | 기술 |
|---|---|
| **개발 언어 및 환경** | TypeScript, Node.js, VS Code Extension API |
| **로컬 인프라 & DB** | SQLite (`better-sqlite3`), Local File System (I/O), VS Code Secrets API |
| **AI 연동 & 검증 도구** | External LLM API, **TypeScript Compiler API**, **ESLint** |
| **Git 제어** | Node `child_process` (또는 `simple-git`), CLI Wrapper |
| **배포 & CI/CD** | GitHub Actions, pnpm Workspace (Monorepo 구조 최적화) |

---

## 4. 팀 회고 및 배운 점 (Retrospective)

- **로컬 아키텍처 설계 경험 (Serverless MVP)**: 일반적인 웹 서버 개발을 넘어, VS Code Extension 내부에서 DB(SQLite)와 File System을 직접 핸들링하며 하이브리드하게 데이터를 쪼개어 저장/복원하는 시스템 설계 역량을 길렀습니다.

- **AI 할루시네이션 제어 및 파서(Parser) 결합 역량**: AI 모델의 한계를 맹신하지 않고, 뒷단에 확실한 규칙 기반의 `정적 분석 레이어`를 배치함으로써(AI-Parser 결합) 치명적인 오류가 사용자에게 전파되지 않게 막는 **실패 방지 설계(Fail-safe Design)** 경험을 확보했습니다.

- **모노레포 CI/CD, 의존성 관리 및 인프라 주도 경험**: `apps/`와 `packages/`로 나뉜 모노레포 아키텍처에서 빌드 파이프라인과 GitHub Actions를 직접 구축했습니다. 특히 `pnpm workspace` 기반의 공통 타입(`shared-types`) 참조 및 `tsconfig.base.json` 계층 구조 설정을 주도하여, 패키지 간 병합 충돌 시 발생하는 복잡한 타입스크립트 빌드 에러를 근본적으로 해결하는 깊이 있는 의존성 관리 역량을 축적했습니다.

- **시스템 설계 및 팀 간 기술 협의 경험**: UI(Webview) 파트와의 데이터 연동을 위해 로컬 API 수준의 명확한 데이터 송수신 규격(Stateless Data Passing)을 설계하고, 예외 처리(Timeout, Fallback 응답) 로직을 사전에 정의하여 팀 내 병렬 개발이 매끄럽게 진행되도록 주도했습니다.

- **미래의 유지보수 담당자를 배려한 코드 레벨 문서화(Documentation) 습관**: 모노레포 구조와 복잡한 로컬 저장 규칙이 후속 담당자에게 병목이 되지 않도록, 전체 스토리지 아키텍처(왜 메타데이터와 원본 파일을 분리했는지, 왜 VS Code Secrets를 썼는지 등)의 설계 의도를 명확히 문서화(`07_storage_architecture.md` 등)하고 코드 리뷰 시 공유하는 탄탄한 협업 마인드를 길렀습니다.
