"""
retriever.py
============
Task 29: RAG 파이프라인 - 벡터 검색 (Retriever)

embed_documents.py로 생성한 ChromaDB에서
충돌 코드 컨텍스트와 관련된 문서를 검색합니다.

사용법:
    python retriever.py --query "TypeScript interface 충돌 해결" --top_k 5
    python retriever.py --query "merge conflict resolution" --db_dir ./chroma_db
"""

import argparse
import json
from pathlib import Path

import chromadb
from chromadb.config import Settings
from FlagEmbedding import BGEM3FlagModel


# ---------------------------------------------------------------------------
# 설정 상수 (모델 변경 시 이 값만 수정)
# ---------------------------------------------------------------------------
EMBEDDING_MODEL_NAME = "BAAI/bge-m3"
DEFAULT_DB_DIR = "./chroma_db"
DEFAULT_COLLECTION_NAME = "gitcat_conflicts"
DEFAULT_TOP_K = 5


# ---------------------------------------------------------------------------
# 검색
# ---------------------------------------------------------------------------
def load_embedding_model(model_name: str = EMBEDDING_MODEL_NAME) -> BGEM3FlagModel:
    """임베딩 모델 로드. model_name 인자로 언제든지 다른 모델로 교체 가능."""
    print(f"[INFO] 임베딩 모델 로드 중: {model_name}")
    model = BGEM3FlagModel(model_name, use_fp16=True)
    print("[INFO] 임베딩 모델 로드 완료")
    return model


def retrieve(
    query: str,
    model: BGEM3FlagModel,
    db_dir: str = DEFAULT_DB_DIR,
    collection_name: str = DEFAULT_COLLECTION_NAME,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict]:
    """
    쿼리를 임베딩하여 ChromaDB에서 가장 유사한 문서를 검색합니다.

    Returns:
        [{'text': str, 'metadata': dict, 'score': float}, ...] 형태의 리스트
    """
    # 쿼리 임베딩
    result = model.encode(
        [query],
        batch_size=1,
        max_length=512,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    query_embedding = result["dense_vecs"][0].tolist()

    # ChromaDB 검색
    client = chromadb.PersistentClient(
        path=db_dir,
        settings=Settings(anonymized_telemetry=False),
    )
    collection = client.get_collection(name=collection_name)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    # 결과 정리
    retrieved = []
    for doc, meta, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        # ChromaDB cosine distance → similarity 변환 (1 - distance)
        similarity = round(1.0 - distance, 4)
        retrieved.append({
            "text": doc,
            "metadata": meta,
            "score": similarity,
        })

    return retrieved


def format_context_for_prompt(retrieved_docs: list[dict]) -> str:
    """
    검색 결과를 프롬프트에 주입할 수 있는 컨텍스트 문자열로 변환합니다.
    """
    if not retrieved_docs:
        return ""

    lines = ["## 관련 코드베이스 컨텍스트\n"]
    for i, doc in enumerate(retrieved_docs, 1):
        source = doc["metadata"].get("source_file", "unknown")
        score = doc["score"]
        lines.append(f"### [{i}] {source} (유사도: {score})\n")
        lines.append("```\n")
        lines.append(doc["text"])
        lines.append("\n```\n\n")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 메인 (단독 실행 테스트용)
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="ChromaDB에서 관련 문서를 검색합니다.")
    parser.add_argument("--query", type=str, required=True, help="검색 쿼리 (충돌 코드 또는 자연어)")
    parser.add_argument("--model_name", type=str, default=EMBEDDING_MODEL_NAME,
                        help="임베딩 모델명 (변경 시 이 인자만 수정)")
    parser.add_argument("--db_dir", type=str, default=DEFAULT_DB_DIR)
    parser.add_argument("--collection_name", type=str, default=DEFAULT_COLLECTION_NAME)
    parser.add_argument("--top_k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--show_context", action="store_true",
                        help="프롬프트 주입용 컨텍스트 문자열 출력")
    args = parser.parse_args()

    model = load_embedding_model(args.model_name)
    results = retrieve(
        query=args.query,
        model=model,
        db_dir=args.db_dir,
        collection_name=args.collection_name,
        top_k=args.top_k,
    )

    print(f"\n🔍 검색 결과 (상위 {args.top_k}개):")
    print(json.dumps(
        [{"source": r["metadata"].get("source_file"), "score": r["score"]} for r in results],
        ensure_ascii=False,
        indent=2,
    ))

    if args.show_context:
        print("\n" + "=" * 60)
        print("📋 프롬프트 주입용 컨텍스트:")
        print("=" * 60)
        print(format_context_for_prompt(results))


if __name__ == "__main__":
    main()
