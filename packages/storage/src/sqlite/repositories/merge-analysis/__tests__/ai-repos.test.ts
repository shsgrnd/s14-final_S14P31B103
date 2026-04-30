import * as path from 'path';

import { GitCatDatabase } from '../../../client/client';
import { SqliteMergeProposalRepository } from '../SqliteMergeProposalRepository';
import { SqliteProposalFeedbackRepository } from '../SqliteProposalFeedbackRepository';
import type { MergeProposalRow } from '@gitcat/shared-types';
import type { CreateProposalFeedbackInput } from '@gitcat/shared-types';

async function runTest() {
  console.log('--- AI DB Repository 연동 테스트 시작 ---');
  
  const testWorkspace = path.join(__dirname, 'test-workspace');
  
  // 1. DB 생성 및 스키마 초기화
  const gitCatDb = await GitCatDatabase.create(testWorkspace);
  const db = gitCatDb.getInstance();
  
  console.log('✅ DB 스키마 초기화 성공');

  // 2. 외래키 제약조건을 만족하기 위한 더미 데이터 세팅
  db.exec(`
    INSERT INTO users (user_id, email, name, created_at, updated_at) 
    VALUES ('user_1', 'test@test.com', 'Test User', '2026-04-29T10:00:00Z', '2026-04-29T10:00:00Z');
    
    INSERT INTO projects (project_id, user_id, project_name, created_at, updated_at) 
    VALUES ('proj_1', 'user_1', 'Test Project', '2026-04-29T10:00:00Z', '2026-04-29T10:00:00Z');
    
    -- worktree, worktree_instance, merge_analyses, conflict_candidates 더미 데이터
    INSERT INTO worktrees (worktree_id, project_id, worktree_path, created_at, updated_at)
    VALUES ('wt_1', 'proj_1', '/test', '2026-04-29', '2026-04-29');

    INSERT INTO branches (branch_id, project_id, branch_name, created_at, updated_at)
    VALUES ('br_1', 'proj_1', 'main', '2026-04-29', '2026-04-29');

    INSERT INTO worktree_instances (worktree_instance_id, worktree_id, branch_id, created_at, updated_at)
    VALUES ('wti_1', 'wt_1', 'br_1', '2026-04-29', '2026-04-29');

    INSERT INTO merge_analyses (analysis_id, source_worktree_instance_id, target_worktree_instance_id, status, created_at)
    VALUES ('ana_1', 'wti_1', 'wti_1', 'completed', '2026-04-29T10:00:00Z');

    INSERT INTO conflict_candidates (candidate_id, analysis_id, file_path, detected_by, created_at)
    VALUES ('cand_1', 'ana_1', 'src/test.ts', 'git', '2026-04-29T10:00:00Z');
  `);
  console.log('✅ 부모 테이블 더미 데이터 세팅 성공');

  // 3. Repository 초기화
  const proposalRepo = new SqliteMergeProposalRepository(db);
  const feedbackRepo = new SqliteProposalFeedbackRepository(db);

  // 4. Merge Proposal 삽입 테스트
  const proposals: Array<Omit<MergeProposalRow, 'created_at'> & { created_at?: string }> = [
    {
      proposal_id: 'prop_1',
      candidate_id: 'cand_1',
      ai_request_id: 'req_1',
      file_path: 'src/test.ts',
      feature_type: 'merge_patch_draft',
      title: '테스트 제안서',
      explanation_summary: '설명 요약',
      confidence_score: 0.95,
      validation_required: 0, // SQLite 스키마 기준 boolean이 아닌 number(0 또는 1)로 저장됩니다.
      validation_summary: null, // 검증 요약 없음 (nullable 필수 필드)
      status: 'parsed',
      created_at: new Date().toISOString()
    }
  ];

  proposalRepo.insertMany(proposals).then(() => {
    console.log('✅ MergeProposalRepository.insertMany 성공');

    proposalRepo.listByAnalysis('ana_1').then((res) => {
      console.log(`✅ MergeProposalRepository.listByAnalysis 성공 (개수: ${res.length})`);
      if (res.length > 0 && res[0].title === '테스트 제안서') {
        console.log('   -> 데이터 정합성 검증 PASS');
      }

      // 5. Proposal Feedback 삽입 테스트
      const feedbackInput: CreateProposalFeedbackInput = {
        proposal_id: 'prop_1',
        project_id: 'proj_1',
        selection_status: 'accepted',
        quality_tag: 'useful', // 실제 허용 값: 'useful' | 'partially_useful' | 'not_useful' | 'incorrect' | 'unsafe' | 'needs_followup'
        feedback_note: '좋은 제안입니다.'
      };

      feedbackRepo.insert(feedbackInput).then((feedbackResult) => {
        console.log(`✅ ProposalFeedbackRepository.insert 성공 (ID: ${feedbackResult.feedback_id})`);
        
        feedbackRepo.listByProject('proj_1').then((feedbacks) => {
          console.log(`✅ ProposalFeedbackRepository.listByProject 성공 (개수: ${feedbacks.length})`);
          console.log('--- AI DB Repository 연동 테스트 끝 ---');
        });
      });
    });
  }).catch(e => {
    console.error('❌ 테스트 중 에러 발생:', e);
  });
}

runTest();
