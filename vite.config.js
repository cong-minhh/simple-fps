import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        // Use esbuild for minification (built-in, no extra install needed)
        minify: 'esbuild',
        rollupOptions: {
            output: {
                // Separate Three.js into its own chunk for better caching
                manualChunks: {
                    three: ['three']
                }
            }
        },
        // Report compressed sizes
        reportCompressedSize: true,
        // Increase chunk size warning limit since Three.js is large
        chunkSizeWarningLimit: 600
    },
    // Drop console in production via esbuild
    esbuild: {
        drop: ['console', 'debugger'],
    },
    server: {
        open: true
    }
});
