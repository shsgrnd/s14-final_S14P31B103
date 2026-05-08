당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_20
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: chore/extension/vsix-packaging-alignment/S14P31B103-210
Change Summary: sharp 외부화, shared-types 경로 보정, pnpm lock 재생성으로 vsix 패키징을 안정화했다.
Changed Files: apps/extension/package.json, apps/extension/esbuild.config.js, pnpm-lock.yaml
Work Intent: 패키징 파이프라인 정렬과 lockfile sync를 설명하는 커밋 메시지가 필요하다.
Diff Summary: packaging external config, path alias fix, lockfile refresh
Branch Context: 빌드와 배포 재현성을 높이기 위한 정비 작업이다.
Message Constraints: conventional-commit, imperative, use chore or fix type
Ticket Ref: S14P31B103-210
