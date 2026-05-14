# GitCat AI Model Export Pipeline

이 디렉토리는 GPU 서버에서 학습한 SFT/DPO **LoRA 어댑터**를 VS Code 익스텐션에서 오프라인으로 실행할 수 있는 **단일 GGUF 파일**로 자동 병합 및 변환해주는 파이프라인 스크립트를 포함하고 있습니다.

## 📂 파일 구성
- `merge_lora.py`: 원본 베이스 모델(`Qwen2.5-Coder`)과 학습된 LoRA 가중치를 하나로 병합하여 저장하는 파이썬 스크립트입니다.
- `export_gguf.sh`: 모델 병합부터 `llama.cpp` 클론, 의존성 설치, GGUF(F16) 변환까지 전체 과정을 제어하는 자동화 쉘 스크립트입니다.

---

## 🚀 사용 가이드 (GPU 서버 환경)

본 과정은 학습이 완료된 GPU 서버의 리눅스/WSL 터미널에서 수행하는 것을 권장합니다.

### 1. 스크립트 실행 권한 부여 (최초 1회)
```bash
cd packages/ai-pipeline/scripts/model-export
chmod +x export_gguf.sh
```

### 2. 파이프라인 스크립트 실행
학습이 완료된 LoRA 폴더의 절대 경로(혹은 상대 경로)를 첫 번째 인자로 전달하여 쉘 스크립트를 실행합니다.

```bash
# 기본 사용법 (기본 베이스 모델: Qwen/Qwen2.5-Coder-7B-Instruct)
./export_gguf.sh /경로/입력/gitcat-sft-lora-final

# (옵션) 베이스 모델이 다른 경우 두 번째 인자로 전달 가능
./export_gguf.sh /경로/입력/gitcat-sft-lora-final "다른/베이스-모델-경로"
```

### 3. 진행 과정 요약
스크립트를 실행하면 다음 작업이 자동으로 순서대로 진행됩니다:
1. `peft`, `transformers` 등 필수 파이썬 라이브러리 설치
2. `merge_lora.py` 실행 → `merged_hf_model` 폴더 생성
3. 공식 `llama.cpp` 리포지토리 클론 및 설치
4. 병합된 모델을 `gitcat-merged-f16.gguf` 파일(F16 정밀도)로 변환

### 4. 4-bit 양자화 적용 (선택 사항이나 강력히 권장)
생성된 `gitcat-merged-f16.gguf`는 용량이 매우 커서 로컬 PC에서 구동하기 무거울 수 있습니다. `llama.cpp`를 빌드한 후 `Q4_K_M` 양자화를 진행해 주세요. (약 4~5GB로 압축됩니다.)

```bash
cd llama.cpp
make -j
./llama-quantize ../gitcat-merged-f16.gguf ../gitcat-merged-Q4_K_M.gguf Q4_K_M
```

---

## 💻 로컬 PC(Windows/Mac)에 적용하기
1. GPU 서버에서 최종적으로 생성된 `gitcat-merged-Q4_K_M.gguf` 파일을 개발 중인 윈도우/맥 PC로 다운로드합니다.
2. VS Code에서 설정(`Ctrl + ,`)을 엽니다.
3. `Gitcat > Ai: Mode`를 `live-local`로 변경합니다.
4. `Gitcat > Ai: Local Model Path`에 다운로드한 GGUF 파일의 **절대 경로**를 입력하면 연동이 완료됩니다!
