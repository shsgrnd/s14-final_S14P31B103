당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_19
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: chore/ai/training-stack-upgrade/S14P31B103-209
Change Summary: peft, trl, accelerate 버전을 올리고 train_sft 기본 인자를 새 버전에 맞게 조정했다.
Changed Files: packages/ai-pipeline/trainer/requirements.txt, packages/ai-pipeline/trainer/train_sft.py
Work Intent: 학습 스택 의존성 업그레이드와 호환성 보정이 드러나는 커밋 메시지가 필요하다.
Diff Summary: dependency bump, trainer arg rename, mixed precision option alignment
Branch Context: 기능 추가보다 학습 환경 정렬과 재현성 보정이 중심이다.
Message Constraints: conventional-commit, imperative, use chore type
Ticket Ref: S14P31B103-209
