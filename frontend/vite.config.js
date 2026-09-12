import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Accessible depuis un telephone sur le meme reseau Wi-Fi (scan du QR Code)
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Les graphiques ne servent qu'a l'administration : on les isole
        // pour alleger le chargement de la page client (mobile).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
