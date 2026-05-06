# RAG 파이프라인 (Task 29)

GPU 서버에서 충돌 코드 컨텍스트를 검색하기 위한 RAG 파이프라인입니다.
`BAAI/bge-m3` 임베딩 모델과 ChromaDB 로컬 벡터 스토어를 사용합니다.

> **모델 변경 방법:** 각 파일 상단의 `EMBEDDING_MODEL_NAME` 상수 또는
> 실행 시 `--model_name` 인자만 바꾸면 다른 임베딩 모델로 즉시 교체됩니다.

---

## 파일 구조

```
rag/
├── embed_documents.py    # 1단계: 문서 임베딩 → ChromaDB 저장
├── retriever.py          # 2단계: 쿼리 검색 → 프롬프트 컨텍스트 생성
├── test_rag_pipeline.py  # 전체 파이프라인 동작 검증
├── requirements_rag.txt  # RAG 전용 의존성
└── README.md
```

---

## 실행 방법 (GPU 서버)

### 0. 의존성 설치

```bash
pip install -r requirements_rag.txt
```

### 1. 문서 임베딩 (처음 한 번)

```bash
CUDA_VISIBLE_DEVICES=0 python embed_documents.py \
    --source_dir ../../../../synthetic_dataset \
    --db_dir ./chroma_db \
    --collection_name gitcat_conflicts
```

### 2. 검색 테스트

```bash
python retriever.py \
    --query "TypeScript interface type mismatch" \
    --top_k 5 \
    --show_context
```

### 3. 전체 파이프라인 검증

```bash
# 처음 실행 시 (임베딩 포함)
CUDA_VISIBLE_DEVICES=0 python test_rag_pipeline.py

# 임베딩이 이미 완료된 경우
python test_rag_pipeline.py --skip_embed

# 다른 임베딩 모델 테스트
CUDA_VISIBLE_DEVICES=0 python test_rag_pipeline.py \
    --model_name "intfloat/multilingual-e5-large"
```

---

## 임베딩 모델 교체 방법

현재 기본값: `BAAI/bge-m3`

| 모델 | 특징 | 변경 방법 |
|---|---|---|
| `BAAI/bge-m3` (현재) | 다국어, 코드 맥락 강점 | 기본값 |
| `intfloat/multilingual-e5-large` | 다국어 강점 | `--model_name` 인자 변경 |
| `sentence-transformers/all-MiniLM-L6-v2` | 경량, CPU 동작 | `requirements_rag.txt`에서 FlagEmbedding → sentence-transformers 교체 후 코드 수정 |

---

## 검색 품질 평가 기준

`test_rag_pipeline.py` 실행 후 출력되는 유사도(score) 기준:

| 유사도 | 평가 |
|---|---|
| ≥ 0.7 | ✅ 양호 — RAG 효과 있음 |
| 0.5 ~ 0.7 | ⚠️ 보통 — 프롬프트 엔지니어링 병행 권장 |
| < 0.5 | ❌ 개선 필요 — 데이터 또는 모델 변경 검토 |
