# Chunking Report: client.ts

- Total Chunks: 4
- Avg Tokens: 192

### Chunk 1 (182 tokens) 
```text
[Source: client.ts]
import OpenAI from 'openai';

export const DEFAULT_GMS_GATEWAY_BASE_URL = 'https://gms.ssafy.io/gmsapi/';

export interface GitCatAiClientConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
  baseURL?: string;
}

export interface GitCatAiRequest {
  systemPrompt: string;
  userPrompt: string;
}

function normalizeGatewayBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/**
 * GMS 게이트웨이 뒤에 OpenAI 호환 경로를 붙여,
 * 최종 호출이 `.../gmsapi/api.openai.com/v1/chat/completions`로 나가도록 만듭니다.
 */
```

### Chunk 2 (231 tokens) 
```text
[Source: client.ts]
이트웨이 뒤에 OpenAI 호환 경로를 붙여,
 * 최종 호출이 `.../gmsapi/api.openai.com/v1/chat/completions`로 나가도록 만듭니다.
 */
export function resolveGmsOpenAiBaseUrl(
  gatewayBaseUrl: string = DEFAULT_GMS_GATEWAY_BASE_URL,
): string {
  return `${normalizeGatewayBaseUrl(gatewayBaseUrl)}api.openai.com/v1`;
}

/**
 * OpenAI SDK를 감싸는 얇은 어댑터입니다.
 * ai-pipeline 레이어에서는 이 객체를 통해 "실제 LLM 호출"만 수행하고,
 * 프롬프트 구성이나 결과 파싱은 상위 서비스에서 계속 담당합니다.
 */
export class GitCatAIClient {
  private readonly openai: OpenAI;

  private readonly model: string;

  private readonly temperature: number;

  constructor(config: GitCatAiClientConfig) {
```

### Chunk 3 (207 tokens) 
```text
[Source: client.ts]
el: string;

  private readonly temperature: number;

  constructor(config: GitCatAiClientConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? resolveGmsOpenAiBaseUrl(),
      maxRetries: config.maxRetries ?? 2,
      timeout: config.timeoutMs ?? 45_000,
    });
    this.model = config.model ?? 'gpt-4o-mini';
    this.temperature = config.temperature ?? 0.2;
  }

  /**
   * 시스템/유저 프롬프트를 실제 모델로 전송하고 텍스트 응답을 반환합니다.
   * structured output 계약은 시스템 프롬프트와 파서에서 함께 보장합니다.
   */
  public async callModel(request: GitCatAiRequest): Promise<string> {
```

### Chunk 4 (147 tokens) 
```text
[Source: client.ts]
스템 프롬프트와 파서에서 함께 보장합니다.
   */
  public async callModel(request: GitCatAiRequest): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned an empty response content');
    }

    return content;
  }
}
```

