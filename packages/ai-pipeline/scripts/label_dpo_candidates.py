import os
import json
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, "../data/dpo_candidates_filtered.jsonl")
OUTPUT_FILE = os.path.join(BASE_DIR, "../data/dpo_training_ready.jsonl")

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_already_labeled_prompts():
    """이미 검수 완료된 프롬프트 목록을 가져옵니다."""
    if not os.path.exists(OUTPUT_FILE):
        return set()
    
    labeled = set()
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                data = json.loads(line)
                labeled.add(data['prompt'])
    return labeled

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"[ERROR] Filtered data not found: {INPUT_FILE}")
        sys.exit(1)
        
    already_labeled = get_already_labeled_prompts()
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    print(f"[INFO] Total candidate sets: {len(lines)}")
    print(f"[INFO] Already labeled: {len(already_labeled)}")
    print("엔터를 누르면 DPO 검수 툴을 시작합니다. (종료하려면 언제든 'q'를 입력하세요)")
    input()
    
    for line in lines:
        if not line.strip():
            continue
            
        data = json.loads(line)
        prompt = data['prompt']
        
        if prompt in already_labeled:
            continue
            
        # 필터링을 통과한(auto_rejected == False) 후보만 추출
        valid_candidates = [c['text'] for c in data['candidates'] if not c.get('auto_rejected', False)]
        
        # 유효 후보가 2개 미만이면 비교(DPO)가 불가능하므로 스킵
        if len(valid_candidates) < 2:
            continue
            
        while True:
            clear_screen()
            print("="*80)
            print("🔥 [질문 / Prompt] 🔥\n")
            print(prompt)
            print("\n" + "="*80)
            
            for idx, text in enumerate(valid_candidates):
                print(f"\n🟢 [후보 {idx + 1}] 🟢\n")
                print(text[:500] + ("..." if len(text) > 500 else "")) # 너무 길면 잘라서 출력
                
            print("\n" + "="*80)
            print("비교 검수를 시작합니다. (종료: q, 건너뛰기: s, 전문보기: v)")
            
            user_input = input("가장 '좋은' 답변(Chosen)의 번호를 입력하세요: ").strip().lower()
            if user_input == 'q':
                print("검수를 중단하고 종료합니다. 수고하셨습니다!")
                return
            if user_input == 's':
                break # 다음 프롬프트로
            if user_input == 'v':
                # 전문 보기 기능 (추후 구현)
                continue
                
            try:
                chosen_idx = int(user_input) - 1
                if chosen_idx < 0 or chosen_idx >= len(valid_candidates):
                    print("잘못된 번호입니다. 엔터를 눌러 다시 시도하세요.")
                    input()
                    continue
            except ValueError:
                continue

            user_input = input("가장 '나쁜' 답변(Rejected)의 번호를 입력하세요: ").strip().lower()
            if user_input == 'q':
                return
            
            try:
                rejected_idx = int(user_input) - 1
                if rejected_idx < 0 or rejected_idx >= len(valid_candidates) or rejected_idx == chosen_idx:
                    print("잘못된 번호이거나 Chosen과 같은 번호입니다. 엔터를 눌러 다시 시도하세요.")
                    input()
                    continue
            except ValueError:
                continue
                
            # 성공적으로 고름! 저장 로직
            final_dpo_pair = {
                "prompt": prompt,
                "chosen": valid_candidates[chosen_idx],
                "rejected": valid_candidates[rejected_idx]
            }
            
            with open(OUTPUT_FILE, 'a', encoding='utf-8') as fout:
                fout.write(json.dumps(final_dpo_pair, ensure_ascii=False) + "\n")
                
            print("\n✅ 성공적으로 저장되었습니다! 다음으로 넘어갑니다.")
            break # while 루프 탈출, 다음 line으로

    print("\n🎉 모든 데이터의 검수가 끝났습니다! DPO 학습을 시작할 수 있습니다.")

if __name__ == "__main__":
    main()
