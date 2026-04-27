import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // 빌드된 자산이 상대 경로를 사용하도록 설정
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 일관된 파일 이름을 위해 해시 제거
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      }
    }
  },
  define: {
    'process.env': {}
  }
});
