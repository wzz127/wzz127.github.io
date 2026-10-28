(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = '/api/comments/admin/';
  let csrf = '', status = 'pending', page = 1, requestVersion = 0, busy = false;
  function notice(text = '', error = false) {
    $('notice').textContent = text;
    $('notice').classList.toggle('error', error);
  }
  function signedOut(message = '') {
    csrf = ''; requestVersion++;
    $('workspace').hidden = true;
    $('list').replaceChildren();
    $('pagination').hidden = true;
    $('login').hidden = false;
    notice(message);
  }
  async function request(path, data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(api + path, {
        method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: data === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
        body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || '请求失败，请稍后重试');
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('请求超时，请刷新列表确认结果后再试。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function errorNotice(error) {
    if (error.status === 401) signedOut('登录已失效，请重新登录。');
    else notice(error.message, true);
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function lock(value) {
    busy = value;
    document.querySelectorAll('#workspace button').forEach(button => { button.disabled = value; });
    if (!value) $('previous').disabled = page <= 1;
  }
  async function moderate(comment, nextStatus) {
    if (busy) return;
    lock(true); notice('正在更新…');
    try {
      const result = await request('moderate', {id: comment.id, status: nextStatus, expectedStatus: comment.status});
      if (await load()) notice(result.message);
    } catch (error) {
      if (error.status === 409) await load();
      errorNotice(error);
    } finally { lock(false); }
  }
  function render(comment) {
    const card = node('article', 'comment');
    const head = node('div', 'comment-head');
    const author = node('h2', 'author', comment.nickname);
    const time = node('time', 'date', new Date(comment.created * 1000).toLocaleString('zh-CN', {dateStyle:'medium', timeStyle:'short'}));
    time.dateTime = new Date(comment.created * 1000).toISOString();
    head.append(author, time);
    const link = node('a', 'article-link', '文章：' + comment.title + ' ↗');
    link.href = location.origin + comment.path;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    const body = node('p', 'content', comment.content);
    const bottom = node('div', 'comment-bottom');
    bottom.append(node('p', 'email', comment.email ? '邮箱（仅你可见）：' + comment.email : '未留邮箱'));
    const actions = node('div', 'actions');
    if (comment.status !== 'rejected') {
      const reject = node('button', 'reject', comment.status === 'approved' ? '撤下评论' : '拒绝');
      reject.addEventListener('click', () => moderate(comment, 'rejected'));
      actions.append(reject);
    }
    if (comment.status !== 'approved') {
      const approve = node('button', 'primary', '通过');
      approve.addEventListener('click', () => moderate(comment, 'approved'));
      actions.append(approve);
    }
    bottom.append(actions); card.append(head, link, body, bottom);
    return card;
  }
  async function load() {
    const version = ++requestVersion;
    $('list').setAttribute('aria-busy', 'true');
    try {
      const result = await request('list?status=' + status + '&page=' + page);
      if (version !== requestVersion) return;
      if (!result.comments.length && page > 1) { page--; return await load(); }
      document.querySelectorAll('[data-count]').forEach(el => { el.textContent = result.counts[el.dataset.count]; });
      document.querySelectorAll('[data-status]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.status === status)); });
      $('list').replaceChildren(...result.comments.map(render));
      if (!result.comments.length) {
        const empty = node('div', 'empty');
        const copy = {pending: ['暂时没有待审核评论', '新的访客留言会出现在这里。'], approved: ['还没有通过的评论', '审核通过的留言会在文章下方展示。'], rejected: ['还没有拒绝的评论', '已拒绝或撤下的留言会保留在这里。']}[status];
        empty.append(node('h2', '', copy[0]), node('p', '', copy[1]));
        $('list').append(empty);
      }
      $('pagination').hidden = page === 1 && !result.hasMore;
      $('previous').disabled = page === 1;
      $('next').disabled = !result.hasMore;
      $('next').hidden = !result.hasMore;
      $('page-label').textContent = '第 ' + page + ' 页';
      return true;
    } catch (error) { errorNotice(error); }
    finally { if (version === requestVersion) $('list').setAttribute('aria-busy', 'false'); }
  }
  async function start() {
    try {
      const session = await request('session');
      csrf = session.csrf;
      $('login').hidden = true; $('workspace').hidden = false;
      notice(); await load();
    } catch (error) {
      signedOut(error.status === 401 ? '' : '无法连接后台，请稍后刷新重试。');
    }
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true; notice('正在登录…');
    try {
      const result = await request('login', {password: $('password').value});
      $('password').value = ''; csrf = result.csrf;
      status = 'pending'; page = 1;
      $('login').hidden = true; $('workspace').hidden = false;
      notice(); await load();
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    if (busy) return;
    lock(true);
    try { await request('logout', {}); signedOut('已退出登录'); }
    catch (error) { errorNotice(error); }
    finally { lock(false); }
  });
  document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', async () => {
    if (busy) return;
    status = button.dataset.status; page = 1; notice(); await load();
  }));
  $('refresh').addEventListener('click', () => { notice(); load(); });
  $('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { page++; load(); });
  window.addEventListener('pagehide', () => { $('list').replaceChildren(); $('workspace').hidden = true; });
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
})();
