import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                // Put the heavy voter data into its own chunk
                manualChunks: {
                    'voter-data': ['./src/voterData.js'],
                },
            },
        },
    },
});