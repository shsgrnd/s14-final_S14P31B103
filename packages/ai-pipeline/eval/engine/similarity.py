import torch
from sentence_transformers import SentenceTransformer, util

class SimilarityEngine:
    def __init__(self, model_name="BAAI/bge-m3"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Similarity] Using device: {self.device}")
        self.model = SentenceTransformer(model_name, device=self.device)

    def get_score(self, candidate, reference, keywords=None):
        """
        종합 유사도 점수를 계산합니다.
        1. Semantic Similarity (임베딩 기반)
        2. Keyword Match (필수 단어 포함 여부)
        """
        # 1. 의미적 유사도 (Cosine Similarity)
        embeddings = self.model.encode([candidate, reference], convert_to_tensor=True)
        semantic_sim = util.cos_sim(embeddings[0], embeddings[1]).item()
        
        # 2. 키워드 매칭 점수
        keyword_score = 1.0
        if keywords and len(keywords) > 0:
            found_count = sum(1 for kw in keywords if kw.lower() in candidate.lower())
            keyword_score = found_count / len(keywords)
            
        return {
            "semantic_sim": round(semantic_sim, 4),
            "keyword_score": round(keyword_score, 4),
            "total_score": round((semantic_sim * 0.7) + (keyword_score * 0.3), 4) # 가중치 적용
        }

