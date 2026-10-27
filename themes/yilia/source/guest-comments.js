(function () {
  'use strict';
  const form = document.getElementById('guest-comment-form');
  if (!form) return;
  const status = document.getElementById('guest-comment-status');
  const list = document.getElementById('guest-comment-list');
  const path = new URL(document.querySelector('link[rel="canonical"]').href).pathname;
  async function request(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {...options, signal: controller.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
      return data;
    } finally { clearTimeout(timeout); }
  }
  async function load() {
    list.textContent = '正在加载评论…';
    try {
      const data = await request('/api/comments?path=' + encodeURIComponent(path));
      list.textContent = data.comments.length ? '' : '还没有通过审核的访客评论，欢迎留言。';
      data.comments.forEach(comment => {
        const article = document.createElement('article');
        const author = document.createElement('strong');
        const date = document.createElement('time');
        const body = document.createElement('p');
        author.textContent = comment.nickname;
        date.dateTime = new Date(comment.created * 1000).toISOString();
        date.textContent = new Date(comment.created * 1000).toLocaleDateString('zh-CN');
        body.textContent = comment.content;
        article.append(author, date, body);
        list.append(article);
      });
    } catch (_) {
      list.textContent = '评论暂时无法加载。';
      const retry = document.createElement('button');
      retry.textContent = '重试';
      retry.addEventListener('click', load);
      list.append(retry);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '正在提交…';
    try {
      const data = await request('/api/comments', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...Object.fromEntries(new FormData(form)), path})
      });
      status.textContent = data.message;
      form.elements.content.value = '';
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? '请求超时，评论可能已提交，请稍后确认再重试。' : '提交失败：' + error.message;
    } finally { button.disabled = false; }
  });
  load();
})();
