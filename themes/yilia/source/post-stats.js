(function () {
  'use strict';

  var config = document.currentScript.dataset;
  var current = new URL(document.querySelector('link[rel="canonical"]').href);
  var groups = new Map();
  var liveComments = new Set();
  var isCount = function (value) { return Number.isSafeInteger(value) && value >= 0; };

  document.querySelectorAll('.post-stats').forEach(function (element) {
    var url = new URL(element.dataset.postUrl);
    var key = url.pathname;
    if (!groups.has(key)) groups.set(key, { url: url.href, elements: [] });
    groups.get(key).elements.push(element);
  });

  function show(elements, metric, value) {
    elements.forEach(function (element) {
      element.querySelectorAll('[data-stat="' + metric + '"]').forEach(function (counter) {
        counter.textContent = isCount(value) ? value.toLocaleString('zh-CN') : '--';
        counter.title = isCount(value) ? '' : '暂时无法获取';
      });
    });
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* Private mode can disable storage. */ }
  }

  async function request(url, options) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(url, Object.assign({ credentials: 'omit' }, options, { signal: controller.signal }));
      if (!response.ok) throw new Error('Statistics request failed');
      return { body: await response.json(), headers: response.headers };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function reads(url, increment) {
    var headers = { 'x-bsz-referer': url };
    var identityKey = 'blog-bsz-identity:' + config.api;
    var identity = storageGet(identityKey);
    if (increment && identity) headers.Authorization = 'Bearer ' + identity;
    var result = await request(config.api, { method: increment ? 'POST' : 'GET', headers: headers });
    var data = result.body.data;
    if (result.body.success !== true || !data ||
        !['page_uv', 'page_pv', 'site_uv', 'site_pv'].every(function (key) { return isCount(data[key]); })) {
      throw new Error('Invalid reading statistics');
    }
    if (increment) {
      var nextIdentity = result.headers.get('Set-Bsz-Identity');
      if (nextIdentity) storageSet(identityKey, nextIdentity);
    }
    return data;
  }

  async function loadReads() {
    if (!config.api) return;
    // Only the production origin records visits. List lookups and previews are read-only.
    var increment = window.location.origin === new URL(config.siteUrl).origin;
    var currentRequest = reads(current.href, increment);
    var jobs = Array.from(groups, function (entry) {
      return async function () {
        var key = entry[0];
        var group = entry[1];
        try {
          var data = await (key === current.pathname ? currentRequest : reads(group.url, false));
          show(group.elements, 'page_uv', data.page_uv);
          show(group.elements, 'page_pv', data.page_pv);
        } catch (_) {
          show(group.elements, 'page_uv', null);
          show(group.elements, 'page_pv', null);
        }
      };
    });
    var footer = currentRequest.then(function (data) {
      show([document], 'site_uv', data.site_uv);
      show([document], 'site_pv', data.site_pv);
    }).catch(function () {
      show([document], 'site_uv', null);
      show([document], 'site_pv', null);
    });
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async function () {
      while (jobs.length) await jobs.shift()();
    }));
    await footer;
  }

  function commentCacheKey(path) { return 'blog-comments:' + config.repo + ':' + path; }

  function cachedComments(path) {
    try { return JSON.parse(storageGet(commentCacheKey(path))); } catch (_) { return null; }
  }

  async function loadComments() {
    if (!config.repo || !groups.size) return;
    try {
      // giscus's API is restricted to its own origin. Read the public build snapshot instead.
      var snapshot = (await request(config.commentsUrl)).body;
      if (snapshot.repo !== config.repo || !Number.isFinite(Date.parse(snapshot.generatedAt))) {
        throw new Error('Invalid comment snapshot');
      }
      groups.forEach(function (group, path) {
        if (liveComments.has(path)) return;
        var cached = cachedComments(path);
        var useCache = cached && cached.updatedAt > Date.parse(snapshot.generatedAt);
        show(group.elements, 'comments', useCache ? cached.count : snapshot.counts[path]);
      });
    } catch (_) {
      groups.forEach(function (group, path) {
        if (liveComments.has(path)) return;
        var cached = cachedComments(path);
        show(group.elements, 'comments', cached ? cached.count : null);
      });
    }
  }

  window.addEventListener('message', function (event) {
    var frame = document.querySelector('iframe.giscus-frame');
    if (event.origin !== 'https://giscus.app' || !frame || event.source !== frame.contentWindow) return;
    var discussion = event.data && event.data.giscus && event.data.giscus.discussion;
    if (!discussion || !isCount(discussion.totalCommentCount) || !groups.has(current.pathname)) return;
    liveComments.add(current.pathname);
    show(groups.get(current.pathname).elements, 'comments', discussion.totalCommentCount);
    storageSet(commentCacheKey(current.pathname), JSON.stringify({
      count: discussion.totalCommentCount, updatedAt: Date.now()
    }));
  });

  loadReads();
  loadComments();
})();
