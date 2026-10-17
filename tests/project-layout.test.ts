import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

describe('root-level static frontend deployment', () => {
  it('keeps the complete browser entry point at the repository root', () => {
    const html = resolve(root, 'index.html');
    expect(existsSync(html)).toBe(true);
    const source = readFileSync(html, 'utf8');
    expect(source).toContain('<div id="root"');
    expect(source).toContain("const CHECKOUT_URL = '__WHOP_PRO_CHECKOUT_URL__'");
    expect(source).toContain("fetch(path");
  });

  it('does not require app or components source directories', () => {
    expect(existsSync(resolve(root, 'app'))).toBe(false);
    expect(existsSync(resolve(root, 'components'))).toBe(false);
    expect(existsSync(resolve(root, 'api/projects.ts'))).toBe(true);
    expect(existsSync(resolve(root, 'lib/auth.ts'))).toBe(true);
  });

  it('builds the root entry point into the configured static output directory', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as Record<string, unknown>;
    expect(config.outputDirectory).toBe('dist');
    expect(config.framework).toBeNull();
    expect(readFileSync(resolve(root, 'package.json'), 'utf8')).toContain('node build.mjs');
    expect(readFileSync(resolve(root, 'build.mjs'), 'utf8')).toContain('WHOP_PRO_CHECKOUT_URL');
  });

  it('allows Whop to embed the app while keeping other sites blocked by the frame policy', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
      headers?: Array<{ headers?: Array<{ key?: string; value?: string }> }>;
    };
    const responseHeaders = config.headers?.flatMap((entry) => entry.headers || []) || [];
    const xFrameOptions = responseHeaders.find((header) => header.key?.toLowerCase() === 'x-frame-options');
    const csp = responseHeaders.find((header) => header.key?.toLowerCase() === 'content-security-policy')?.value || '';
    expect(xFrameOptions).toBeUndefined();
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('https://whop.com');
    expect(csp).toContain('https://*.whop.com');
  });
});
