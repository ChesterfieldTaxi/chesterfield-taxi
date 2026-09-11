import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: {
    'process.env': {},
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/@react-router') ||
            id.includes('node_modules/react-router')
          ) {
            return 'react-router';
          }
          if (id.includes('/components/ui/') || id.includes('\\components\\ui\\')) {
            return 'core-ui';
          }
        },
      },
    },
  },
});
