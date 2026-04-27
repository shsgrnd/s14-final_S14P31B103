import * as ts from 'typescript';

/**
 * 특정 코드 블록의 범위 정보를 나타냅니다.
 * 함수, 클래스, 메서드 등 하나의 논리적 단위(Block)에 해당합니다.
 */
export interface AstBlock {
  /** 블록 식별 이름 (함수명, 클래스명 등). 익명이면 '<anonymous>' */
  name: string;

  /** 블록의 종류 (FunctionDeclaration, MethodDeclaration, ClassDeclaration 등) */
  kind: string;

  /** 블록이 시작하는 라인 번호 (1-based) */
  startLine: number;

  /** 블록이 끝나는 라인 번호 (1-based) */
  endLine: number;
}

/**
 * TypeScript Compiler API를 활용한 AST 기반 코드 구조 분석기.
 *
 * 역할:
 *  - 주어진 소스 코드를 추상 구문 트리(AST)로 파싱합니다.
 *  - 변경이 발생한 라인(Line Number)이 어떤 논리적 블록(함수, 클래스 등) 에 속하는지 파악합니다.
 *  - 이 정보를 ConflictAnalyzer에 전달하여 "같은 함수를 건드렸는가?"를 기준으로 충돌을 판별합니다.
 */
export class AstAnalyzer {
  /**
   * 주어진 소스 코드를 AST로 파싱하여, 파일 내의 모든 최상위 논리 블록 목록을 반환합니다.
   * 지원 대상: FunctionDeclaration, ArrowFunction (변수 선언 내), MethodDeclaration, ClassDeclaration
   *
   * @param sourceCode 분석할 TypeScript/JavaScript 소스 코드 문자열
   * @param fileName 파일명 (TypeScript 컴파일러가 언어를 판별하는 데 사용)
   * @returns 파일 내의 모든 논리 블록 목록 (AstBlock[])
   */
  extractBlocks(sourceCode: string, fileName: string): AstBlock[] {
    // TypeScript Compiler API로 소스 파일 AST를 생성합니다.
    // createSourceFile은 실제 컴파일을 하지 않고 파싱만 수행하므로 빠릅니다.
    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true // 부모 노드 참조를 활성화해야 getLineAndCharacterOfPosition을 쓸 수 있습니다.
    );

    const blocks: AstBlock[] = [];

    // AST를 재귀적으로 순회하면서 논리적 블록에 해당하는 노드를 찾아냅니다.
    const visit = (node: ts.Node) => {
      // 1. 일반 함수 선언 (function foo() {})
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
        const block = this.nodeToBlock(node, sourceFile);
        if (block) blocks.push(block);
      }

      // 2. 화살표 함수 (const foo = () => {})
      // 화살표 함수는 대부분 변수 선언 내에 존재하므로, 부모 노드 이름을 사용합니다.
      else if (ts.isArrowFunction(node)) {
        const block = this.nodeToBlock(node, sourceFile);
        if (block) blocks.push(block);
      }

      // 3. 클래스 내 메서드 (class Foo { bar() {} })
      else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
        const block = this.nodeToBlock(node, sourceFile);
        if (block) blocks.push(block);
      }

      // 4. 클래스 선언 (class Foo {})
      // 클래스 전체를 하나의 블록으로도 등록하여, 클래스 레벨 변경도 감지할 수 있습니다.
      else if (ts.isClassDeclaration(node)) {
        const block = this.nodeToBlock(node, sourceFile);
        if (block) blocks.push(block);
      }

      // 자식 노드로 재귀적으로 내려갑니다.
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return blocks;
  }

  /**
   * 특정 라인 번호(1-based)가 속한 모든 논리 블록을 반환합니다.
   * 라인이 여러 블록(예: 클래스 안의 메서드)에 속할 경우, 가장 '작은' 블록(가장 안쪽)을 우선으로 정렬합니다.
   *
   * @param blocks extractBlocks()로 추출한 블록 목록
   * @param lineNumber 찾고자 하는 라인 번호 (1-based)
   * @returns 해당 라인을 포함하는 블록 목록. 가장 안쪽 블록이 [0]번에 위치합니다.
   */
  findBlocksAtLine(blocks: AstBlock[], lineNumber: number): AstBlock[] {
    // 주어진 라인이 블록의 시작/끝 범위 내에 포함되는 블록만 필터링합니다.
    const containing = blocks.filter(
      (b) => b.startLine <= lineNumber && lineNumber <= b.endLine
    );

    // 블록 범위가 '작은' 것 순으로 정렬 (가장 안쪽 블록이 먼저 오도록)
    containing.sort((a, b) => (b.endLine - b.startLine) - (a.endLine - a.startLine));

    return containing;
  }

  /**
   * 두 라인이 각각 속한 가장 안쪽의 논리 블록이 서로 같은지 비교합니다.
   * 이것이 "같은 함수/메서드를 동시에 수정했는가"를 판별하는 핵심 메서드입니다.
   *
   * @param blocks 전체 블록 목록
   * @param line1 첫 번째 변경 라인 (1-based)
   * @param line2 두 번째 변경 라인 (1-based)
   * @returns 같은 논리 블록에 속하면 true, 아니면 false
   */
  isSameLogicalBlock(blocks: AstBlock[], line1: number, line2: number): boolean {
    const blocks1 = this.findBlocksAtLine(blocks, line1);
    const blocks2 = this.findBlocksAtLine(blocks, line2);

    // 두 라인 모두 어떤 블록 안에 있어야 비교 가능합니다.
    if (blocks1.length === 0 || blocks2.length === 0) return false;

    // 가장 안쪽(narrowest) 블록끼리 비교합니다.
    const narrowest1 = blocks1[blocks1.length - 1];
    const narrowest2 = blocks2[blocks2.length - 1];

    // 이름, 종류, 시작/끝 라인이 동일하면 같은 블록으로 판단합니다.
    return (
      narrowest1.name === narrowest2.name &&
      narrowest1.kind === narrowest2.kind &&
      narrowest1.startLine === narrowest2.startLine &&
      narrowest1.endLine === narrowest2.endLine
    );
  }

  /**
   * AST 노드(Node)를 AstBlock 객체로 변환하는 내부 헬퍼 메서드.
   */
  private nodeToBlock(node: ts.Node, sourceFile: ts.SourceFile): AstBlock | null {
    // 노드의 시작/끝 문자 위치(character offset)를 라인/열 번호로 변환합니다.
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    // 라인 번호는 0-based이므로, 1-based로 변환합니다.
    const startLine = start.line + 1;
    const endLine = end.line + 1;

    // 블록의 식별 이름을 추출합니다.
    let name = '<anonymous>';

    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      // function foo, class Foo → identifier로 이름을 직접 가져올 수 있습니다.
      name = node.name?.getText(sourceFile) ?? '<anonymous>';
    } else if (ts.isMethodDeclaration(node)) {
      // class 내의 bar() → 메서드 이름
      name = node.name.getText(sourceFile);
    } else if (ts.isConstructorDeclaration(node)) {
      // 생성자는 항상 'constructor'
      name = 'constructor';
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      // const foo = () => {} → 부모 VariableDeclaration의 이름을 사용
      const parent = node.parent;
      if (parent && ts.isVariableDeclaration(parent)) {
        name = parent.name.getText(sourceFile);
      }
    }

    return {
      name,
      kind: ts.SyntaxKind[node.kind], // 예: "FunctionDeclaration", "ArrowFunction"
      startLine,
      endLine,
    };
  }
}
