"""
embed_documents.py
==================
RAG 파이프라인 - 문서 임베딩 및 벡터 DB 저장

synthetic_dataset/ 또는 임의의 코드/문서 폴더를 읽어
BAAI/bge-m3 임베딩 모델로 벡터화한 뒤 ChromaDB에 저장합니다.

사용법:
    python embed_documents.py --source_dir ../../../../synthetic_dataset --db_dir ./chroma_db
    python embed_documents.py --source_dir ./custom_docs --db_dir ./chroma_db --collection_name gitcat_docs
"""

import argparse
import os
import sys
from pathlib import Path

import chromadb
from chromadb.config import Settings
from FlagEmbedding import BGEM3FlagModel


# ---------------------------------------------------------------------------
# 설정 상수
# ---------------------------------------------------------------------------
DEFAULT_SOURCE_DIR = "../../../../synthetic_dataset"
DEFAULT_DB_DIR = "./chroma_db"
DEFAULT_COLLECTION_NAME = "gitcat_conflicts"
EMBEDDING_MODEL_NAME = "BAAI/bge-m3"
SUPPORTED_EXTENSIONS = {".md", ".json", ".ts", ".py", ".txt", ".patch"}

# bge-m3 최대 토큰 길이 (초과 시 청크 분할)
MAX_CHUNK_CHARS = 2000
CHUNK_OVERLAP_CHARS = 200


# ---------------------------------------------------------------------------
# 문서 로딩
# ---------------------------------------------------------------------------
def load_documents(source_dir: str) -> list[dict]:
    """
    source_dir 하위의 지원 확장자 파일을 재귀적으로 읽어
    {'id': str, 'text': str, 'metadata': dict} 형태의 리스트로 반환합니다.
    """
    source_path = Path(source_dir)
    if not source_path.exists():
        print(f"[ERROR] 소스 디렉터리가 존재하지 않습니다: {source_dir}")
        sys.exit(1)

    docs = []
    for file_path in sorted(source_path.rglob("*")):
        if file_path.suffix not in SUPPORTED_EXTENSIONS:
            continue
        if file_path.is_dir():
            continue

        try:
            text = file_path.read_text(encoding="utf-8")
        except Exception as e:
            print(f"[WARN] 파일 읽기 실패, 건너뜁니다: {file_path} ({e})")
            continue

        if not text.strip():
            continue

        # 파일이 너무 길면 청크로 분할
        chunks = split_into_chunks(text)
        for idx, chunk in enumerate(chunks):
            doc_id = f"{file_path.relative_to(source_path)}__chunk{idx}"
            docs.append({
                "id": doc_id,
                "text": chunk,
                "metadata": {
                    "source_file": str(file_path.relative_to(source_path)),
                    "chunk_index": idx,
                    "total_chunks": len(chunks),
                    "extension": file_path.suffix,
                },
            })

    print(f"[INFO] 총 {len(docs)}개의 청크 로드 완료 (소스: {source_dir})")
    return docs


def split_into_chunks(text: str) -> list[str]:
    """
    텍스트를 MAX_CHUNK_CHARS 단위로 분할합니다.
    청크 간 CHUNK_OVERLAP_CHARS만큼 겹쳐서 문맥 손실을 줄입니다.
    """
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + MAX_CHUNK_CHARS
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP_CHARS

    return chunks


# ---------------------------------------------------------------------------
# 임베딩
# ---------------------------------------------------------------------------
def load_embedding_model() -> BGEM3FlagModel:
    """
    BAAI/bge-m3 임베딩 모델을 GPU에 로드합니다.
    첫 실행 시 HuggingFace에서 자동 다운로드됩니다.
    """
    print(f"[INFO] 임베딩 모델 로드 중: {EMBEDDING_MODEL_NAME}")
    model = BGEM3FlagModel(EMBEDDING_MODEL_NAME, use_fp16=True)
    print("[INFO] 임베딩 모델 로드 완료")
    return model


def embed_texts(model: BGEM3FlagModel, texts: list[str]) -> list[list[float]]:
    """
    텍스트 리스트를 bge-m3로 임베딩하여 벡터 리스트를 반환합니다.
    배치 단위로 처리하여 메모리 효율을 높입니다.
    """
    BATCH_SIZE = 32
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        result = model.encode(
            batch,
            batch_size=BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )
        all_embeddings.extend(result["dense_vecs"].tolist())
        print(f"[INFO] 임베딩 진행: {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")

    return all_embeddings


# ---------------------------------------------------------------------------
# ChromaDB 저장
# ---------------------------------------------------------------------------
def save_to_chromadb(
    docs: list[dict],
    embeddings: list[list[float]],
    db_dir: str,
    collection_name: str,
) -> None:
    """
    임베딩 결과를 ChromaDB 로컬 벡터 스토어에 저장합니다.
    동일 ID가 있으면 upsert(덮어쓰기)로 처리합니다.
    """
    client = chromadb.PersistentClient(
        path=db_dir,
        settings=Settings(anonymized_telemetry=False),
    )

    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    ids = [doc["id"] for doc in docs]
    texts = [doc["text"] for doc in docs]
    metadatas = [doc["metadata"] for doc in docs]

    # 배치 단위로 upsert
    BATCH_SIZE = 100
    for i in range(0, len(ids), BATCH_SIZE):
        collection.upsert(
            ids=ids[i : i + BATCH_SIZE],
            embeddings=embeddings[i : i + BATCH_SIZE],
            documents=texts[i : i + BATCH_SIZE],
            metadatas=metadatas[i : i + BATCH_SIZE],
        )
        print(f"[INFO] DB 저장 진행: {min(i + BATCH_SIZE, len(ids))}/{len(ids)}")

    print(f"[INFO] ChromaDB 저장 완료: {db_dir}/{collection_name} (총 {len(ids)}건)")


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="문서를 bge-m3로 임베딩하여 ChromaDB에 저장합니다.")
    parser.add_argument(
        "--source_dir",
        type=str,
        default=DEFAULT_SOURCE_DIR,
        help="임베딩할 문서가 있는 디렉터리 경로",
    )
    parser.add_argument(
        "--db_dir",
        type=str,
        default=DEFAULT_DB_DIR,
        help="ChromaDB 저장 경로",
    )
    parser.add_argument(
        "--collection_name",
        type=str,
        default=DEFAULT_COLLECTION_NAME,
        help="ChromaDB 컬렉션 이름",
    )
    args = parser.parse_args()

    # 1. 문서 로딩
    docs = load_documents(args.source_dir)
    if not docs:
        print("[WARN] 임베딩할 문서가 없습니다. 종료합니다.")
        return

    # 2. 임베딩
    model = load_embedding_model()
    texts = [doc["text"] for doc in docs]
    embeddings = embed_texts(model, texts)

    # 3. ChromaDB 저장
    save_to_chromadb(docs, embeddings, args.db_dir, args.collection_name)

    print("\n✅ 임베딩 및 벡터 DB 저장 완료!")
    print(f"   - 소스 디렉터리: {args.source_dir}")
    print(f"   - DB 경로: {args.db_dir}")
    print(f"   - 컬렉션: {args.collection_name}")
    print(f"   - 저장된 청크 수: {len(docs)}")


if __name__ == "__main__":
    main()
