import fs from 'fs';
import path from 'path';
import { loadRootEnv } from '../config/load-root-env';
import {
  GitCatAIClient,
  resolveGmsOpenAiBaseUrl,
} from '../client';

/**
 * baseline 평가용 JSONL 한 줄의 모양입니다.
 *
 * - prompt: synthetic_dataset에서 만든 입력 원문
 * - chosen: 사람이 만든 정답 JSON 문자열
 *
 * 이 스크립트는 이 두 값을 읽어 "현재 연결된 LLM이 정답과 얼마나 비슷한지"
 * 비교하는 데 사용합니다.
 */
interface DatasetRow {
  prompt: string;
  chosen: string;
}

/**
 * baseline 평가 결과를 한 케이스씩 저장하는 레코드 구조입니다.
 *
 * 목적:
 * 1. 원본 prompt / chosen 보존
 * 2. 실제 LLM raw 응답 보존
 * 3. JSON 파싱 성공 여부, exact match 여부 같은 비교 지표 기록
 * 4. 나중에 오픈소스 모델 결과와 같은 형식으로 다시 비교 가능하게 만들기
 */
interface BaselineEvalRecord {
  case_id: string;
  feature_type: string;
  prompt: string;
  chosen: string;
  raw_response: string;
  normalized_response: string;
  json_parse_ok: boolean;
  exact_json_match: boolean;
  response_json?: unknown;
  error?: string;
}

/**
 * 현재 모노레포 루트를 계산합니다.
 * trainer/eval이 아니라 repo 전체 기준 경로를 써야
 * synthetic_dataset, data, results 위치를 안정적으로 찾을 수 있습니다.
 */
function getWorkspaceRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

/**
 * build_jsonl.py가 생성한 baseline 입력 JSONL 위치입니다.
 */
function getDatasetJsonlPath(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    'packages',
    'ai-pipeline',
    'data',
    'synthetic_conflict_dataset.jsonl',
  );
}

/**
 * 사람이 직접 작성한 원본 케이스 폴더 위치입니다.
 * case_id를 추출할 때 사용합니다.
 */
function getSyntheticDatasetRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'synthetic_dataset');
}

/**
 * baseline 결과물을 저장할 폴더입니다.
 * 결과 JSONL과 요약 MD를 모두 이 위치에 기록합니다.
 */
function getResultsDir(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    'packages',
    'ai-pipeline',
    'trainer',
    'eval',
    'results',
  );
}

/**
 * 절대경로를 repo 상대경로 문자열로 바꿉니다.
 * 요약 md에 경로를 기록할 때 로컬 PC 사용자 경로가 노출되지 않도록 사용합니다.
 */
function toRepoRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join('/');
}

/**
 * JSONL 파일을 줄 단위로 읽어 DatasetRow 배열로 변환합니다.
 */
function readJsonl(filePath: string): DatasetRow[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatasetRow);
}

/**
 * synthetic_dataset 아래 case_* 폴더 이름을 정렬해서 가져옵니다.
 *
 * 주의:
 * JSONL은 case 폴더 순서대로 만들어진다고 가정하므로,
 * 여기서도 같은 정렬 기준을 써서 case_id와 prompt/chosen을 매칭합니다.
 */
function listCaseIds(datasetRoot: string): string[] {
  return fs
    .readdirSync(datasetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('case_'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * prompt.md의 첫 줄을 system prompt,
 * 나머지 본문을 user prompt로 분리합니다.
 *
 * 우리 synthetic dataset은
 * "고정 시스템 지시문 1줄 + 충돌 본문"
 * 구조를 따르므로 이 방식으로 baseline 평가 입력을 복원합니다.
 */
function extractSystemAndUserPrompt(prompt: string): { systemPrompt: string; userPrompt: string } {
  const lines = prompt.replace(/\r\n/g, '\n').split('\n');
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyIndex < 0) {
    throw new Error('Prompt is empty');
  }

  const systemPrompt = lines[firstNonEmptyIndex].trim();
  const userPrompt = lines.slice(firstNonEmptyIndex + 1).join('\n').trim();

  return {
    systemPrompt,
    userPrompt: userPrompt || prompt,
  };
}

/**
 * 모델이 ```json ... ``` 같은 fenced block으로 답한 경우를 대비해
 * 안쪽 JSON 본문만 꺼내 비교하기 쉽게 정규화합니다.
 */
function normalizeModelResponse(response: string): string {
  const trimmed = response.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

/**
 * 문자열 안에 섞인 workspace 절대경로를 제거하고 repo 상대경로 형태로 정규화합니다.
 *
 * 예:
 * - C:\Users\...\repo\packages\ai-pipeline\data\file.jsonl
 * - /mnt/c/.../repo/packages/ai-pipeline/data/file.jsonl
 *
 * -> packages/ai-pipeline/data/file.jsonl
 */
function sanitizeAbsolutePathText(text: string, workspaceRoot: string): string {
  const variants = Array.from(
    new Set([
      workspaceRoot,
      workspaceRoot.replace(/\\/g, '/'),
      workspaceRoot.replace(/\//g, '\\'),
    ]),
  ).sort((a, b) => b.length - a.length);

  let sanitized = text;
  for (const variant of variants) {
    sanitized = sanitized.split(`${variant}\\`).join('');
    sanitized = sanitized.split(`${variant}/`).join('');
    if (sanitized === variant) {
      sanitized = '.';
    }
  }

  return sanitized.replace(/\\/g, '/');
}

/**
 * 결과 레코드 전체에서 절대경로를 제거합니다.
 * prompt / chosen / raw_response / response_json 어디에 경로가 들어와도
 * 결과 파일에는 repo 상대경로만 남도록 강제합니다.
 */
function sanitizeValue<T>(value: T, workspaceRoot: string): T {
  if (typeof value === 'string') {
    return sanitizeAbsolutePathText(value, workspaceRoot) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, workspaceRoot)) as T;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, innerValue]) => [
        key,
        sanitizeValue(innerValue, workspaceRoot),
      ]),
    ) as T;
  }

  return value;
}

