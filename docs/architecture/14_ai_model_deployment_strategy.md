# 14. AI 모델 배포 전략 (Model Deployment Strategy)

## 문서 개요

본 문서는 GitCat에서 오픈소스 LLM을 활용한 AI 기능의 최종 배포 전략을 정의한다.

모델 자체를 Extension에 번들하는 대신, 팀이 학습시킨 LoRA 어댑터 가중치만 배포하고 사용자가 Base 모델을 직접 준비하는 방식을 공식 배포 전략으로 채택한다.

본 문서는 다음 질문에 대한 공용 기준을 제공한다.

- 팀이 배포하는 산출물의 범위는 어디까지인가
- 사용자가 직접 준비해야 하는 항목은 무엇인가
- Extension은 로컬 모델을 어떻게 로드하는가
- RAG 파이프라인은 어느 계층에서 실행되는가

---

## 참조 문서

- `docs/architecture/11_ai_artifact_ref_storage_strategy.md`
- `docs/architecture/07_storage_architecture.md`
- `packages/ai-pipeline/trainer/README.md`

### 현재 로컬 추론용 모델 배포 위치
현재 GitCat의 로컬 추론용 GGUF 배포본은 아래 Hugging Face 저장소에서 제공한다.

- https://huggingface.co/shsgrnd/SSAFY_gitcat-local-llm

권장 다운로드 파일:
- `gitcat-v3-sft-merged-Q4_K_M.gguf`
- `gitcat-v3-dpo-merged-Q4_K_M.gguf`

---

## 1. 배포 산출물 정의

### 팀이 제공하는 것

| 산출물 | 크기 | 배포 위치 |
| --- | --- | --- |
| SFT-LoRA 어댑터 가중치 | 수십~수백 MB | GitHub Releases 또는 HuggingFace Hub |
| DPO-LoRA 어댑터 가중치 | 수십~수백 MB | GitHub Releases 또는 HuggingFace Hub |
| 적용 가이드 (README) | - | 저장소 루트 |

LoRA 어댑터는 Base 모델 전체 가중치를 포함하지 않는다. Base 모델 대비 파일 크기가 수십 분의 1 수준이며, Base 모델이 업데이트되더라도 어댑터만 재학습하면 되는 구조다.

### 사용자가 준비하는 것

| 항목 | 설명 |
| --- | --- |
| 로컬 추론용 GGUF 파일 | GitCat Hugging Face 저장소(`shsgrnd/SSAFY_gitcat-local-llm`)에서 직접 다운로드 |
| LoRA 어댑터 파일 | 팀 GitHub Releases에서 다운로드 |
| 로컬 저장 경로 설정 | Extension 설정에서 모델 파일 경로 지정 |
| 로컬 추론 런타임 설치 | VS Code Command Palette에서 `GitCat: Install Local Runtime` 실행 |

---

## 2. 선택 이유 (Why)

### 대안 비교

| 방식 | 장점 | 단점 |
| --- | --- | --- |
| 모델 전체 번들 배포 | 사용자 설정 불필요 | `.vsix` 100MB 제한 초과, 배포 불가 |
| 외부 API 서버 운영 | 클라이언트 단순화 | 비용 발생, 오프라인 동작 불가 |
| **LoRA 어댑터만 배포 (채택)** | 파일 크기 최소화, 오프라인 동작, 모델 유연성 확보 | 사용자가 Base 모델 직접 다운로드 필요 |

### 채택 이유

- Extension Marketplace는 최대 100MB 제한이 있어 모델 파일을 번들에 포함할 수 없다.
- LoRA 어댑터만 배포하면 팀이 제공하는 파일 크기가 수백 MB 수준으로 유지된다.
- Base 모델은 HuggingFace에서 이미 공개되어 있어 사용자가 직접 다운로드할 수 있다.
- 나중에 더 나은 Base 모델이 출시되어도 어댑터만 재학습하면 대응 가능하다.
- HuggingFace에서 배포하는 대부분의 파인튜닝 모델이 채택하는 업계 표준 방식이다.

---

## 3. 로컬 추론 구조

Extension은 외부 API 서버 없이 사용자 로컬 PC에서 완전히 동작하는 서버리스(Serverless) 구조를 사용한다. 다만 최종 VSIX는 멀티플랫폼 단일 패키지 정책을 따르므로, `node-llama-cpp` 네이티브 런타임은 배포본에 직접 동봉하지 않고 사용 시점에 별도로 설치한다.

```
[사용자 로컬 PC]
├── Base 모델 (GGUF 형식)         ← 사용자가 직접 다운로드
├── 로컬 추론 런타임              ← `GitCat: Install Local Runtime`으로 설치
├── LoRA 어댑터 가중치             ← 팀 GitHub에서 다운로드
└── VS Code Extension (GitCat)
      └── node-llama-cpp
            ├── Base 모델 로드
            ├── LoRA 어댑터 적용
            └── 추론 실행 → 결과 반환
```

### 핵심 라이브러리

