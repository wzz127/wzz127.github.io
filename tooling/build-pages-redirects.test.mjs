import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { buildRedirects, redirectHtml } from './build-pages-redirects.mjs';

function redirect(html, oldUrl) {
  const url = new URL(oldUrl);
  let destination;
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    location: { pathname: url.pathname, search: url.search, hash: url.hash, replace(value) { destination = value; } },
  });
  return destination;
}

test('redirect keeps Chinese article paths, query parameters and anchors on the fixed new origin', () => {
  for (const path of ['/', '/2018/05/02/hello-world/', '/2018/05/04/hive与hbase/?from=github&next=https%3A%2F%2Fexample.com#中文标题', '/tags/测试/', '//example.com/?q=1#part']) {
    const old = new URL('https://wzz127.github.io' + path);
    assert.equal(redirect(redirectHtml(), old.href), 'https://blog.kfad127.xyz' + old.pathname + old.search + old.hash);
  }
});

test('separate Pages artifact covers HTML routes and fallback without changing primary content', t => {
  const root = mkdtempSync(join(tmpdir(), 'blog-redirects-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'public');
  const output = join(root, 'redirects');
  const article = '2018/05/04/hive与hbase/index.html';
  mkdirSync(join(source, '2018/05/04/hive与hbase'), { recursive: true });
  writeFileSync(join(source, 'index.html'), 'primary home');
  writeFileSync(join(source, article), 'primary article');
  assert.equal(buildRedirects(source, output), 2);
  assert.equal(readFileSync(join(source, 'index.html'), 'utf8'), 'primary home');
  assert.equal(readFileSync(join(source, article), 'utf8'), 'primary article');
  const html = readFileSync(join(output, article), 'utf8');
  assert.ok(html.includes('href="https://blog.kfad127.xyz/2018/05/04/hive%E4%B8%8Ehbase/"'));
  const missing = 'https://wzz127.github.io/old/deep/link/?source=bookmark#part';
  assert.equal(redirect(readFileSync(join(output, '404.html'), 'utf8'), missing), missing.replace('wzz127.github.io', 'blog.kfad127.xyz'));
  assert.throws(() => buildRedirects(source, source), /separate directories/);
  assert.throws(() => buildRedirects(source, join(source, 'redirects')), /separate directories/);
  assert.throws(() => buildRedirects(source, root), /separate directories/);
});
