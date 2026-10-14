import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSite } from './check-site.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cli = require.resolve('hexo-cli/bin/hexo');

for (const command of ['clean', 'generate']) {
  const result = spawnSync(process.execPath, [cli, command], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  // Hexo can log processing errors and still exit with status 0.
  if (result.status !== 0 || /\b(?:ERROR|FATAL)\b/.test(output)) {
    throw new Error(`Hexo ${command} failed; publication stopped.`);
  }
}

const result = checkSite();
console.log(`Verified ${result.htmlPages} HTML pages, ${result.posts} posts, search index, RSS and local assets.`);
