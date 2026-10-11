/* Apply a palette before first paint; the optional review panel follows at DOM ready. */
(function () {
  const themes = [
    { id: 'ivory', label: '01 奶油 · 陶土', paper: '#fdf6e3', ink: '#4a3223', accent: '#994426' },
    { id: 'sage', label: '02 雾白 · 松绿', paper: '#f1f7ef', ink: '#263b35', accent: '#21694a' },
    { id: 'slate', label: '03 银灰 · 墨蓝', paper: '#f5f6f8', ink: '#273342', accent: '#2d5e99' },
    { id: 'graphite', label: '04 炭黑 · 冰蓝', paper: '#1b2025', ink: '#e4e9eb', accent: '#a3c9df', dark: true },
    { id: 'olive', label: '05 亚麻 · 橄榄', paper: '#f6f3e5', ink: '#35392a', accent: '#687329' },
    { id: 'rose', label: '06 浅瓷 · 酒红', paper: '#fcf1f2', ink: '#443137', accent: '#963a59' },
    { id: 'petrol', label: '07 冰白 · 深青', paper: '#edf8f8', ink: '#283d43', accent: '#087185' },
    { id: 'mono', label: '08 素白 · 石墨', paper: '#fafafa', ink: '#2c2e30', accent: '#515963' },
    { id: 'plum', label: '09 深梅紫 · 杏金', paper: '#27222e', ink: '#f2e8ef', accent: '#e8b88b', dark: true },
    { id: 'lilac', label: '10 雾紫 · 鸢尾', paper: '#f3f0f7', ink: '#353047', accent: '#65539a', isNew: true },
    { id: 'apricot', label: '11 陶杏 · 钴蓝', paper: '#f7ece4', ink: '#413333', accent: '#315b8c', isNew: true },
    { id: 'forest', label: '12 深松 · 黄铜', paper: '#123f36', ink: '#e8dcc4', accent: '#d9b66a', dark: true, isNew: true },
    { id: 'navy', label: '13 夜航 · 羊皮纸', paper: '#30364f', ink: '#f0f0db', accent: '#e1d9bc', dark: true, isNew: true }
  ];
  const defaults = themes.map(theme => theme.id);
  const poolKey = 'lhmd.palette-pool.v1';
  const rotationKey = 'lhmd.palette-rotation.v1';
  const url = new URL(window.location.href);
  const isPreview = url.searchParams.get('preview') === 'themes';
  let canSave = true;

  function read(storageName, key) {
    try { return JSON.parse(window[storageName].getItem(key)); }
    catch (_) { return null; }
  }
  function save(storageName, key, value) {
    try { window[storageName].setItem(key, JSON.stringify(value)); }
    catch (_) { if (storageName === 'localStorage') canSave = false; }
  }
  const saved = read('localStorage', poolKey);
  let pool = Array.isArray(saved) ? themes.filter(theme => saved.includes(theme.id)).map(theme => theme.id) : [];
  if (!pool.length) pool = defaults.slice();
  let rotation = read('sessionStorage', rotationKey);
  if (!rotation || typeof rotation !== 'object' || Array.isArray(rotation)) rotation = {};
  let current;

  function apply(id) {
    current = id;
    document.documentElement.dataset.theme = id;
    document.documentElement.dataset.colorScheme = themes.find(theme => theme.id === id).dark ? 'dark' : 'light';
    rotation.last = id;
    save('sessionStorage', rotationKey, rotation);
  }

  function nextPalette() {
    const signature = 'equal:' + pool.join(',');
    if (rotation.signature !== signature || !Array.isArray(rotation.bag) ||
        rotation.bag.some(id => !pool.includes(id))) rotation.bag = [];
    rotation.signature = signature;
    if (!rotation.bag.length) {
      // Draw each selected palette once per round, with equal light/dark weights.
      rotation.bag = pool.slice();
    }
    let candidates = rotation.bag.map((id, index) => ({ id, index }))
      .filter(ticket => ticket.id !== rotation.last);
    if (!candidates.length) candidates = rotation.bag.map((id, index) => ({ id, index }));
    const ticket = candidates[Math.floor(Math.random() * candidates.length)];
    rotation.bag.splice(ticket.index, 1);
    apply(ticket.id);
  }

  // Old preview links select a palette once; reloading that page resumes the random pool.
  const requested = url.searchParams.get('theme');
  if (isPreview && themes.some(theme => theme.id === requested)) apply(requested);
  else nextPalette();
  if (requested !== null) {
    url.searchParams.delete('theme');
    window.history.replaceState(null, '', url);
  }
  if (!isPreview) return;

  function buildChooser() {
    const panel = document.createElement('aside');
    panel.className = 'theme-preview';
    panel.lang = 'zh-CN';
    panel.setAttribute('aria-label', '主页配色方案');
    panel.innerHTML = `
      <details open>
        <summary class="theme-summary"><span>配色方案</span><span class="theme-current"></span></summary>
        <div class="theme-panel-content">
          <p class="theme-instructions">点击配色预览，勾选加入随机池。每轮各出现一次，深浅同频。</p>
          <h3 class="theme-group-title">新增配色</h3>
          <div class="theme-options theme-options-new"></div>
          <details class="theme-existing">
            <summary class="theme-group-title">现有配色（${themes.filter(theme => !theme.isNew).length} 款）</summary>
            <div class="theme-options"></div>
          </details>
          <div class="theme-panel-footer">
            <span class="theme-status" role="status"></span>
            <button class="theme-reset" type="button">全部加入</button>
            <button class="theme-shuffle" type="button">随机换一套</button>
          </div>
        </div>
      </details>`;
    const newChoices = panel.querySelector('.theme-options-new');
    const choices = panel.querySelector('.theme-options:not(.theme-options-new)');

    function render() {
      const active = themes.find(theme => theme.id === current);
      panel.querySelector('.theme-current').textContent = '当前 ' + active.label;
      panel.querySelector('.theme-status').textContent = canSave
        ? '已选 ' + pool.length + ' 款 · 自动记住选择'
        : '已选 ' + pool.length + ' 款 · 当前浏览器无法保存';
      themes.forEach(theme => {
        const card = panel.querySelector('[data-palette="' + theme.id + '"]');
        card.querySelector('button').setAttribute('aria-pressed', String(theme.id === current));
        const input = card.querySelector('input');
        input.checked = pool.includes(theme.id);
        input.disabled = pool.length === 1 && input.checked;
        input.title = input.disabled ? '至少保留一种配色' : '';
      });
    }

    themes.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'theme-option';
      card.dataset.palette = theme.id;
      card.style.setProperty('--sample-paper', theme.paper);
      card.style.setProperty('--sample-ink', theme.ink);
      card.style.setProperty('--sample-accent', theme.accent);
      card.innerHTML = `
        <button class="theme-choice" type="button" aria-label="预览 ${theme.label}">
          <span class="theme-sample" aria-hidden="true"><span>Aa</span><i></i><i></i></span>
          <span class="theme-name">${theme.label}</span>
        </button>
        <label class="theme-include"><input type="checkbox" aria-label="将 ${theme.label} 加入随机池">参与随机${theme.dark ? ' · 深色' : ''}</label>`;
      card.querySelector('button').addEventListener('click', () => { apply(theme.id); render(); });
      card.querySelector('input').addEventListener('change', event => {
        const selected = new Set(pool);
        if (event.target.checked) selected.add(theme.id);
        else selected.delete(theme.id);
        if (!selected.size) { render(); return; }
        pool = themes.filter(item => selected.has(item.id)).map(item => item.id);
        rotation.bag = [];
        save('localStorage', poolKey, pool);
        save('sessionStorage', rotationKey, rotation);
        render();
      });
      (theme.isNew ? newChoices : choices).append(card);
    });
    panel.querySelector('.theme-reset').addEventListener('click', () => {
      pool = defaults.slice();
      rotation.bag = [];
      save('localStorage', poolKey, pool);
      nextPalette();
      render();
    });
    panel.querySelector('.theme-shuffle').addEventListener('click', () => { nextPalette(); render(); });
    document.body.append(panel);
    // Probe saving here so the panel can report browsers that block storage.
    save('localStorage', poolKey, pool);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildChooser, { once: true });
  else buildChooser();
})();
