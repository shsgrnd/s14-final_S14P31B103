import json
import os

def generate_loop_prevention_data():
    samples = []
    
    # Template 1: JSON Repetition
    prompt_1 = "병합 결과를 JSON 형식으로 반환해 주세요."
    chosen_1 = '{"merged_code": "const a = 1;", "status": "success"}'
    rejected_1 = '{"merged_code": "const a = 1;", "status": "success"}' * 5 # 반복 발생
    
    samples.append({
        "prompt": prompt_1,
        "chosen": chosen_1,
        "rejected": rejected_1,
        "feature_type": "merge_patch_draft",
        "source": "loop_prevention"
    })
    
    # Template 2: Explanation Repetition
    prompt_2 = "충돌 원인을 설명해 주세요."
    chosen_2 = "두 브랜치에서 동일한 변수명을 서로 다른 값으로 수정하여 충돌이 발생했습니다."
    rejected_2 = "두 브랜치에서 동일한 변수명을 서로 다른 값으로 수정하여 충돌이 발생했습니다. " * 10
    
    samples.append({
        "prompt": prompt_2,
        "chosen": chosen_2,
        "rejected": rejected_2,
        "feature_type": "conflict_explanation",
        "source": "loop_prevention"
    })

    # Template 3: Infinite Tool Call loop simulation
    prompt_3 = "파일을 수정해 주세요."
    chosen_3 = "파일 수정이 완료되었습니다."
    rejected_3 = "파일 수정을 시작합니다... 파일 수정을 시작합니다... 파일 수정을 시작합니다... 파일 수정을 시작합니다..."
    
    samples.append({
        "prompt": prompt_3,
        "chosen": chosen_3,
        "rejected": rejected_3,
        "feature_type": "merge_mediation",
        "source": "loop_prevention"
    })

    # 더 많은 패턴 추가 가능
    
    output_path = "packages/ai-pipeline/data/loop_prevention_data.jsonl"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
            
    print(f"Generated {len(samples)} loop prevention samples at {output_path}")

if __name__ == "__main__":
    generate_loop_prevention_data()
