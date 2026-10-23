import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://blog.kfad127.xyz';
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function redirectHtml(pathname = '/') {
  const target = escapeHtml(origin + pathname);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>博客已迁移</title>
  <link rel="canonical" href="${target}">
  <script>location.replace(${JSON.stringify(origin)} + location.pathname + location.search + location.hash);</script>
  <noscript><meta http-equiv="refresh" content="0;url=${target}"></noscript>
</head>
<body><p>博客已迁移，正在前往新地址。<a href="${target}">点击继续阅读</a></p></body>
</html>
`;
}

export function buildRedirects(source, output) {
  source = resolve(source);
  output = resolve(output);
  // Never overwrite the primary site with redirect pages.
  if (source === output || output.startsWith(source + sep) || source.startsWith(output + sep)) {
    throw new Error('Primary site and redirect output must be separate directories');
  }
  const routes = [];
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), relative + '/');
      else if (entry.isFile() && relative.endsWith('.html')) routes.push(relative);
    }
  }
  walk(source);
  if (!routes.includes('index.html')) throw new Error('Missing primary site index.html');
  rmSync(output, { recursive: true, force: true });
  for (const route of routes) {
    const destination = join(output, route);
    mkdirSync(dirname(destination), { recursive: true });
    const pathname = '/' + route.replace(/(^|\/)index\.html$/, '$1').split('/').map(encodeURIComponent).join('/');
    writeFileSync(destination, redirectHtml(pathname));
  }
  // Pages serves this for unmatched paths; the script still uses the original URL.
  writeFileSync(join(output, '404.html'), redirectHtml());
  writeFileSync(join(output, '.nojekyll'), '');
  return routes.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  console.log(`Built redirects for ${buildRedirects(join(root, 'public'), join(root, '.deploy-pages'))} HTML pages and a fallback.`);
}
