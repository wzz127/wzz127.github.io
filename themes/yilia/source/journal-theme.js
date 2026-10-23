try { document.documentElement.dataset.theme = localStorage.getItem('kfad-theme') === 'dark' ? 'dark' : 'light'; } catch (_) { document.documentElement.dataset.theme = 'light'; }
