import os
import json
from openai import OpenAI

class JudgeEngine:
    def __init__(self):
        # 환경 변수에서 GMS API 설정 로드
        api_key = os.getenv("GMS_KEY")
        gms_base_url = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")
        
        # GMS 게이트웨이 주소 보정
        base_url = gms_base_url if gms_base_url.endswith("/") else gms_base_url + "/"
        if "api.openai.com" not in base_url:
            base_url = f"{base_url}api.openai.com/v1"
            
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = "gpt-4o-mini" # 현재 환경에서 권한이 확인된 모델 사용

    def evaluate(self, input_payload, candidate, reference):
        """
        LLM-as-a-Judge를 통해 답변을 정밀 채점합니다.
        """
        prompt = f""" 너는 시니어 소프트웨어 엔지니어 채점관이야. 
다음 [입력 데이터]와 [모범 답안]을 참고하여, [AI의 답변]을 채점해줘.

[입력 데이터]
{input_payload}

[모범 답안]
{reference}

[AI의 답변]
{candidate}

---
[채점 기준]
1. 정확성(Accuracy): 기술적 원인을 정확히 짚었는가? (1~10점)
2. 중재안(Resolution): 제시한 해결책이 합리적인가? (1~10점)
3. 할루시네이션(Hallucination): 입력 데이터에 없는 허구의 정보를 포함했는가? (Yes/No)

[출력 형식]
반드시 아래 JSON 형식으로만 응답해줘.
{{
  "accuracy_score": 점수,
  "resolution_score": 점수,
  "has_hallucination": true/false,
  "reason": "채점 이유 요약"
}}
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": "You are a professional software engineering judge."},
                          {"role": "user", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"[Judge Error] {e}")
            return {"accuracy_score": 0, "resolution_score": 0, "has_hallucination": False, "reason": "Error"}
