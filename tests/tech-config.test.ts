import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Technical Configuration & CI/CD Spec Conformance', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('declares Node.js runtime version >=24.0.0 in package.json engines (TCH-08)', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent) as { engines?: { node?: string } };

    expect(pkg.engines).toBeDefined();
    expect(pkg.engines?.node).toBe('>=24.0.0');
  });

  it('configures GitHub Actions CI/CD to source Node version from package.json (TCH-08)', () => {
    const ciCdPath = path.join(rootDir, '.github', 'workflows', 'ci-cd.yml');
    expect(fs.existsSync(ciCdPath)).toBe(true);

    const ciCdContent = fs.readFileSync(ciCdPath, 'utf-8');
    expect(ciCdContent).toContain("node-version-file: 'package.json'");
    expect(ciCdContent).not.toContain("node-version: 'lts/*'");
  });

  it('configures GitHub Pages continuous deployment job & permissions (TCH-04)', () => {
    const ciCdPath = path.join(rootDir, '.github', 'workflows', 'ci-cd.yml');
    const ciCdContent = fs.readFileSync(ciCdPath, 'utf-8');

    // Permissions for Pages
    expect(ciCdContent).toContain('pages: write');
    expect(ciCdContent).toContain('id-token: write');

    // Upload & Deploy steps
    expect(ciCdContent).toContain('actions/upload-pages-artifact@v4');
    expect(ciCdContent).toContain('actions/deploy-pages@v4');
    expect(ciCdContent).toContain('environment:');
    expect(ciCdContent).toContain('name: github-pages');
  });

  it('configures Vite base path for GitHub Pages (/ctrl-plus-plus/) (TCH-09)', () => {
    const viteConfigPath = path.join(rootDir, 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

    expect(viteConfigContent).toContain("base: '/ctrl-plus-plus/'");
    expect(viteConfigContent).toContain("display: 'standalone'");
    expect(viteConfigContent).toContain("sizes: '192x192'");
    expect(viteConfigContent).toContain("sizes: '512x512'");
  });

  it('generates PWA manifest with correct scope and start_url when built (TCH-09)', () => {
    const manifestPath = path.join(rootDir, 'dist', 'manifest.webmanifest');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        start_url?: string;
        scope?: string;
        display?: string;
      };
      expect(manifest.start_url).toBe('/ctrl-plus-plus/');
      expect(manifest.scope).toBe('/ctrl-plus-plus/');
      expect(manifest.display).toBe('standalone');
    }
  });
});
