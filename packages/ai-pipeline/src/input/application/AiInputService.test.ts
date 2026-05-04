import { AiInputService } from './AiInputService';
import { MergeProposalInput, RecommendationInput } from '@gitcat/shared-types';

describe('AiInputService', () => {
  let aiInputService: AiInputService;

  beforeEach(() => {
    // Git 의존성 없이 단독으로 인스턴스화 가능
    aiInputService = new AiInputService();
  });

  describe('processMergeProposalInput', () => {
    it('should validate and process a valid MergeProposalInput payload', () => {
      const rawPayload: MergeProposalInput = {
        project_id: 'proj-123',
        session_id: 'sess-456',
        feature_type: 'merge_patch_draft',
        current_branch: 'feature/ai-integration',
        target_branch: 'develop',
        workspace_summary: 'Test workspace',
        related_files: ['src/index.ts'],
        conflict_candidates: [
          {
            candidate_id: 'cand-1',
            analysis_id: 'ana-1',
            file_path: 'src/index.ts',
            line_start: 10,
            line_end: 20,
            source_code: 'const a = 1;',
            target_code: 'const a = 2;',
            detected_by: 'git-merge',
          }
        ],
        working_tree_diff_ref: 'ref-123',
        schema_version: '1.0.0',
      };

      const result = aiInputService.processMergeProposalInput(rawPayload);
      
      expect(result).toBeDefined();
      expect(result.project_id).toBe('proj-123');
      expect(result.feature_type).toBe('merge_patch_draft');
    });

    it('should throw an error for invalid payload', () => {
      const invalidPayload = {
        project_id: 'proj-123',
        // missing session_id, etc.
      };

      expect(() => {
        aiInputService.processMergeProposalInput(invalidPayload);
      }).toThrow();
    });
  });

  describe('processRecommendationInput', () => {
    it('should validate and process a valid RecommendationInput payload', () => {
      const rawPayload: RecommendationInput = {
        project_id: 'proj-123',
        session_id: 'sess-456',
        feature_type: 'recommendation',
        recommendation_type: 'commit_message',
        current_branch: 'feature/login',
        change_summary: 'Added login component',
        changed_files: ['src/Login.tsx'],
        work_intent: 'Implement user login',
        schema_version: '1.0.0',
      };

      const result = aiInputService.processRecommendationInput(rawPayload);
      
      expect(result).toBeDefined();
      expect(result.recommendation_type).toBe('commit_message');
    });
  });
});
