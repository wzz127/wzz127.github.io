(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const themeButton = $('#theme-toggle');
  function syncTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', '切换到' + (dark ? '浅色' : '深色') + '模式');
    themeButton.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    const frame = $('iframe.giscus-frame');
    if (frame) frame.contentWindow.postMessage({giscus:{setConfig:{theme:dark?'dark':'light'}}}, 'https://giscus.app');
  }
  themeButton.addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('kfad-theme', document.documentElement.dataset.theme); } catch (_) {}
    syncTheme();
  });
  syncTheme();
  const comments = $('#comments');
  if (comments) new MutationObserver(() => {
    const frame = $('iframe.giscus-frame');
    if (frame && !frame.dataset.themeBound) { frame.dataset.themeBound='true'; frame.addEventListener('load',syncTheme); }
  }).observe(comments,{childList:true,subtree:true});
  window.addEventListener('message', event => {
    const frame = $('iframe.giscus-frame');
    if(event.origin === 'https://giscus.app' && frame && event.source === frame.contentWindow && event.data?.giscus) syncThemeOnce();
  });
  let commentsSynced=false;
  function syncThemeOnce(){if(!commentsSynced){commentsSynced=true;syncTheme();}}

  const dialog=$('#search-dialog'), input=$('#search-input'), results=$('#search-results'), summary=$('#search-summary');
  let indexPromise, matches=[];
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rootURL=new URL(document.body.dataset.searchUrl,location.href);
  const route = post => new URL(post.path,rootURL).pathname;
  function loadIndex(){
    if(!indexPromise) indexPromise=fetch(rootURL,{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error('search');return r.json()}).then(data=>{if(!Array.isArray(data))throw Error('search');return data}).catch(error=>{indexPromise=null;throw error});
    return indexPromise;
  }
  async function search(){
    const query=input.value.trim().toLocaleLowerCase();
    matches=[];summary.textContent='正在查找…';
    try {
      const posts=await loadIndex();
      if(query!==input.value.trim().toLocaleLowerCase())return;
      matches=query?posts.filter(p=>(p.title+' '+(p.text||'')+' '+p.tags.map(t=>t.name).join(' ')).toLocaleLowerCase().includes(query)):posts.slice(0,6);
      summary.textContent=query?'找到 '+matches.length+' 篇文章':'搜索全部 '+posts.length+' 篇文章';
      results.innerHTML=matches.length?'<div class="search-caption">'+(query?'找到这些记录':'最近的文章')+'</div>'+matches.map(p=>'<a class="search-result" href="'+escape(route(p))+'"><strong>'+escape(p.title)+'</strong><small>'+escape(p.date.slice(0,10))+' / '+escape(p.tags.map(t=>t.name).join(' · '))+'</small></a>').join(''):'<div class="empty-state"><h3>还没找到这篇记录</h3><p>试试「AI」「孩子」或「Hadoop」。</p></div>';
    } catch (_) {
      summary.textContent='搜索暂时不可用';
      results.innerHTML='<div class="empty-state"><h3>文章索引未能加载</h3><p>请检查网络，或稍后再试。</p><button type="button" id="retry-search">重新加载</button></div>';
    }
  }
  function openSearch(){dialog.showModal();input.value='';results.innerHTML='<div class="empty-state">正在加载文章…</div>';input.focus();search();}
  $('#open-search').addEventListener('click',openSearch);
  $('#close-search').addEventListener('click',()=>dialog.close());
  input.addEventListener('input',search);
  results.addEventListener('click',event=>{if(event.target.closest('#retry-search'))search()});
  $('#search-form').addEventListener('submit',event=>{event.preventDefault();if(matches[0])location.assign(route(matches[0]));});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?dialog.close():openSearch()}});
  const imageDialog=$('#image-dialog');
  [dialog,imageDialog].forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close()}}));
  $('#close-image').addEventListener('click',()=>imageDialog.close());
  document.querySelectorAll('.article-entry img').forEach(img=>{
    img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','放大图片：'+(img.alt||'文章图片'));
    const show=()=>{const target=imageDialog.querySelector('img');target.src=img.currentSrc||img.src;target.alt=img.alt;imageDialog.showModal()};
    img.addEventListener('click',show);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show()}});
  });
  function progress(){
    $('#back-top').hidden=scrollY<500;
    const body=$('.article-entry');if(!body)return;
    const start=body.getBoundingClientRect().top+scrollY;
    $('#reading-progress').style.width=Math.min(100,Math.max(0,(scrollY-start+130)/Math.max(1,body.scrollHeight-innerHeight+130)*100))+'%';
  }
  $('#back-top').addEventListener('click',()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  addEventListener('scroll',progress,{passive:true});addEventListener('resize',progress,{passive:true});progress();
})();
