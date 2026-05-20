import React from 'react';
import { webviewBodyForeground, webviewDescriptionForeground } from '../../shared/styles';
import { t } from '../../i18n';

interface LoadingFallbackProps {
  isSlowBoot: boolean;
}

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
        {t('loading.title')}
      </div>

      <div style={{
        fontSize: '11px',
        lineHeight: 1.5,
        color: webviewDescriptionForeground,
        opacity: 0.92,
      }}>
        {isSlowBoot ? t('loading.slow') : t('loading.ready')}
      </div>
    </div>
  </div>
);