| 계층 | 라이브러리 | 역할 |
| --- | --- | --- |
| 추론 엔진 | `node-llama-cpp` | GGUF 모델 + LoRA 어댑터 로드 및 추론 |
| 임베딩 (Extension 내장) | `transformers.js` | ONNX 기반 경량 임베딩, 오프라인 CPU 동작 |
| 벡터 스토어 | In-memory 배열 (1차 MVP) / SQLite | 로컬 코드베이스 검색 (별도 DB 서버 없이 Extension 내장) |

---

## 4. Base 모델 선정 기준

| 항목 | 선정값 | 이유 |
| --- | --- | --- |
| Base 모델 | `Qwen2.5-Coder-7B-Instruct` | 코드 특화, 한국어 지원, 7B 수준에서 성능 균형 우수 |
| 양자화 포맷 | GGUF Q4_K_M | CPU 추론 속도와 품질의 균형점 |
| 추론 메모리 | 약 4~5GB RAM | 일반 개발자 PC에서 동작 가능한 범위 |

Base 모델 선정은 GPU 서버에서의 학습 성능과 사용자 로컬 PC에서의 추론 속도를 함께 고려한 결과다.

---

## 5. RAG 파이프라인 계층 분리

RAG 파이프라인은 용도에 따라 두 계층으로 분리 운영한다.

### 학습/실험용 (GPU 서버, Python)

- 대상: SFT/DPO 학습 데이터 품질 향상, RAG 효과 비교 실험
- 임베딩 모델: `BAAI/bge-m3` (다국어, 코드 맥락 강점)
- 벡터 스토어: `ChromaDB` (서버 구동)
- 실행 위치: `packages/ai-pipeline/trainer/rag/`

### Extension 내장용 (사용자 로컬 PC, Node.js)

- 대상: 실제 사용자의 코드베이스 컨텍스트를 실시간으로 충돌 분석 프롬프트에 주입
- 임베딩 모델: ONNX 기반 경량 모델 (`all-MiniLM-L6-v2` 등, CPU 동작)
- 벡터 스토어: In-memory 배열 (1차 MVP) -> SQLite (2차) (별도 DB 서버 띄우지 않음)
- 실행 위치: `packages/ai-pipeline/src/rag/`
- 배포 메모: 최종 VSIX에는 `@xenova/transformers`를 동봉하지 않으므로, packaged build에서는 로컬 임베딩 경로가 준비되지 않으면 lexical fallback으로 동작한다.

#### RAG 성능 최적화 전략 (Performance Optimization)
VS Code Extension 환경에서 RAG 동작 시 사용자 PC의 성능 저하를 방지하기 위해 다음 아키텍처 전략을 적용한다.
- **증분 업데이트 (Incremental Indexing)**: 매번 프로젝트 전체를 임베딩하지 않고, `git diff`를 활용해 이전 인덱싱 시점 대비 **변경된 파일**만 찾아 임베딩을 업데이트한다.
- **스냅샷 트리거 연동 (Event-driven)**: 타이핑할 때마다 실시간으로 인덱싱을 수행하면 리소스가 낭비되므로, GitCat의 **'스냅샷(Snapshot)' 생성 시점**이나 **실제 병합(Merge) 명령어 실행 시점** 등 특정 이벤트가 발생했을 때만 백그라운드에서 조용히 실행되도록 제어한다.

---

## 6. 학습 파이프라인 연계 흐름

```
RAG 파이프라인 실험 (GPU 서버, Python)
    ↓
Baseline 모델 선정 및 평가셋 구성
    ↓
SFT-LoRA 학습 → LoRA 어댑터 v1 생성
    ↓
DPO-LoRA 학습 → LoRA 어댑터 품질 향상
    ↓
RAG 비교 실험 → 최종 성능 검증
    ↓
[배포] LoRA 어댑터를 GitHub Releases에 업로드
       README에 Base 모델 다운로드 경로 및 적용법 명시
```

---

## 7. 현재 비범위

아래 항목은 본 문서 기준 현재 MVP 범위 밖이다.

- Extension 최초 실행 시 자동 모델 다운로드 기능
- Extension 최초 실행 시 자동 `node-llama-cpp` runtime 설치 기능
- 모델 버전 관리 및 자동 업데이트
- 클라우드 API 서버 운영 방식 배포
- 멀티 GPU 추론 최적화

---

## 8. 요약

- 팀은 LoRA 어댑터 가중치만 GitHub/HuggingFace에 배포한다.
- 사용자는 Base 모델(GGUF)을 직접 다운로드하고 Extension 설정에서 경로를 지정한다.
- `live-local` 사용 시 사용자는 `GitCat: Install Local Runtime`으로 로컬 추론 런타임도 별도 설치한다.
- Extension은 `node-llama-cpp`를 사용해 서버 없이 로컬에서 추론한다.
- RAG는 학습용(GPU 서버)과 Extension 내장용(로컬 CPU)으로 계층을 분리한다.
- Base 모델은 `Qwen2.5-Coder-7B-Instruct` (GGUF Q4_K_M)를 기준으로 한다.
