# 🚀 GitCat GPU Server Training Manual

본 디렉토리(`packages/ai-pipeline/trainer`)는 GitCat AI의 **HuggingFace SFT / DPO 학습을 위한 Python 전용 공간**입니다.

## 디렉토리 역할

- `build_jsonl.py`: `synthetic_dataset/` 원본 케이스를 학습/평가용 JSONL로 변환
- `train_sft.py`: SFT 학습 실행 스크립트
- `eval/`: 현행 LLM baseline, 오픈소스 모델 비교 결과, 평가 메모 기록 공간

## 1. 셋업 (GPU 서버 환경)

Git 레포지토리를 GPU 서버에 Clone 또는 Pull 한 뒤, Python 가상환경을 세팅합니다.

```bash
# 가상환경 생성 및 활성화
python3 -m venv .venv
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

## 2. 데이터 업로드 (SCP / Rsync)

Git에 업로드되지 않는(`gitignore` 처리됨) 학습용 JSONL 데이터는 로컬에서 직접 GPU 서버로 전송합니다.

```bash
# 로컬 PC 터미널에서 실행
scp ./dataset.jsonl user@gpu-server-ip:~/GitCat/packages/ai-pipeline/trainer/data/
```

## 3. 학습 스크립트 백그라운드 실행 (Tmux)

SSH 연결이 끊어져도 학습이 유지되도록 `tmux`를 적극 활용합니다.

```bash
# tmux 세션 생성
tmux new -s gitcat-train

# (tmux 내부에서) 전체 dataset 기준 SFT 학습 실행
python train_sft.py

# recommendation domain만 빠르게 smoke test
python train_sft.py --dataset-domain recommendation --max-samples 8 --max-steps 20

# branch_name recommendation만 분리 실험
python train_sft.py --dataset-domain recommendation --recommendation-type branch_name

# tmux 빠져나오기 (백그라운드로 돌리기)
# Ctrl + B 누른 후, D 누르기

# 나중에 다시 확인하기
tmux attach -t gitcat-train
```

## 4. 모니터링 (WandB 연동)

학습 실행 전 터미널에 WandB API 키를 등록하면, 로컬 PC 브라우저에서 GPU 서버의 Loss 하락 추이를 실시간으로 모니터링할 수 있습니다.

```bash
wandb login
```

학습이 정상적으로 완료되면 가중치(`.safetensors` 또는 체크포인트)는 `outputs/` 폴더에 생성됩니다. 이를 로컬로 가져와(`scp`) 추론 서버에 연동하여 검증합니다.

### 스크립트 핵심 옵션

- `--model-id`: 기본값은 `Qwen/Qwen2.5-Coder-7B-Instruct`
- `--dataset-path`: `build_jsonl.py`가 만든 JSONL 경로
- `--dataset-domain`: `merge` 또는 `recommendation`만 따로 학습할 때 사용
- `--recommendation-type`: `branch_name`, `commit_message`, `pr_description` 중 하나만 분리 실험할 때 사용
- `--max-samples`, `--max-steps`: 긴 GPU 학습 전에 smoke test용으로 사용
- `--report-to wandb`: WandB 로그인 환경에서만 활성화

## 5. 평가 결과 기록

현행 LLM baseline 평가나 이후 오픈소스 모델 비교 결과는 `eval/` 아래에 남깁니다.

예시:

```text
packages/ai-pipeline/trainer/eval/
  ├── llm_baseline_template.md
  ├── llm_baseline_2026-05-04.md
  └── llm_baseline_results.jsonl
```
