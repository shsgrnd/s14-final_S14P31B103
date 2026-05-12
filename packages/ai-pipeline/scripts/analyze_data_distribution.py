"""
analyze_data_distribution.py
=============================
명세서 요구사항 [기존 conflict type 분포 분석 및 불균형 보정]:
- 현재 데이터셋에 어떤 충돌 유형이 몇 개씩 있는지 자동으로 분석합니다.
- 분석 결과를 Markdown 리포트로 출력하여 팀원이 불균형 여부를 파악할 수 있게 합니다.
"""
import os
import json
import re
from collections import Counter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "../data/synthetic_conflict_dataset.jsonl")
OUTPUT_FILE = os.path.join(BASE_DIR, "../data/data_distribution_report.md")

# 충돌 유형 키워드 매핑 (instruction 또는 input 텍스트에서 탐지)
CONFLICT_TYPE_KEYWORDS = {
    "CI/CD Pipeline":       ["github actions", "workflow", ".yml", "ci/cd", "pipeline", "deploy"],
    "DB / Schema":          ["migration", "schema", "sql", "prisma", "typeorm", "alter table", "create table"],
    "Dependency / Package": ["package.json", "pom.xml", "requirements.txt", "dependencies", "version conflict"],
    "Configuration File":   ["dockerfile", "docker-compose", "nginx", "config", ".env", "settings"],
    "Source Code (General)":[]   # 위 키워드에 해당 없으면 일반 소스코드로 분류
}

def detect_conflict_type(data: dict) -> str:
    """입력 데이터에서 충돌 유형 키워드를 탐지하여 타입을 분류합니다."""
    text = ""
    instruction = data.get("instruction", "")
    raw_input   = data.get("input", "")

    if isinstance(raw_input, dict):
        text = instruction + " " + json.dumps(raw_input, ensure_ascii=False)
    else:
        text = instruction + " " + str(raw_input)

    text_lower = text.lower()

    for c_type, keywords in CONFLICT_TYPE_KEYWORDS.items():
        if not keywords:
            continue
        if any(kw in text_lower for kw in keywords):
            return c_type

    return "Source Code (General)"

def main():
    if not os.path.exists(DATA_FILE):
        print(f"[ERROR] Dataset not found: {DATA_FILE}")
        return

    type_counter = Counter()
    total = 0

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            data = json.loads(line)
            c_type = detect_conflict_type(data)
            type_counter[c_type] += 1
            total += 1

    if total == 0:
        print("[ERROR] No data found in dataset.")
        return

    # 결과 출력 (터미널)
    print("\n" + "="*55)
    print("📊 Conflict Type Distribution Analysis")
    print("="*55)
    print(f"Total Records: {total}\n")
    for c_type, cnt in type_counter.most_common():
        ratio = cnt / total * 100
        bar   = "█" * int(ratio / 2)
        print(f"  {c_type:<30} {cnt:>4}개 ({ratio:5.1f}%) {bar}")
    print("="*55)

    # Markdown 리포트 저장
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("# 📊 Conflict Type Distribution Report\n\n")
        f.write(f"**Total Records:** {total}\n\n")
        f.write("| Conflict Type | Count | Ratio |\n")
        f.write("| :--- | :---: | :---: |\n")
        for c_type, cnt in type_counter.most_common():
            ratio = cnt / total * 100
            f.write(f"| {c_type} | {cnt} | {ratio:.1f}% |\n")

        f.write("\n\n## 💡 불균형 진단\n\n")
        max_cnt = type_counter.most_common(1)[0][1]
        min_cnt = type_counter.most_common()[-1][1]
        imbalance_ratio = max_cnt / max(min_cnt, 1)

        if imbalance_ratio > 3:
            f.write(f"> ⚠️ **불균형 감지됨!** 가장 많은 유형이 가장 적은 유형보다 **{imbalance_ratio:.1f}배** 많습니다.\n")
            f.write("> `expand_synthetic_data.py`를 실행하여 부족한 유형 데이터를 보충하세요.\n")
        else:
            f.write("> ✅ **데이터 분포가 비교적 균형잡혀 있습니다.**\n")

    print(f"\n[SUCCESS] Report saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
