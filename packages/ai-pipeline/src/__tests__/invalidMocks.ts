export const invalidInputMocks = [
  {
    name: "merge_patch_draft - target_branch 누락",
    payload: {
      project_id: "proj_123",
      session_id: "sess_123",
      feature_type: "merge_patch_draft",
      current_branch: "feat",
      // target_branch missing
      workspace_summary: "test",
      related_files: ["a.ts"],
      conflict_candidates: [],
      working_tree_diff_ref: "diff",
      schema_version: "1.0"
    }
  },
  {
    name: "recommendation - recommendation_type 누락",
    payload: {
      project_id: "proj_123",
      session_id: "sess_123",
      feature_type: "recommendation",
      current_branch: "feat",
      change_summary: "test",
      changed_files: ["a.ts"],
      work_intent: "test",
      schema_version: "1.0"
      // recommendation_type missing
    }
  }
];

export const invalidResponseMocks = [
  {
    name: "merge_patch_draft - 필수 필드 누락",
    featureType: "merge_patch_draft",
    rawResponse: JSON.stringify({
      title: "Missing fields"
      // summary, applied_files etc missing
    })
  }
];
