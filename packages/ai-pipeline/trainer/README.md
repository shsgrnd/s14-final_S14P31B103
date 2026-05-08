# 🚀 GitCat GPU Server Training Manual

본 디렉토리(`packages/ai-pipeline/trainer`)는 GitCat AI의 **HuggingFace SFT / DPO 학습을 위한 Python 전용 공간**입니다.

## 디렉토리 역할

- `build_jsonl.py`: `synthetic_dataset/` 원본 케이스를 학습/평가용 JSONL로 변환
- `train_sft.py`: SFT 학습 실행 스크립트
- `eval/`: 현행 LLM baseline, 오픈소스 모델 비교 결과, 평가 메모 기록 공간

## 1. 셋업 (GPU 서버 환경)

Git 레포지토리를 GPU 서버에 Clone 또는 Pull 한 뒤, Python 가상환경을 세팅합니다.

```bash
# conda 환경 생성 및 활성화
conda create -n gitcat-sft python=3.10 -y
conda activate gitcat-sft

# 의존성 설치
pip install -r requirements.txt
```

### CUDA / PyTorch 호환성 체크

현재 GPU 서버 드라이버 기준 CUDA는 `12.8`입니다.  
따라서 `torch`가 `cu130` wheel로 설치되면 `torch.cuda.is_available()`가 `False`가 되며 학습이 CPU 모드로 떨어질 수 있습니다.

처음 환경을 만든 직후 아래 명령으로 설치 상태를 확인합니다.

```bash
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.version.cuda)"
```

정상 기대값:

```text
2.10.0+cu128
True
12.8
```

만약 `cu130`, `False`, `13.0`처럼 나오면 아래처럼 PyTorch만 CUDA 12.8 build로 다시 맞춥니다.

```bash
pip uninstall -y torch torchvision torchaudio
pip install torch==2.10.0 torchvision==0.25.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cu128
```

## 2. 데이터 업로드 (SCP / Rsync)

Git에 업로드되지 않는(`gitignore` 처리됨) 학습용 JSONL 데이터는 로컬에서 직접 GPU 서버로 전송합니다.

```bash
# 로컬 PC 터미널에서 실행
scp ./dataset.jsonl user@gpu-server-ip:~/GitCat/packages/ai-pipeline/trainer/data/
```

또는 서버에서 직접 JSONL을 다시 생성할 수도 있습니다.

```bash
cd /path/to/repo
python3 packages/ai-pipeline/trainer/build_jsonl.py
```

## 3. 학습 스크립트 백그라운드 실행 (Tmux)

SSH 연결이 끊어져도 학습이 유지되도록 `tmux`를 적극 활용합니다.

```bash
# tmux 세션 생성
tmux new -s gitcat-train

# (tmux 내부에서) 전체 dataset 기준 SFT 학습 실행
CUDA_VISIBLE_DEVICES=0 python train_sft.py

# recommendation domain만 빠르게 smoke test
CUDA_VISIBLE_DEVICES=0 python train_sft.py --dataset-domain recommendation --max-samples 8 --max-steps 20

# branch_name recommendation만 분리 실험
CUDA_VISIBLE_DEVICES=0 python train_sft.py --dataset-domain recommendation --recommendation-type branch_name

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

### 권장 실행 순서

팀원이 GPU 서버에서 그대로 따라 하기 쉬운 최소 순서는 아래와 같습니다.

```bash
conda activate gitcat-sft
cd /path/to/repo
pip install -r packages/ai-pipeline/trainer/requirements.txt
python3 packages/ai-pipeline/trainer/build_jsonl.py
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.version.cuda)"
cd packages/ai-pipeline/trainer
CUDA_VISIBLE_DEVICES=0 python train_sft.py --dataset-domain recommendation --max-samples 8 --max-steps 20
```

smoke test가 통과하면 전체 학습으로 넘어갑니다.

## 5. 평가 결과 기록

현행 LLM baseline 평가나 이후 오픈소스 모델 비교 결과는 `eval/` 아래에 남깁니다.

예시:

```text
packages/ai-pipeline/trainer/eval/
  ├── llm_baseline_template.md
  ├── llm_baseline_2026-05-04.md
  └── llm_baseline_results.jsonl
```
