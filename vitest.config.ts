import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  test: { environment: 'node', clearMocks: true },
  resolve: { alias: { '@': resolve(root) } }
});
