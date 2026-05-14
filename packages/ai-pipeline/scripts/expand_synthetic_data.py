"""
expand_synthetic_data.py
=========================
명세서 요구사항:
- [synthetic conflict 유형 추가 생성]
- [기존 conflict type 분포 분석 및 불균형 보정]

두 가지 모드로 동작합니다:
  --analyze-only : 기존 데이터셋의 충돌 유형 분포만 분석하고 종료
  (기본)         : 특수 충돌 유형 데이터를 새로 생성하여 데이터셋에 추가

분포 분석은 생성 실행 전 자동으로 선행됩니다.
"""
import os
import json
import re
import argparse
from collections import Counter
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE_DIR, "../trainer/data/synthetic_conflict_dataset.jsonl")
REPORT_FILE = os.path.join(BASE_DIR, "../trainer/data/data_distribution_report.md")

load_dotenv(os.path.join(BASE_DIR, "../../../.env"))
API_KEY      = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")

def resolve_gms_url(base_url):
    base_url = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in base_url:
        return f"{base_url}api.openai.com/v1"
    return base_url

# 키워드 기반 충돌 유형 분류 맵
CONFLICT_TYPE_KEYWORDS = {
    "CI/CD Pipeline":        ["github actions", "workflow", ".yml", "ci/cd", "pipeline", "deploy"],
    "DB / Schema":           ["migration", "schema", "sql", "prisma", "typeorm", "alter table"],
    "Dependency / Package":  ["package.json", "pom.xml", "requirements.txt", "dependencies"],
    "Configuration File":    ["dockerfile", "docker-compose", "nginx", "config", ".env"],
    "Source Code (General)": [],
}

# 특수 충돌 유형 생성 정의
EXPANSION_TYPES = [
    "CI/CD Pipeline Conflict (e.g., GitHub Actions .yml)",
    "Database Migration & Schema Conflict (e.g., .sql, Prisma, TypeORM)",
    "Dependency & Package Conflict (e.g., package.json, pom.xml, requirements.txt)",
    "Configuration File Conflict (e.g., Dockerfile, docker-compose.yml, nginx.conf)",
]


# ─── 분포 분석 ────────────────────────────────────────────────────────────────

def detect_conflict_type(data: dict) -> str:
    raw_input = data.get("input", "")
    text = data.get("instruction", "") + " "
    text += json.dumps(raw_input, ensure_ascii=False) if isinstance(raw_input, dict) else str(raw_input)
    text = text.lower()

    for c_type, keywords in CONFLICT_TYPE_KEYWORDS.items():
        if keywords and any(kw in text for kw in keywords):
            return c_type
    return "Source Code (General)"

def analyze_distribution() -> Counter:
    """데이터셋을 읽어 충돌 유형별 분포를 Counter로 반환합니다."""
    if not os.path.exists(DATA_FILE):
        print(f"[WARNING] Dataset not found: {DATA_FILE}")
        return Counter()

    counter = Counter()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                counter[detect_conflict_type(json.loads(line))] += 1
    return counter

def print_and_save_distribution(counter: Counter):
    total = sum(counter.values())
    if total == 0:
        print("[WARNING] No data to analyze.")
        return

    print("\n" + "="*60)
    print("📊 Conflict Type Distribution Analysis")
    print("="*60)
    print(f"  Total Records: {total}\n")
    for c_type, cnt in counter.most_common():
        ratio = cnt / total * 100
        bar   = "█" * max(1, int(ratio / 2))
        print(f"  {c_type:<30} {cnt:>4}개 ({ratio:5.1f}%) {bar}")
    print("="*60)

    # Markdown 저장
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("# 📊 Conflict Type Distribution Report\n\n")
        f.write(f"**Total Records:** {total}\n\n")
        f.write("| Conflict Type | Count | Ratio |\n| :--- | :---: | :---: |\n")
        for c_type, cnt in counter.most_common():
            f.write(f"| {c_type} | {cnt} | {cnt/total*100:.1f}% |\n")

        max_cnt = counter.most_common(1)[0][1]
        min_cnt = counter.most_common()[-1][1]
        imbalance = max_cnt / max(min_cnt, 1)
        f.write("\n## 💡 불균형 진단\n\n")
        if imbalance > 3:
            f.write(f"> ⚠️ **불균형 감지!** 최다 유형이 최소 유형보다 **{imbalance:.1f}배** 많습니다.\n")
            f.write("> `expand_synthetic_data.py`를 실행하여 부족한 유형을 보충하세요.\n")
        else:
            f.write("> ✅ 데이터 분포가 비교적 균형잡혀 있습니다.\n")


# ─── 데이터 생성 ───────────────────────────────────────────────────────────────

def generate_synthetic_case(conflict_type: str, client: OpenAI) -> dict | None:
    prompt = f"""당신은 시니어 개발자입니다. AI 모델 학습을 위한 고품질의 Git Merge Conflict 데이터를 생성해야 합니다.
반드시 아래의 특수한 충돌 유형에 대한 현실적인 예시를 만들어주세요.

[목표 충돌 유형]
{conflict_type}

다음 JSON 형식으로만 응답하세요. (마크다운 백틱 없이 순수 JSON만 출력)
{{
    "instruction": "이 Git 충돌 상황을 분석하고 해결책을 설명해줘.",
    "input": {{
        "base": "충돌 발생 전 원본 코드",
        "ours": "내가 수정한 코드 (A 기능 추가)",
        "theirs": "동료가 수정한 코드 (B 기능 추가)"
    }},
    "output": "충돌 원인 분석과 두 코드를 안전하게 병합한 최종 해결 코드 및 설명"
}}"""
    try:
        resp    = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=1500,
        )
        content = resp.choices[0].message.content.strip()
        match   = re.search(r'\{.*\}', content, re.DOTALL)
        return json.loads(match.group(0)) if match else None
    except Exception as e:
        print(f"Generation error: {e}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Analyze distribution and/or expand synthetic dataset.")
    parser.add_argument("--count",        type=int,  default=20,
                        help="유형별 생성할 데이터 개수 (기본값: 20)")
    parser.add_argument("--analyze-only", action="store_true",
                        help="분포 분석만 수행하고 데이터 생성은 하지 않음")
    return parser.parse_args()

def main():
    args = parse_args()

    # 항상 분포 분석 먼저 실행
    print("\n[1/2] Analyzing current dataset distribution...")
    counter = analyze_distribution()
    if counter:
        print_and_save_distribution(counter)

    if args.analyze_only:
        print("\n[INFO] --analyze-only 모드: 데이터 생성을 건너뜁니다.")
        return

    # 데이터 생성
    print("\n[2/2] Generating new synthetic conflict cases...")
    client = OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))

    new_count = 0
    with open(DATA_FILE, "a", encoding="utf-8") as fout:
        for c_type in EXPANSION_TYPES:
            print(f"\n  [Generating] {c_type}...")
            for _ in tqdm(range(args.count)):
                case = generate_synthetic_case(c_type, client)
                if case:
                    fout.write(json.dumps(case, ensure_ascii=False) + "\n")
                    new_count += 1

    print(f"\n[SUCCESS] {new_count} new cases appended to: {DATA_FILE}")

if __name__ == "__main__":
    main()
