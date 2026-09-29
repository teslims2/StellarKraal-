import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('docker-compose staging build args', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const composePath = path.join(repoRoot, 'docker-compose.staging.yml');
  const dockerfilePath = path.join(repoRoot, 'Dockerfile');

  it('declares NEXT_PUBLIC_API_URL as a build ARG in the frontend Dockerfile', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    expect(dockerfile).toMatch(/^\s*ARG\s+NEXT_PUBLIC_API_URL\b/m);
  });

  it('passes the build arg through to ENV for the Next.js build', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    expect(dockerfile).toMatch(/^\s*ENV\s+NEXT_PUBLIC_API_URL=\$\{?NEXT_PUBLIC_API_URL\}?/m);
  });

  it('aligns the docker-compose staging build arg name with the Dockerfile ARG', () => {
    const compose = fs.readFileSync(composePath, 'utf8');
    expect(compose).toMatch(/NEXT_PUBLIC_API_URL\s*[:=]/);
  });

  it('sets NEXT_PUBLIC_API_URL in the running staging container', () => {
    const compose = fs.readFileSync(composePath, 'utf8');
    const serviceMatch = compose.match(/services:\s*\n\s*([\w-]+):/);
    const service = serviceMatch ? serviceMatch[1] : 'frontend';

    const output = execSync(
      `docker compose -f docker-compose.staging.yml run --rm --no-deps ${service} printenv NEXT_PUBLIC_API_URL`,
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();

    expect(output).not.toBe('');
    expect(output).toMatch(/^https?:\/\//);
  }, 120000);
});
