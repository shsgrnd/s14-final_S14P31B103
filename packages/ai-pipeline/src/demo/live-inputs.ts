import { AiInputPayload } from '@gitcat/shared-types';

const mergeBasePayload: AiInputPayload = {
  project_id: 'proj_gitcat_demo_01',
  session_id: 'ais_demo_merge_001',
  feature_type: 'merge_mediation',
  current_branch: 'feature/auth-error-flow',
  target_branch: 'develop',
  workspace_summary:
    '로그인 응답 DTO 구조 정리와 예외 처리 흐름 변경이 동시에 진행된 상태다.',
  related_files: [
    'src/auth/service.ts',
    'src/auth/controller.ts',
    'src/auth/dto.ts',
  ],
  conflict_candidates: [
    {
      candidate_id: 'cc_demo_001',
      analysis_id: 'ana_demo_001',
      file_path: 'src/auth/service.ts',
      line_start: 88,
      line_end: 121,
      source_code: [
        'async login(input: LoginInput): Promise<LoginResponseDto> {',
        '  const user = await this.repo.findByEmail(input.email);',
        '  if (!user) throw new AuthError("USER_NOT_FOUND");',
        '  return { accessToken: this.jwt.sign(user.id), profile: user.profile };',
        '}',
      ].join('\n'),
      target_code: [
        'async login(input: LoginInput): Promise<AuthResponse> {',
        '  const user = await this.repo.findByEmail(input.email);',
        '  if (!user) throw new NotFoundException("user");',
        '  return { token: this.jwt.issue(user), user: toAuthUser(user) };',
        '}',
      ].join('\n'),
      base_code: [
        'async login(input: LoginInput): Promise<LoginResponseDto> {',
        '  const user = await this.repo.findByEmail(input.email);',
        '  return { accessToken: this.jwt.sign(user.id) };',
        '}',
      ].join('\n'),
      conflict_type: 'signature_change',
      reason_summary: '반환 DTO와 예외 처리 방식이 동시에 바뀌었다.',
      risk_level: 'high',
      detected_by: 'diff',
    },
  ],
  working_tree_diff_ref: 'diff://local/demo/ais_demo_merge_001/working.diff',
  risk_summary: '인증 응답 타입 변경으로 컨트롤러-서비스 간 인터페이스 불일치 위험이 높다.',
  schema_version: 'v1',
};

const recommendationBasePayload: AiInputPayload = {
  project_id: 'proj_gitcat_demo_01',
  session_id: 'ais_demo_rec_001',
  feature_type: 'recommendation',
  recommendation_type: 'branch_name',
  current_branch: 'feature/wip-auth',
  workspace_summary:
    'AI 병합 지원 화면 연결 작업과 인증 응답 리팩토링이 함께 진행되고 있다.',
  change_summary:
    '로그인 응답 DTO를 정리하고 인증 예외 처리 흐름을 안정화하면서 AI 병합 지원 화면 연결 코드를 추가했다.',
  changed_files: [
    'src/auth/service.ts',
    'src/auth/dto.ts',
    'apps/webview-ui/src/features/merge-result-panel.tsx',
  ],
  work_intent:
    '인증 응답 구조를 정리하고 AI 결과 패널 연결 작업을 한 번에 설명할 수 있는 브랜치명을 만들고 싶다.',
  diff_summary:
    'auth service return type, dto naming, merge result panel wiring 변경이 포함된다.',
  branch_context: 'develop에서 파생된 feature 브랜치이며 팀 컨벤션은 feature/<topic> 형식을 선호한다.',
  ticket_ref: 'GCAT-214',
  naming_constraints: ['slash-prefix-required', 'english-only', 'kebab-case'],
  schema_version: 'v1',
};

export const liveDemoScenarios: Record<string, AiInputPayload> = {
  merge_mediation: mergeBasePayload,
  conflict_explanation: {
    ...mergeBasePayload,
    session_id: 'ais_demo_conflict_001',
    feature_type: 'conflict_explanation',
  },
  merge_patch_draft: {
    ...mergeBasePayload,
    session_id: 'ais_demo_patch_001',
    feature_type: 'merge_patch_draft',
  },
  recommendation_branch_name: recommendationBasePayload,
  recommendation_commit_message: {
    ...recommendationBasePayload,
    session_id: 'ais_demo_rec_002',
    recommendation_type: 'commit_message',
    message_constraints: ['conventional-commit', 'subject-under-50'],
  },
  recommendation_work_description: {
    ...recommendationBasePayload,
    session_id: 'ais_demo_rec_003',
    recommendation_type: 'work_description',
  },
};

export function listLiveDemoScenarioNames(): string[] {
  return Object.keys(liveDemoScenarios);
}
