"""
test_rag_pipeline.py
====================
Task 29: RAG 파이프라인 - 전체 동작 검증 테스트

embed_documents.py → retriever.py 전체 파이프라인을 순서대로 실행하여
RAG 효과가 있는지 검증합니다.

실행 전 준비:
    1. pip install -r requirements_rag.txt
    2. (GPU 서버에서) CUDA_VISIBLE_DEVICES=0 python test_rag_pipeline.py

사용법:
    # 전체 파이프라인 순서대로 실행 (임베딩 → 검색 → 결과 비교)
    python test_rag_pipeline.py

    # 이미 임베딩이 완료된 경우 검색만 실행
    python test_rag_pipeline.py --skip_embed

    # 다른 임베딩 모델 사용 시
    python test_rag_pipeline.py --model_name "intfloat/multilingual-e5-large"
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# 같은 디렉터리의 모듈 import
sys.path.insert(0, str(Path(__file__).parent))
from embed_documents import load_documents, load_embedding_model, embed_texts, save_to_chromadb
from retriever import retrieve, format_context_for_prompt


# ---------------------------------------------------------------------------
# 설정 (모델 변경 시 DEFAULT_MODEL_NAME만 수정하면 전체 파이프라인에 반영됨)
# ---------------------------------------------------------------------------
DEFAULT_MODEL_NAME = "BAAI/bge-m3"
DEFAULT_SOURCE_DIR = str(Path(__file__).parent.parent.parent.parent.parent / "synthetic_dataset")
DEFAULT_DB_DIR = str(Path(__file__).parent / "chroma_db")
DEFAULT_COLLECTION = "gitcat_conflicts"

# 검증용 테스트 쿼리 (synthetic_dataset 케이스와 관련된 질문들)
TEST_QUERIES = [
    "TypeScript interface type mismatch merge conflict",
    "SQLite repository artifact ref 저장 충돌",
    "export field policy jsonl SFT training",
    "LoRA adapter training candidate chosen rejected",
    "multi-file merge conflict resolution",
]


# ---------------------------------------------------------------------------
# 단계별 실행
# ---------------------------------------------------------------------------
def step1_embed(source_dir: str, db_dir: str, collection: str, model_name: str) -> None:
    """1단계: 문서 로딩 → 임베딩 → ChromaDB 저장"""
    print("\n" + "=" * 60)
    print("📂 STEP 1: 문서 임베딩 및 벡터 DB 저장")
    print("=" * 60)

    t0 = time.time()
    docs = load_documents(source_dir)

    if not docs:
        print("[WARN] 임베딩할 문서가 없습니다. STEP 1을 건너뜁니다.")
        return

    model = load_embedding_model(model_name)
    texts = [doc["text"] for doc in docs]
    embeddings = embed_texts(model, texts)
    save_to_chromadb(docs, embeddings, db_dir, collection)

    elapsed = round(time.time() - t0, 2)
    print(f"\n✅ STEP 1 완료 ({elapsed}초) — {len(docs)}개 청크 저장")


def step2_retrieve(db_dir: str, collection: str, model_name: str) -> dict:
    """2단계: 테스트 쿼리로 검색 실행 및 결과 수집"""
    print("\n" + "=" * 60)
    print("🔍 STEP 2: 테스트 쿼리 검색 실행")
    print("=" * 60)

    model = load_embedding_model(model_name)
    all_results = {}

    for query in TEST_QUERIES:
        print(f"\n[쿼리] {query}")
        t0 = time.time()
        results = retrieve(query, model, db_dir, collection, top_k=3)
        elapsed = round(time.time() - t0, 3)

        print(f"  검색 완료 ({elapsed}초) — 상위 {len(results)}개:")
        for i, r in enumerate(results, 1):
            source = r["metadata"].get("source_file", "unknown")
            print(f"  [{i}] score={r['score']:.4f} | {source}")

        all_results[query] = results

    return all_results


def step3_evaluate(all_results: dict) -> None:
    """3단계: 검색 품질 평가 (유사도 분포 출력)"""
    print("\n" + "=" * 60)
    print("📊 STEP 3: 검색 품질 평가")
    print("=" * 60)

    total_scores = []
    for query, results in all_results.items():
        scores = [r["score"] for r in results]
        avg_score = round(sum(scores) / len(scores), 4) if scores else 0
        max_score = round(max(scores), 4) if scores else 0
        total_scores.extend(scores)

        status = "✅" if avg_score >= 0.7 else "⚠️ " if avg_score >= 0.5 else "❌"
        print(f"{status} avg={avg_score} | max={max_score} | {query[:50]}")

    overall_avg = round(sum(total_scores) / len(total_scores), 4) if total_scores else 0
    print(f"\n전체 평균 유사도: {overall_avg}")
    print(f"평가 기준: avg >= 0.7 (✅ 양호) | 0.5~0.7 (⚠️ 보통) | < 0.5 (❌ 개선 필요)")

    # 결과 저장
    output_path = Path(__file__).parent / "rag_test_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(
            {q: [{"source": r["metadata"].get("source_file"), "score": r["score"]} for r in rs]
             for q, rs in all_results.items()},
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"\n📁 결과 저장: {output_path}")


def step4_context_demo(all_results: dict) -> None:
    """4단계: 프롬프트 컨텍스트 주입 데모 (첫 번째 쿼리 기준)"""
    print("\n" + "=" * 60)
    print("💬 STEP 4: 프롬프트 컨텍스트 주입 데모")
    print("=" * 60)

    first_query = list(all_results.keys())[0]
    first_results = all_results[first_query]

    print(f"쿼리: {first_query}\n")
    context = format_context_for_prompt(first_results)
    print(context[:1500])
    if len(context) > 1500:
        print("... (이하 생략)")


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="RAG 파이프라인 전체 동작 검증")
    parser.add_argument("--model_name", type=str, default=DEFAULT_MODEL_NAME,
                        help="임베딩 모델명. 변경 시 이 인자만 수정하면 됨.")
    parser.add_argument("--source_dir", type=str, default=DEFAULT_SOURCE_DIR,
                        help="임베딩할 문서 디렉터리")
    parser.add_argument("--db_dir", type=str, default=DEFAULT_DB_DIR,
                        help="ChromaDB 저장 경로")
    parser.add_argument("--collection", type=str, default=DEFAULT_COLLECTION,
                        help="ChromaDB 컬렉션 이름")
    parser.add_argument("--skip_embed", action="store_true",
                        help="이미 임베딩이 완료된 경우 STEP 1 건너뜀")
    args = parser.parse_args()

    print(f"\n🚀 RAG 파이프라인 테스트 시작")
    print(f"   임베딩 모델: {args.model_name}")
    print(f"   소스 디렉터리: {args.source_dir}")
    print(f"   ChromaDB 경로: {args.db_dir}")

    if not args.skip_embed:
        step1_embed(args.source_dir, args.db_dir, args.collection, args.model_name)
    else:
        print("\n[INFO] --skip_embed 옵션으로 STEP 1(임베딩) 건너뜀")

    all_results = step2_retrieve(args.db_dir, args.collection, args.model_name)
    step3_evaluate(all_results)
    step4_context_demo(all_results)

    print("\n✅ RAG 파이프라인 검증 완료!")


if __name__ == "__main__":
    main()
