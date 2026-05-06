import { GitService } from '../git/GitService';
import {
  BranchRecommendationInputDto,
  BranchRecommendationRequestDto,
  BranchRecommendationResultDto,
} from './BranchRecommendationDto';

/**
 * 브랜치 추천 생성 진입점입니다.
 * 현재는 AI provider 호출 없이 Git raw data를 수집해 후속 AI 파트가 붙을 수 있는 입력까지만 만듭니다.
 */
export class BranchRecommendationService {
  constructor(private readonly gitService: GitService) {}

  public async recommendBranch(
    request: BranchRecommendationRequestDto,
  ): Promise<BranchRecommendationResultDto> {
    const input = await this.buildInput(request);
    console.log('[GitCat] Branch recommendation input prepared:', input);

    // TODO: AI 담당 모듈이 input을 prompt 입력으로 가공하고 외부 AI 호출 결과를 반환하도록 연결한다.
    // AI가 아직 연결되지 않은 상태를 빈 성공 응답으로 숨기지 않고 Webview에 명확히 알린다.
    throw new Error('브랜치 추천 AI가 아직 연결되지 않았습니다.');
  }

  private async buildInput(
    request: BranchRecommendationRequestDto,
  ): Promise<BranchRecommendationInputDto> {
    const [status, branches] = await Promise.all([
      this.gitService.getStatus(),
      this.gitService.getBranches(),
    ]);

    return {
      purpose: request.purpose,
      currentBranch: status.currentBranch,
      existingBranches: branches.map((branch) => branch.name),
    };
  }
}
