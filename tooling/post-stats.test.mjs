import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { load } from 'cheerio';

const script = readFileSync(new URL('../themes/yilia/source/post-stats.js', import.meta.url), 'utf8');
const origin = 'https://blog.kfad127.xyz';
const paths = ['/2026/10/16/ai-context-more-is-better/', '/2018/05/04/impala%E6%B5%8B%E8%AF%95/'];
const counters = { page_uv: 7, page_pv: 12, site_uv: 50, site_pv: 80 };

function element(url, metrics) {
  return {
    dataset: { postUrl: url },
    values: Object.fromEntries(metrics.map(metric => [metric, { textContent: '--' }])),
    querySelectorAll(selector) {
      const metric = /data-stat="([^"]+)"/.exec(selector)?.[1];
      return this.values[metric] ? [this.values[metric]] : [];
    }
  };
}

async function run({ local = false, currentPath = paths[0], failure = false, storageBlocked = false } = {}) {
  const calls = [];
  const groups = paths.map(path => element(origin + path, ['page_uv', 'page_pv', 'comments']));
  const footer = element('', ['site_uv', 'site_pv']);
  const messages = [];
  const frame = { contentWindow: {} };
  const saved = new Map();
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    document: {
      currentScript: { dataset: {
        api: 'https://busuanzi.9420.ltd/api', siteUrl: origin,
        commentsUrl: '/post-comments.json', repo: 'wzz127/wzz127.github.io'
      } },
      querySelector: selector => selector.includes('canonical') ? { href: origin + currentPath } : frame,
      querySelectorAll: selector => selector === '.post-stats' ? groups : footer.querySelectorAll(selector)
    },
    window: {
      location: { origin: local ? 'http://127.0.0.1:4000' : origin },
      addEventListener: (type, handler) => messages.push(handler)
    },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Blocked'); return saved.get(key) || null; },
      setItem(key, value) { if (storageBlocked) throw new Error('Blocked'); saved.set(key, value); }
    },
    async fetch(url, options) {
      calls.push({ url, ...options });
      if (failure) throw new Error('Offline');
      return {
        ok: true, headers: { get: () => 'signed-visitor' },
        json: async () => url === '/post-comments.json'
          ? { repo: 'wzz127/wzz127.github.io', generatedAt: '2026-10-16T00:00:00Z', counts: { [paths[0]]: 3, [paths[1]]: 0 } }
          : { success: true, data: counters }
      };
    }
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { calls, groups, footer, messages, frame, saved };
}

test('counts only the current production page and reads all other articles without increments', async () => {
  const result = await run();
  const visits = result.calls.filter(call => call.method === 'POST');
  assert.equal(visits.length, 1);
  assert.equal(visits[0].headers['x-bsz-referer'], origin + paths[0]);
  assert.equal(result.calls.filter(call => call.method === 'GET').length, 1);
  assert.equal(result.groups[0].values.page_uv.textContent, '7');
  assert.equal(result.groups[0].values.page_pv.textContent, '12');
  assert.equal(result.groups[1].values.comments.textContent, '0');
  assert.equal(result.footer.values.site_pv.textContent, '80');
  assert.equal(result.saved.get('blog-bsz-identity:https://busuanzi.9420.ltd/api'), 'signed-visitor');
});

test('archive pages count themselves once without recording article reads', async () => {
  const result = await run({ currentPath: '/archives/' });
  assert.equal(result.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'GET').length, 2);
  assert.equal(result.groups[1].values.page_pv.textContent, '12');
});

test('preview and blocked browser storage remain functional without polluting visits', async () => {
  const result = await run({ local: true, storageBlocked: true });
  assert.equal(result.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(result.groups[0].values.page_uv.textContent, '7');
});

test('network failures remain unknown instead of reporting zero readers or comments', async () => {
  const result = await run({ failure: true });
  assert.equal(result.groups[0].values.page_pv.textContent, '--');
  assert.equal(result.groups[0].values.comments.textContent, '--');
  assert.equal(result.footer.values.site_uv.textContent, '--');
});

test('live comment updates accept only the actual giscus frame', async () => {
  const result = await run();
  const data = { giscus: { discussion: { totalCommentCount: 6 } } };
  result.messages[0]({ origin: 'https://example.com', source: result.frame.contentWindow, data });
  result.messages[0]({ origin: 'https://giscus.app', source: {}, data });
  assert.equal(result.groups[0].values.comments.textContent, '3');
  result.messages[0]({ origin: 'https://giscus.app', source: result.frame.contentWindow, data });
  assert.equal(result.groups[0].values.comments.textContent, '6');
  assert.equal(result.groups[1].values.comments.textContent, '0');
});

test('built article, homepage, archive and category rows all contain per-post counters and comment links', () => {
  for (const path of ['index.html', 'archives/index.html', 'categories/work-notes/index.html',
    '2026/10/16/ai-context-more-is-better/index.html']) {
    const $ = load(readFileSync(new URL('../public/' + path, import.meta.url), 'utf8'));
    const articles = $('article.article, article.archive-article');
    assert(articles.length > 0);
    articles.each((_, node) => {
      const stats = $(node).find('.post-stats');
      assert.equal(stats.length, 1, path);
      for (const metric of ['page_uv', 'page_pv', 'comments']) assert.equal(stats.find(`[data-stat="${metric}"]`).length, 1);
      assert(stats.find('a').attr('href').endsWith('#comments'));
    });
    assert.equal($('script[src*="busuanzi.pure"]').length, 0);
    assert.equal($('script[src="/post-stats.js"]').length, 1);
  }
});
