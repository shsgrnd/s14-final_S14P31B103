import os
import json
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, "../data/dpo_candidates_raw.jsonl")
OUTPUT_FILE = os.path.join(BASE_DIR, "../data/dpo_candidates_filtered.jsonl")

def contains_korean(text):
    """텍스트에 한글이 포함되어 있는지 확인"""
    # 한글 유니코드 범위: 가-힣
    return bool(re.search(r'[가-힣]', text))

def has_excessive_repetition(text):
    """무한 반복 패턴(Hallucination) 감지"""
    # 임의로 동일한 10글자 이상의 패턴이 5번 이상 반복되면 에러로 간주
    words = text.split()
    if len(words) < 20:
        return False
    
    # 단순 단어 반복 체크 (예: "입니다 입니다 입니다...")
    for i in range(len(words) - 5):
        if words[i] == words[i+1] == words[i+2] == words[i+3] == words[i+4]:
            return True
    return False

def validate_candidate(candidate_text, prompt_text):
    """단일 후보 답변이 유효한지 검사하고, 실패 시 사유를 반환"""
    text = candidate_text.strip()
    
    # 1. 길이 검사
    if len(text) < 50:
        return "TOO_SHORT (50자 미만)"
        
    # 2. 한국어 포함 여부 검사 (설명 모델이므로 한국어가 필수)
    if not contains_korean(text):
        return "NO_KOREAN (한국어 미포함)"
        
    # 3. 무한 반복 검사
    if has_excessive_repetition(text):
        return "REPETITION_DETECTED (무한 반복 감지)"
        
    # 4. 프롬프트 단순 복사 검사
    if text in prompt_text or prompt_text in text:
        return "PROMPT_ECHO (질문 단순 복사)"
        
    return None # 유효함

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"[ERROR] Input file not found: {INPUT_FILE}")
        print("Please run generate_dpo_candidates.py first.")
        return

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    total_prompts = 0
    valid_prompts = 0 # 유효한 후보가 1개 이상 있는 프롬프트 수
    total_candidates = 0
    rejected_candidates = 0
    
    print("[START] Validating DPO Candidates...")
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as fin, open(OUTPUT_FILE, 'w', encoding='utf-8') as fout:
        for line in fin:
            if not line.strip():
                continue
                
            data = json.loads(line)
            prompt_text = data['prompt']
            total_prompts += 1
            
            valid_candidate_count = 0
            
            for candidate in data['candidates']:
                total_candidates += 1
                reject_reason = validate_candidate(candidate['text'], prompt_text)
                
                if reject_reason:
                    candidate['auto_rejected'] = True
                    candidate['reject_reason'] = reject_reason
                    rejected_candidates += 1
                else:
                    candidate['auto_rejected'] = False
                    valid_candidate_count += 1
                    
            # 완전히 다 망가진 답변만 있는 프롬프트는 아예 제외할 수도 있지만,
            # 일단은 분석을 위해 모두 저장합니다.
            if valid_candidate_count >= 2:
                # DPO는 최소 2개의 비교 가능한 답변이 있어야 의미가 큼
                valid_prompts += 1
                
            fout.write(json.dumps(data, ensure_ascii=False) + "\n")

    print("\n[REPORT] Validation Completed!")
    print(f"- Total Prompts Processed: {total_prompts}")
    print(f"- Prompts with enough valid candidates (>=2): {valid_prompts}")
    print(f"- Total Candidates Evaluated: {total_candidates}")
    print(f"- Candidates Auto-Rejected: {rejected_candidates} ({(rejected_candidates/total_candidates)*100 if total_candidates > 0 else 0:.1f}%)")
    print(f"\n[SUCCESS] Filtered data saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
