import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/ZoomPanControls.jsx',
      name: 'ZoomPanControls',
      fileName: (format) => `react-zoom-pan-controls.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    minify: false,
    sourcemap: true, // Enable source maps
  },
});
