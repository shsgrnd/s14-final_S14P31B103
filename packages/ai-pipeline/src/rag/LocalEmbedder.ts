import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';

/**
 * LocalEmbedder는 별도 임베딩 API 서버 없이 유저의 PC(VS Code Extension 환경)에서
 * 텍스트를 벡터로 변환(Embedding)해주는 클래스입니다.
 *
 * 다만 "완전 오프라인 번들"은 아니며, 첫 실행 시에는 Hugging Face 캐시가 없다면
 * 모델 다운로드가 발생할 수 있습니다. 그 이후에는 로컬 캐시를 재사용합니다.
 *
 * `Xenova/all-MiniLM-L6-v2` 모델은 가볍고(약 22MB) 성능이 좋아 MVP 단계의 로컬 RAG에 적합합니다.
 */
export class LocalEmbedder {
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2';

  constructor() {
    // 로컬 캐시 모델은 허용하고, 첫 실행 시 캐시 미존재 상황도 지원하기 위해
    // transformers 기본 다운로드 경로는 막지 않습니다.
    env.allowLocalModels = true;
  }

  /**
   * 모델을 로드하여 파이프라인을 초기화합니다.
   * 첫 실행 시에는 모델 가중치를 다운로드하여 캐시에 저장합니다.
   */
  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      // 파이프라인 타입은 'feature-extraction'을 사용하여 임베딩 추출
      this.pipelinePromise = pipeline('feature-extraction', this.modelName);
    }
    return this.pipelinePromise;
  }

  /**
   * 주어진 텍스트 청크를 임베딩 벡터로 변환합니다.
   * @param text 임베딩할 텍스트 (예: 코드 diff, 파일 내용 등)
   * @returns 384차원의 Float32Array 벡터
   */
  public async embed(text: string): Promise<Float32Array> {
    const pipe = await this.getPipeline();
    // pooling: 'mean'은 문장 전체의 평균 의미 벡터를 추출합니다.
    // normalize: true는 벡터의 크기를 1로 맞춰 코사인 유사도 계산을 쉽게 만듭니다.
    const output = await pipe(text, { pooling: 'mean', normalize: true });

    // Float32Array 형태로 변환하여 반환
    return output.data as Float32Array;
  }
}
