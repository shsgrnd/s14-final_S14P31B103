import { GitStatus } from '../core/types';
import { GitClientImpl } from '../services/GitClientImpl';

export class GitCommandHandler {
    static async handleGetStatus(): Promise<GitStatus> {
        // 실제 구현 시 의존성 주입으로 GitClient 인스턴스를 받아와야 함
        const gitClient = new GitClientImpl();
        return await gitClient.getStatus();
    }
}