/**
 * chosen JSON 구조를 보고 feature_type을 추정합니다.
 *
 * baseline 요약에서 merge_patch_draft / conflict_explanation / merge_mediation
 * 성능을 따로 집계하기 위해 사용합니다.
 */
function inferFeatureType(chosen: string): string {
  try {
    const parsed = JSON.parse(chosen) as Record<string, unknown>;
    if ('merged_code' in parsed) {
      return 'merge_patch_draft';
    }
    if ('recommended_option' in parsed) {
      return 'merge_mediation';
    }
    if ('cause_summary' in parsed) {
      return 'conflict_explanation';
    }
  } catch {
    // no-op
  }

  return 'unknown';
}

/**
 * JSON 파싱 성공/실패를 예외 없이 다루기 위한 헬퍼입니다.
 */
function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/**
 * 객체 key 순서를 고정한 문자열로 변환합니다.
 *
 * 단순 문자열 비교 대신 stable stringify를 쓰면,
 * key 순서만 다른 동일 JSON도 같은 값으로 볼 수 있습니다.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

/**
 * 결과 파일명에 붙일 timestamp를 생성합니다.
 */
function createTimestamp(now: Date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

/**
 * baseline 결과를 사람이 빠르게 볼 수 있도록 요약 Markdown을 생성합니다.
 *
 * 현재는 아래 정보를 모아 줍니다.
 * - 총 케이스 수
 * - JSON 파싱 성공 수
 * - exact JSON match 수
 * - feature_type별 통계
 * - 케이스별 성공/실패 표
 */
function buildSummaryMarkdown(
  modelName: string,
  resultsPath: string,
  datasetPath: string,
  records: BaselineEvalRecord[],
): string {
  const total = records.length;
  const jsonOk = records.filter((record) => record.json_parse_ok).length;
  const exactMatch = records.filter((record) => record.exact_json_match).length;
  const featureCounts = new Map<string, { total: number; exact: number }>();

  for (const record of records) {
    const current = featureCounts.get(record.feature_type) ?? { total: 0, exact: 0 };
    current.total += 1;
    if (record.exact_json_match) {
      current.exact += 1;
    }
    featureCounts.set(record.feature_type, current);
  }

  const lines: string[] = [
    '# LLM Baseline Eval',
    '',
    '## 실행 정보',
    `- Model: ${modelName}`,
    `- Dataset: ${datasetPath}`,
    `- Results: ${resultsPath}`,
    '',
    '## 전체 요약',
    `- 총 케이스 수: ${total}`,
    `- JSON 형식 준수 수: ${jsonOk}/${total}`,
    `- exact JSON match 수: ${exactMatch}/${total}`,
    '',
    '## feature_type별 요약',
    '| feature_type | total | exact_match |',
    '| --- | --- | --- |',
  ];

  for (const [featureType, count] of featureCounts.entries()) {
    lines.push(`| ${featureType} | ${count.total} | ${count.exact} |`);
  }

  lines.push('', '## 케이스별 결과', '| case_id | feature_type | json_parse_ok | exact_json_match |', '| --- | --- | --- | --- |');
  for (const record of records) {
    lines.push(
      `| ${record.case_id} | ${record.feature_type} | ${record.json_parse_ok ? 'Y' : 'N'} | ${record.exact_json_match ? 'Y' : 'N'} |`,
    );
  }

  return lines.join('\n');
}

/**
 * 실행 흐름
 * 1. 루트 .env 로드
 * 2. synthetic_dataset -> JSONL 입력 파일 확인
 * 3. 현재 GMS 연결 LLM 호출
 * 4. 케이스별 결과를 results/*.jsonl에 저장
 * 5. 사람이 읽기 쉬운 요약을 results/*.md에 저장
 *
 * --limit N 옵션을 주면 앞에서 N개만 실행해 빠르게 smoke test 할 수 있습니다.
 */
async function main(): Promise<void> {
  loadRootEnv();
  const workspaceRoot = getWorkspaceRoot();
  const datasetPath = getDatasetJsonlPath(workspaceRoot);
  const datasetRoot = getSyntheticDatasetRoot(workspaceRoot);
  const resultsDir = getResultsDir(workspaceRoot);
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const limitArgIndex = args.findIndex((arg) => arg === '--limit');
  const limit =
    limitArgIndex >= 0 && args[limitArgIndex + 1]
      ? Number(args[limitArgIndex + 1])
      : undefined;

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset JSONL not found: ${datasetPath}`);
  }

  const apiKey = process.env.GMS_KEY;
  const baseUrl = process.env.GMS_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error('GMS_KEY and GMS_BASE_URL are required to run baseline evaluation');
  }

  const datasetRows = readJsonl(datasetPath);
  const caseIds = listCaseIds(datasetRoot);

  if (datasetRows.length !== caseIds.length) {
    console.warn(
      `[Baseline Eval] Warning: JSONL rows (${datasetRows.length}) and dataset folders (${caseIds.length}) differ.`,
    );
  }

  const effectiveRows = typeof limit === 'number' && Number.isFinite(limit)
    ? datasetRows.slice(0, limit)
    : datasetRows;

  const client = new GitCatAIClient({
    apiKey,
    baseURL: resolveGmsOpenAiBaseUrl(baseUrl),
    model: process.env.GMS_MODEL,
    temperature: 0,
    timeoutMs: 45_000,
  });

  fs.mkdirSync(resultsDir, { recursive: true });
  const timestamp = createTimestamp();
  const resultsPath = path.join(resultsDir, `llm_baseline_results_${timestamp}.jsonl`);
  const summaryPath = path.join(resultsDir, `llm_baseline_${timestamp}.md`);

  const records: BaselineEvalRecord[] = [];

  for (let index = 0; index < effectiveRows.length; index += 1) {
    const row = effectiveRows[index];
    const caseId = caseIds[index] ?? `case_${String(index + 1).padStart(2, '0')}`;
    const featureType = inferFeatureType(row.chosen);
    const { systemPrompt, userPrompt } = extractSystemAndUserPrompt(row.prompt);

    console.log(`[Baseline Eval] (${index + 1}/${effectiveRows.length}) ${caseId}`);

    try {
      // 현재 연결된 LLM에 실제 prompt를 보내 baseline 응답을 받습니다.
      const rawResponse = await client.callModel({ systemPrompt, userPrompt });
      const normalizedResponse = normalizeModelResponse(rawResponse);
      const responseParse = safeParseJson(normalizedResponse);
      const chosenParse = safeParseJson(row.chosen);
      const exactJsonMatch =
        responseParse.ok &&
        chosenParse.ok &&
        stableStringify(responseParse.value) === stableStringify(chosenParse.value);

      const record = sanitizeValue<BaselineEvalRecord>({
        case_id: caseId,
        feature_type: featureType,
        prompt: row.prompt,
        chosen: row.chosen,
        raw_response: rawResponse,
        normalized_response: normalizedResponse,
        json_parse_ok: responseParse.ok,
        exact_json_match: exactJsonMatch,
        response_json: responseParse.ok ? responseParse.value : undefined,
      }, workspaceRoot);
      records.push(record);
      fs.appendFileSync(resultsPath, `${JSON.stringify(record, null, 0)}\n`, 'utf8');
    } catch (error) {
      // 개별 케이스 실패도 전체 실행은 계속 이어가도록 기록만 남깁니다.
      const message = error instanceof Error ? error.message : String(error);
      const record = sanitizeValue<BaselineEvalRecord>({
        case_id: caseId,
        feature_type: featureType,
        prompt: row.prompt,
        chosen: row.chosen,
        raw_response: '',
        normalized_response: '',
        json_parse_ok: false,
        exact_json_match: false,
        error: message,
      }, workspaceRoot);
      records.push(record);
      fs.appendFileSync(resultsPath, `${JSON.stringify(record, null, 0)}\n`, 'utf8');
    }
  }

  const summary = buildSummaryMarkdown(
    process.env.GMS_MODEL ?? 'unknown-model',
    toRepoRelativePath(workspaceRoot, resultsPath),
    toRepoRelativePath(workspaceRoot, datasetPath),
    records,
  );
  fs.writeFileSync(summaryPath, summary, 'utf8');

  console.log(`[Baseline Eval] Results written to: ${resultsPath}`);
  console.log(`[Baseline Eval] Summary written to: ${summaryPath}`);
}

main().catch((error) => {
  console.error('[Baseline Eval] Failed');
  console.error(error);
  process.exit(1);
});
