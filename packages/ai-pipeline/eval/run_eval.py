import os
import json
from datetime import datetime
from dotenv import load_dotenv
from engine.similarity import SimilarityEngine
from engine.judge import JudgeEngine
from openai import OpenAI

# 루트 디렉토리의 .env 로드
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, "../../../.env"))

# 1. 환경 설정 (GMS API 호출용)
API_KEY = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")

# GMS 게이트웨이 주소 보정
def resolve_gms_url(base_url):
    base_url = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in base_url:
        return f"{base_url}api.openai.com/v1"
    return base_url

BASE_URL = resolve_gms_url(GMS_BASE_URL)
print(f"[INFO] Using API Base URL: {BASE_URL}")

class EvalRunner:
    def __init__(self):
        self.sim_engine = SimilarityEngine()
        self.judge_engine = JudgeEngine()
        self.client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
        
        # 경로 설정
        self.data_path = os.path.join(os.path.dirname(__file__), "data/golden_set.json")
        self.result_dir = os.path.join(os.path.dirname(__file__), "../../../docs/evaluation")

    def get_ai_response(self, payload):
        """평가 대상 모델(Base Model)로부터 답변을 받아옵니다."""
        response = self.client.chat.completions.create(
            model="gpt-4o-mini", # 베이스라인 측정을 위한 기본 모델
            messages=[
                {"role": "system", "content": "너는 Git 충돌 분석 어시스턴트야. 충돌 상황을 한국어로 설명해줘."},
                {"role": "user", "content": payload}
            ]
        )
        return response.choices[0].message.content

    def run(self):
        with open(self.data_path, "r", encoding="utf-8") as f:
            golden_set = json.load(f)

        total_results = []
        print(f"\n[START] Starting baseline evaluation for {len(golden_set)} cases.")

        for case in golden_set:
            print(f"\n[EVALUATING] {case['id']}: {case['title']}")
            
            # 1. AI 답변 생성 (Base Model)
            candidate = self.get_ai_response(case["input_payload"])
            
            # 2. 유사도 및 키워드 점수 계산
            sim_res = self.sim_engine.get_score(candidate, case["reference"], case.get("keywords", []))
            
            # 3. LLM 채점 (정확도, 할루시네이션 등)
            judge_res = self.judge_engine.evaluate(case["input_payload"], candidate, case["reference"])
            
            result = {
                "id": case["id"],
                "title": case["title"],
                "metrics": {
                    "semantic_sim": sim_res["semantic_sim"],
                    "keyword_score": sim_res["keyword_score"],
                    "total_similarity": sim_res["total_score"],
                    "accuracy_score": judge_res["accuracy_score"],
                    "resolution_score": judge_res["resolution_score"],
                    "has_hallucination": judge_res["has_hallucination"]
                },
                "candidate": candidate,
                "reason": judge_res["reason"]
            }
            total_results.append(result)
            print(f"[OK] TotalSim: {sim_res['total_score']*100:.2f}%, Accuracy: {judge_res['accuracy_score']}/10")

        # 최종 리포트 저장
        final_report = {
            "timestamp": datetime.now().isoformat(),
            "average_metrics": {
                "total_similarity": sum(r["metrics"]["total_similarity"] for r in total_results) / len(total_results),
                "semantic_sim": sum(r["metrics"]["semantic_sim"] for r in total_results) / len(total_results),
                "accuracy": sum(r["metrics"]["accuracy_score"] for r in total_results) / len(total_results)
            },
            "details": total_results
        }

        os.makedirs(self.result_dir, exist_ok=True)
        report_path = os.path.join(self.result_dir, "comprehensive_baseline.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(final_report, f, ensure_ascii=False, indent=2)
            
        print(f"\n[FINISH] Evaluation complete! Report saved to: {report_path}")

if __name__ == "__main__":
    runner = EvalRunner()
    runner.run()
