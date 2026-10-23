import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = 'https://blog.kfad127.xyz';
const legacyPosts = [
  ['2018/05/02/hello-world/', 'Hello World', '2018-05-02T03:38:25.000Z'],
  ['2018/05/04/hive与hbase/', 'hive 与 hbase', '2018-05-04T06:58:00.000Z'],
  ['2018/05/04/impala测试/', 'impala测试', '2018-05-04T04:58:00.000Z']
];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function checkSite(directory = join(root, 'public')) {
  directory = resolve(directory);
  const requireFile = path => {
    const file = resolve(directory, path);
    assert(file.startsWith(directory + sep), `Path escapes the output directory: ${path}`);
    assert(existsSync(file) && statSync(file).isFile(), `Missing output: ${path}`);
    assert(statSync(file).size > 0, `Empty output: ${path}`);
    return file;
  };
  for (const path of ['index.html', 'archives/index.html', 'categories/hadoop/index.html',
    'tags/hadoop/index.html', 'tags/impala/index.html', 'atom.xml', 'favicon.svg',
    'content.json', 'post-comments.json', 'post-stats.js', 'post-stats.css',
    'journal.css', 'journal.js', 'journal-theme.js', 'about/index.html']) requireFile(path);

  const checkReference = (value, from) => {
    if (!value || value.startsWith('#') || /^(?:data|javascript|mailto|tel):/i.test(value)) return;
    const base = new URL(relative(directory, from).split(sep).join('/'), site + '/');
    const url = new URL(value, base);
    if (url.origin !== site) return;
    const path = decodeURIComponent(url.pathname).replace(/^\//, '');
    const target = resolve(directory, path);
    assert(target === directory || target.startsWith(directory + sep), `Invalid local URL: ${value}`);
    const file = existsSync(target) && statSync(target).isDirectory()
      ? join(path, 'index.html') : path;
    requireFile(file);
  };

  const files = walk(directory);
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const $ = load(html);
    const label = relative(directory, file);
    assert($('title').text().trim(), `Missing page title: ${label}`);
    assert.equal($('html').attr('lang'), 'zh-CN', `Wrong language: ${label}`);
    assert($('.brand').text().includes('k-fad'), `Missing site identity: ${label}`);
    assert.equal($('.main-nav').length, 1, `Missing navigation: ${label}`);
    assert.equal($('#search-dialog').length, 1, `Missing search: ${label}`);
    assert.equal($('#theme-toggle').length, 1, `Missing theme control: ${label}`);
    const canonical = $('link[rel="canonical"]').attr('href');
    assert(canonical && new URL(canonical).origin === site, `Invalid canonical URL: ${label}`);
    assert.equal($('#footer a[href="https://beian.miit.gov.cn/"]').text().trim(), '豫ICP备2026017642号-1', `Missing ICP registration: ${label}`);
    assert(!/yoursite\.com|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/.test(html), `Placeholder URL: ${label}`);
    $('a[href], link[href], script[src], img[src]').each((_, element) => {
      const node = $(element);
      checkReference(node.attr('href') || node.attr('src'), file);
    });
  }

  for (const file of files.filter(file => file.endsWith('.css'))) {
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) checkReference(match[1], file);
  }

  const posts = JSON.parse(readFileSync(requireFile('content.json'), 'utf8'));
  const comments = JSON.parse(readFileSync(requireFile('post-comments.json'), 'utf8'));
  assert.equal(comments.repo, 'wzz127/wzz127.github.io', 'Wrong comment repository');
  assert(Number.isFinite(Date.parse(comments.generatedAt)), 'Invalid comment snapshot date');
  assert(comments.counts && typeof comments.counts === 'object' && !Array.isArray(comments.counts), 'Invalid comment counts');
  for (const [path, count] of Object.entries(comments.counts)) {
    assert(path.startsWith('/') && Number.isSafeInteger(count) && count >= 0, 'Invalid article comment count');
  }
  assert(Array.isArray(posts), 'Yilia search index must be an array');
  const sourceCount = readdirSync(join(root, 'source/_posts')).filter(name => name.endsWith('.md')).length;
  assert.equal(posts.length, sourceCount, 'Search index omitted posts');
  assert.equal(new Set(posts.map(post => post.path)).size, posts.length, 'Duplicate search routes');
  for (const post of posts) {
    assert(typeof post.title === 'string' && post.title.trim(), 'Missing search title');
    assert(Number.isFinite(Date.parse(post.date)), `Invalid search date: ${post.title}`);
    assert(typeof post.path === 'string' && !post.path.startsWith('/') && !post.path.includes('://'), 'Invalid search route');
    assert(typeof post.text === 'string' && post.text.length > 100, `Missing search text: ${post.title}`);
    assert(Array.isArray(post.tags), `Missing search tags: ${post.title}`);
    const article = load(readFileSync(requireFile(join(post.path, 'index.html')), 'utf8'));
    assert.equal(article('.post-stats[data-post-url]').length, 1, `Missing article stats: ${post.path}`);
    assert.equal(article('script[src="https://giscus.app/client.js"]').attr('data-mapping'), 'pathname', `Changed comment mapping: ${post.path}`);
    assert.equal(article('h1.article-title').text().trim(), post.title, `Wrong article title: ${post.path}`);
    assert(article('.article-entry').text().trim().length > 100, `Missing article body: ${post.path}`);
    for (const tag of post.tags) {
      assert(typeof tag.name === 'string' && tag.name.trim(), 'Missing tag name');
      assert.equal(new URL(tag.permalink).origin, site, 'Wrong tag domain');
      checkReference(tag.permalink, join(directory, 'index.html'));
    }
  }
  for (const [path, title, date] of legacyPosts) {
    const post = posts.find(post => post.path === path);
    assert(post, `Historical URL changed: ${path}`);
    assert.equal(post.title, title);
    assert.equal(post.date, date, `Historical publication date changed: ${path}`);
  }

  const feed = load(readFileSync(requireFile('atom.xml'), 'utf8'), { xmlMode: true });
  assert.equal(feed('feed').length, 1, 'Missing Atom feed');
  assert.equal(feed('entry').length, Math.min(posts.length, 20), 'RSS omitted posts');
  feed('link[href]').each((_, element) => {
    const url = feed(element).attr('href');
    assert.equal(new URL(url).origin, site, 'Wrong RSS domain');
    checkReference(url, join(directory, 'atom.xml'));
  });
  return { htmlPages: htmlFiles.length, posts: posts.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(checkSite());
}
