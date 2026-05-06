# Experiment Result: Strategy-C_Few-shot

> 실험 일시: 2026. 5. 6. 오후 4:13:23

## TEST-01: 변수명 선언 키워드 중복 수정

### 📥 Input
```text
Ours: const a = 1; 
Theirs: let a = 1; 
Base: var a = 1;
```

### 🤖 AI Answer
변수 선언 방식이 const, let, var로 충돌했습니다. 최신 문법인 let으로 통일하는 것을 권장합니다. const는 재할당이 불가능하므로 상황에 따라 적절히 선택하세요.

---

## TEST-02: 동일 함수 내 로직 충돌

### 📥 Input
```text
Ours: function add(a, b) { return a + b + 1; } 
Theirs: function add(a, b) { return a + b + 2; } 
Base: function add(a, b) { return a + b; }
```

### 🤖 AI Answer
덧셈 함수에서 반환값에 각각 +1과 +2가 추가되어 충돌했습니다. 의도한 결과에 따라 +1 또는 +2 중 하나로 통일하는 것이 좋습니다.

---

