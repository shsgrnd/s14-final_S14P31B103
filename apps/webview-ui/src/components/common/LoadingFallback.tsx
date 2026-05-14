import React from 'react';
import { webviewBodyForeground, webviewDescriptionForeground } from '../../shared/styles';

interface LoadingFallbackProps {
  isSlowBoot: boolean;
}

/**
 * 초기 로딩 스플래시 화면 컴포넌트
 * - 정상 부팅 시: "사이드바와 초기 데이터를 준비하고 있습니다."
 * - 3초 초과 시: 지연 안내 메시지로 전환
 */
export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ isSlowBoot }) => (
  <div style={{
    height: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--vscode-sideBar-background)',
    color: webviewBodyForeground,
    padding: '24px',
    boxSizing: 'border-box',
  }}>
    <div style={{
      width: '100%',
      maxWidth: '220px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: '14px',
    }}>
      {window.GITCAT_LOGO_URI ? (
        <img
          src={window.GITCAT_LOGO_URI}
          alt="GitCat Logo"
          style={{
            width: '54px',
            height: '54px',
            objectFit: 'contain',
            opacity: 0.96,
          }}
        />
      ) : (
        <div style={{
          width: '54px',
          height: '54px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(111, 179, 224, 0.12)',
          color: 'var(--vscode-charts-blue)',
          fontSize: '24px',
          fontWeight: 700,
        }}>
          G
        </div>
      )}

      <div style={{
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: webviewBodyForeground,
      }}>
        GitCat을 불러오는 중입니다...
      </div>

      <div style={{
        fontSize: '11px',
        lineHeight: 1.5,
        color: webviewDescriptionForeground,
        opacity: 0.92,
      }}>
        {isSlowBoot
          ? '초기 로딩이 지연되고 있습니다. 잠시 후 다시 선택하거나 다른 탭으로 이동 후 돌아와 주세요.'
          : '사이드바와 초기 데이터를 준비하고 있습니다.'}
      </div>
    </div>
  </div>
);
