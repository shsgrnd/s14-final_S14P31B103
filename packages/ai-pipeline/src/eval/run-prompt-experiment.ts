import * as fs from 'fs';
import * as path from 'path';
import { AiClient } from '../provider/AiClient';
import { loadRootEnv } from '../config/load-root-env';

/**
 * 프롬프트 최적화 실험 자동화 스크립트 (Refactored)
 * 기존 프로젝트의 AiClient와 환경 변수 로더를 사용합니다.
 */

// 루트 .env 로드
loadRootEnv();

const client = new AiClient({
    mode: 'live',
    model: process.env.GMS_MODEL || 'gpt-4o-mini',
    temperature: 0.2
});

// [1] 테스트용 골든 데이터셋
const goldenDataset = [
    {
        id: 'TEST-01',
        title: '변수명 선언 키워드 중복 수정',
        input: 'Ours: const a = 1; \nTheirs: let a = 1; \nBase: var a = 1;'
    },
    {
        id: 'TEST-02',
        title: '동일 함수 내 로직 충돌',
        input: 'Ours: function add(a, b) { return a + b + 1; } \nTheirs: function add(a, b) { return a + b + 2; } \nBase: function add(a, b) { return a + b; }'
    }
];

// [2] 4단계 실험 전략 정의
const strategies = {
    'Strategy-A_Zero-shot': {
        system: "너는 Git 충돌 해결사야.",
        user: (input: string) => `다음 코드 충돌 상황(Ours, Theirs, Base)을 분석하여 충돌 원인을 설명하고 해결책을 제시해줘.\n\n${input}`
    },
    'Strategy-B_Persona': {
        system: "너는 10년 차 시니어 소프트웨어 엔지니어이자 Git 마스터야. 사용자가 겪고 있는 코드 충돌의 기술적 원인을 분석해주는 역할을 수행해. 답변은 전문적이면서도 친절한 한국어로 작성해줘.",
        user: (input: string) => input
    },
    'Strategy-C_Few-shot': {
        system: "너는 Git 마스터야. 다음 예시를 참고해서 답변해.\n예시:\n입력: Ours: const x=1; Theirs: let x=1;\n답변: 변수 선언 방식이 const와 let으로 충돌했습니다. 현대적 문법인 let으로 통일하는 것을 권장합니다.",
        user: (input: string) => `질문: ${input}`
    },
    'Strategy-D_CoT': {
        system: "너는 시니어 엔지니어이야. 다음 단계를 거쳐 생각하고 답변해.\n1. Base 대비 각 브랜치의 변경 의도 파악\n2. 두 변경 사항이 충돌하는 기술적 이유 도출\n3. 최적의 중재안 생성",
        user: (input: string) => `질문: ${input}`
    }
};

async function runExperiment() {
    const resultsDir = path.resolve(__dirname, '../../../../docs/evaluation/prompt-experiments/results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    console.log('🧪 [Phase 1] 프롬프트 최적화 실험 시작 (Project Client Mode)...');

    for (const [sName, strategy] of Object.entries(strategies)) {
        console.log(`\n▶ 전략 실행 중: ${sName}`);
        let report = `# Experiment Result: ${sName}\n\n`;
        report += `> 실험 일시: ${new Date().toLocaleString()}\n\n`;

        for (const test of goldenDataset) {
            console.log(`  - 테스트 케이스: ${test.id}`);
            
            try {
                // AiClient를 사용하여 호출
                const answer = await client.generateResponse('conflict_explanation', {
                    systemPrompt: strategy.system,
                    userPrompt: strategy.user(test.input)
                });

                report += `## ${test.id}: ${test.title}\n\n`;
                report += `### 📥 Input\n\`\`\`text\n${test.input}\n\`\`\`\n\n`;
                report += `### 🤖 AI Answer\n${answer}\n\n---\n\n`;
            } catch (err: any) {
                console.error(`  ❌ 에러 발생 (${test.id}): ${err.message}`);
                report += `## ${test.id}: ERROR\n${err.message}\n\n---\n\n`;
            }
        }

        const outputPath = path.join(resultsDir, `${sName}.md`);
        fs.writeFileSync(outputPath, report, 'utf-8');
    }

    console.log(`\n✅ 실험이 완료되었습니다!`);
    console.log(`📂 리포트 위치: docs/evaluation/prompt-experiments/results/`);
}

runExperiment().catch(err => {
    console.error('💥 실험 중 치명적 오류 발생:', err);
});
