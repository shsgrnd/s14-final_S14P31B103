당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 충돌 원인을 JSON 형식으로 설명해 주세요.

<<<<<<< HEAD
// packages/extension/src/webview/RecommendPanel.ts
panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
  if (message.command === 'applyRecommendation') {
    // 사용자가 추천 결과를 클릭하면 즉시 클립보드에 복사
    await vscode.env.clipboard.writeText(message.data.primaryText);
    vscode.window.showInformationMessage('추천 결과가 클립보드에 복사되었습니다.');
  }
});
=======
// packages/extension/src/webview/RecommendPanel.ts
panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
  if (message.type === 'APPLY_RECOMMENDATION') {
    // 사용자가 추천 결과를 클릭하면 확인 후 Git 명령 실행
    const confirmed = await vscode.window.showQuickPick(['적용', '취소'], {
      placeHolder: '추천 결과를 브랜치/커밋명으로 적용하시겠습니까?',
    });
    if (confirmed === '적용') {
      await gitService.applyRecommendation(message.payload);
    }
  }
});
>>>>>>> feature/direct-git-apply
