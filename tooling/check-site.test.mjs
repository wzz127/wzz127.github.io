import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSite } from './check-site.mjs';

const output = fileURLToPath(new URL('../public/', import.meta.url));

function fixture(t) {
  const path = mkdtempSync(join(tmpdir(), 'ai-blog-check-'));
  cpSync(output, path, { recursive: true });
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('rejects a successful command that omitted a historical article', t => {
  const path = fixture(t);
  rmSync(join(path, '2018/05/04/impala测试/index.html'));
  assert.throws(() => checkSite(path), /Missing output/);
});

test('rejects a search response shape incompatible with Yilia', t => {
  const path = fixture(t);
  const posts = JSON.parse(readFileSync(join(path, 'content.json'), 'utf8'));
  writeFileSync(join(path, 'content.json'), JSON.stringify({ posts }));
  assert.throws(() => checkSite(path), /must be an array/);
});

test('rejects a stylesheet whose font file was omitted', t => {
  const path = fixture(t);
  rmSync(join(path, 'fonts/iconfont.8c627f.woff'));
  assert.throws(() => checkSite(path), /Missing output/);
});

test('rejects publication dates changed by a fresh checkout', t => {
  const path = fixture(t);
  const file = join(path, 'content.json');
  const posts = JSON.parse(readFileSync(file, 'utf8'));
  posts.find(post => post.title === 'Hello World').date = '2026-10-14T00:00:00.000Z';
  writeFileSync(file, JSON.stringify(posts));
  assert.throws(() => checkSite(path), /Historical publication date changed/);
});
