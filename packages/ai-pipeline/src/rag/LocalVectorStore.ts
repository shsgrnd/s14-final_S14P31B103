import { LocalEmbedder } from './LocalEmbedder';

export interface LocalDocument {
  id: string; // 문서나 변경점의 고유 ID (예: snapshot_id, file_path)
  content: string; // 임베딩의 기반이 된 실제 텍스트 내용
  metadata?: Record<string, any>; // 부가 정보 (예: 파일 타입, 날짜 등)
  embedding?: Float32Array; // 계산된 벡터 값
}

export interface SearchResult {
  document: LocalDocument;
  score: number; // 코사인 유사도 점수 (1에 가까울수록 매우 유사함)
}

/**
 * LocalVectorStore는 우리가 추출한 벡터를 메모리(In-memory 배열)에 담아두고,
 * 유저의 쿼리가 들어왔을 때 코사인 유사도를 계산하여 가장 관련성 높은 문서를 찾아줍니다.
 * 
 * 1차 MVP 단계이므로 서버 없이 배열 기반으로 가볍게 구현하였고,
 * 이후 데이터가 많아지면 SQLite 등에 직렬화하여 영구 저장하는 방향으로 발전시킬 수 있습니다.
 */
export class LocalVectorStore {
  private documents: LocalDocument[] = [];
  private embedder: LocalEmbedder;

  constructor(embedder?: LocalEmbedder) {
    this.embedder = embedder || new LocalEmbedder();
  }

  /**
   * 문서를 스토어에 추가합니다. (임베딩이 없으면 자동으로 생성합니다)
   */
  public async addDocument(doc: LocalDocument): Promise<void> {
    if (!doc.embedding) {
      doc.embedding = await this.embedder.embed(doc.content);
    }
    this.documents.push(doc);
  }

  /**
   * 여러 문서를 일괄 추가합니다.
   */
  public async addDocuments(docs: LocalDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.addDocument(doc);
    }
  }

  /**
   * 쿼리(질문)와 가장 유사도(코사인 유사도)가 높은 문서를 검색합니다.
   * @param query 검색할 질문 또는 텍스트
   * @param topK 상위 몇 개를 반환할지 (기본 3개)
   */
  public async search(query: string, topK: number = 3): Promise<SearchResult[]> {
    if (this.documents.length === 0) return [];

    // 1. 쿼리 텍스트를 벡터로 변환
    const queryEmbedding = await this.embedder.embed(query);

    // 2. 모든 저장된 문서와의 코사인 유사도 계산
    const results: SearchResult[] = this.documents.map(doc => {
      if (!doc.embedding) throw new Error("Document embedding is missing");
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      return { document: doc, score };
    });

    // 3. 점수가 높은 순으로 정렬 (내림차순)
    results.sort((a, b) => b.score - a.score);

    // 4. 상위 K개 반환
    return results.slice(0, topK);
  }

  /**
   * 저장된 문서 목록을 반환합니다.
   */
  public getDocuments(): LocalDocument[] {
    return this.documents;
  }

  /**
   * 코사인 유사도 계산 (두 벡터 간의 유사성)
   * 이미 normalize된 벡터들이라면 단순히 내적(dot product)만으로도 계산이 가능합니다.
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
