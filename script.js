(function(){
  'use strict';
  const root = document.documentElement;
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  // Theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    if (savedTheme === 'light') root.setAttribute('data-theme', 'light');
  } else {
    // default dark
    root.removeAttribute('data-theme');
  }

  const toggleThemeBtn = $('#toggle-theme');
  const updateThemeIcon = () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    toggleThemeBtn.querySelector('img').src = isLight ? 'assets/icon-moon.svg' : 'assets/icon-sun.svg';
  };
  updateThemeIcon();
  toggleThemeBtn.addEventListener('click', () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    if (isLight) {
      root.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
    updateThemeIcon();
  });

  // State
  const STATE_KEY = 'benchmarkStateV1';
  const newId = () => Math.random().toString(36).slice(2, 9);
  const defaultState = () => ({
    models: [
      { id: newId(), name: 'Orion-7B', vendor: 'OpenAI', type: 'LLM', quality: 68, notes: '' },
      { id: newId(), name: 'Atlas-70B', vendor: 'Meta', type: 'LLM', quality: 75, notes: '' },
      { id: newId(), name: 'VisionX', vendor: 'Custom', type: 'Vision', quality: 62, notes: '' },
    ],
    tests: [
      { id: newId(), name: 'MMLU', category: 'Reasoning', difficulty: 4, weight: 7 },
      { id: newId(), name: 'GSM8K', category: 'QA', difficulty: 3, weight: 6 },
      { id: newId(), name: 'MBPP', category: 'Coding', difficulty: 3, weight: 5 },
    ],
    runs: []
  });
  function loadState(){
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.models || !parsed.tests || !Array.isArray(parsed.runs)) throw new Error('bad');
      return parsed;
    } catch {
      return defaultState();
    }
  }
  let state = loadState();
  const saveState = () => localStorage.setItem(STATE_KEY, JSON.stringify(state));

  // Navigation
  const views = {
    dashboard: $('#view-dashboard'),
    models: $('#view-models'),
    tests: $('#view-tests'),
    compare: $('#view-compare'),
    leaderboard: $('#view-leaderboard'),
  };
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.dataset.view;
      Object.values(views).forEach(v => v.classList.remove('active'));
      views[key].classList.add('active');
      render();
    });
  });

  // Footer year
  $('#year').textContent = new Date().getFullYear();

  // Modals
  const modalModel = $('#modal-create-model');
  const modalTest = $('#modal-create-test');
  $('#open-create-model').addEventListener('click', () => modalModel.showModal());
  $('#open-create-test').addEventListener('click', () => modalTest.showModal());
  $('#open-create-model-2').addEventListener('click', () => modalModel.showModal());
  $('#open-create-test-2').addEventListener('click', () => modalTest.showModal());

  // Forms
  $('#form-create-model').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const model = {
      id: newId(),
      name: (fd.get('name')||'').toString().trim(),
      vendor: (fd.get('vendor')||'').toString().trim(),
      type: (fd.get('type')||'LLM').toString(),
      quality: Math.max(0, Math.min(100, Number(fd.get('quality')||60))),
      notes: (fd.get('notes')||'').toString(),
    };
    if (!model.name) return;
    state.models.unshift(model);
    saveState();
    e.currentTarget.reset();
    modalModel.close();
    renderModels();
    renderDashboard();
    fillModelSelects();
  });

  $('#form-create-test').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const test = {
      id: newId(),
      name: (fd.get('name')||'').toString().trim(),
      category: (fd.get('category')||'QA').toString(),
      difficulty: Math.max(1, Math.min(5, Number(fd.get('difficulty')||3))),
      weight: Math.max(1, Math.min(10, Number(fd.get('weight')||5))),
    };
    if (!test.name) return;
    state.tests.unshift(test);
    saveState();
    e.currentTarget.reset();
    modalTest.close();
    renderTests();
    renderDashboard();
    fillTestSelects();
  });

  // Models table
  const modelsTableBody = $('#models-table tbody');
  const modelsSearch = $('#models-search');
  let modelsSort = { key: 'name', dir: 'asc' };
  $('#models-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const key = th.dataset.sort;
    if (modelsSort.key === key) modelsSort.dir = modelsSort.dir === 'asc' ? 'desc' : 'asc';
    else modelsSort = { key, dir: 'asc' };
    renderModels();
  });
  modelsSearch.addEventListener('input', renderModels);

  // Tests table
  const testsTableBody = $('#tests-table tbody');
  const testsSearch = $('#tests-search');
  let testsSort = { key: 'name', dir: 'asc' };
  $('#tests-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const key = th.dataset.sort;
    if (testsSort.key === key) testsSort.dir = testsSort.dir === 'asc' ? 'desc' : 'asc';
    else testsSort = { key, dir: 'asc' };
    renderTests();
  });
  testsSearch.addEventListener('input', renderTests);

  // Compare
  const compareForm = $('#compare-form');
  const compareResults = $('#compare-results');
  const resultsSummary = $('#results-summary');
  const compareChartCanvas = $('#compareChart');

  compareForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = $('#compare-model-a').value;
    const b = $('#compare-model-b').value || null;
    const t = $('#compare-test').value;
    if (!a || !t) return;

    const aRun = simulateRun(a, t);
    state.runs.push(aRun);
    if (b) {
      const bRun = simulateRun(b, t);
      state.runs.push(bRun);
      showCompare([aRun, bRun]);
    } else {
      showCompare([aRun]);
    }
    saveState();
    renderDashboard();
    renderLeaderboard();
  });

  function simulateRun(modelId, testId){
    const model = state.models.find(m => m.id === modelId);
    const test = state.tests.find(x => x.id === testId);
    const base = model?.quality ?? 50;
    const noise = (Math.random() * 16) - 8; // -8..+8
    const difficultyPenalty = (test?.difficulty ?? 3) * 2.2;
    const weightBonus = (test?.weight ?? 5) * 0.6;
    const score = Math.max(0, Math.min(100, Math.round(base + noise - difficultyPenalty + weightBonus)));
    const latency = Math.max(100, Math.round(800 - base*2 + Math.random()*200));
    return { id: newId(), modelId, testId, score, latencyMs: latency, ts: Date.now() };
  }

  function showCompare(runs){
    compareResults.hidden = false;
    const fmt = (n) => Number(n).toLocaleString('ar-EG');
    const items = runs.map(run => {
      const m = state.models.find(x => x.id === run.modelId)?.name || '?';
      const t = state.tests.find(x => x.id === run.testId)?.name || '?';
      return `<div class="badge">${m}</div><div>?????? <b>${t}</b></div><div class="badge">?????: <b>${fmt(run.score)}</b></div><div class="badge">???: ${fmt(run.latencyMs)} ???</div>`;
    }).join('<hr style="border:none;border-top:1px solid var(--glass-border);margin:0.5rem 0;">');
    resultsSummary.innerHTML = items;
    drawCompareChart(compareChartCanvas, runs.map(r => r.score));
  }

  // Dashboard
  const recentRunsBody = $('#recent-runs-table tbody');
  const trendCanvas = $('#scoreTrendChart');

  function renderDashboard(){
    $('#stat-models').textContent = state.models.length;
    $('#stat-tests').textContent = state.tests.length;
    $('#stat-runs').textContent = state.runs.length;
    const avg = state.runs.length ? Math.round(state.runs.reduce((a,b)=>a+b.score,0)/state.runs.length) : null;
    $('#stat-avg').textContent = avg == null ? '?' : avg.toString();

    // Recent runs
    const rows = state.runs
      .slice(-10)
      .reverse()
      .map(run => {
        const m = state.models.find(x=>x.id===run.modelId)?.name || '?';
        const t = state.tests.find(x=>x.id===run.testId)?.name || '?';
        const d = new Date(run.ts).toLocaleString('ar-EG');
        return `<tr><td>${d}</td><td>${m}</td><td>${t}</td><td>${run.score}</td><td>${run.latencyMs}</td></tr>`;
      }).join('');
    recentRunsBody.innerHTML = rows || '<tr><td colspan="5">?? ???? ?????? ???.</td></tr>';

    // Trend chart
    drawTrendChart(trendCanvas, state.runs.slice(-24).map(r => r.score));
  }

  // Models
  function renderModels(){
    const q = modelsSearch.value.trim().toLowerCase();
    const sorted = [...state.models].sort((a,b)=>{
      const ka = a[modelsSort.key];
      const kb = b[modelsSort.key];
      const dir = modelsSort.dir === 'asc' ? 1 : -1;
      return (ka>kb?1:ka<kb?-1:0) * dir;
    }).filter(m => !q || Object.values(m).join(' ').toLowerCase().includes(q));

    modelsTableBody.innerHTML = sorted.map(m => `
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.vendor||'?')}</td>
        <td><span class="badge">${escapeHtml(m.type)}</span></td>
        <td>${m.quality}</td>
        <td>
          <button class="btn" data-del-model="${m.id}">???</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5">?? ???? ?????.</td></tr>';

    $$('[data-del-model]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-model');
      state.models = state.models.filter(m => m.id !== id);
      state.runs = state.runs.filter(r => r.modelId !== id);
      saveState();
      renderModels();
      renderDashboard();
      renderLeaderboard();
      fillModelSelects();
    }));
  }

  // Tests
  function renderTests(){
    const q = testsSearch.value.trim().toLowerCase();
    const sorted = [...state.tests].sort((a,b)=>{
      const ka = a[testsSort.key];
      const kb = b[testsSort.key];
      const dir = testsSort.dir === 'asc' ? 1 : -1;
      return (ka>kb?1:ka<kb?-1:0) * dir;
    }).filter(t => !q || Object.values(t).join(' ').toLowerCase().includes(q));

    testsTableBody.innerHTML = sorted.map(t => `
      <tr>
        <td>${escapeHtml(t.name)}</td>
        <td><span class="badge">${escapeHtml(t.category)}</span></td>
        <td>${t.difficulty}</td>
        <td>${t.weight}</td>
        <td>
          <button class="btn" data-del-test="${t.id}">???</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5">?? ???? ????????.</td></tr>';

    $$('[data-del-test]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-test');
      state.tests = state.tests.filter(t => t.id !== id);
      state.runs = state.runs.filter(r => r.testId !== id);
      saveState();
      renderTests();
      renderDashboard();
      renderLeaderboard();
      fillTestSelects();
    }));
  }

  // Leaderboard
  const lbBody = $('#leaderboard-table tbody');
  const lbFilter = $('#leaderboard-test-filter');
  let lbSort = { key: 'avg', dir: 'desc' };
  $('#leaderboard-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const key = th.dataset.sort;
    if (lbSort.key === key) lbSort.dir = lbSort.dir === 'asc' ? 'desc' : 'asc';
    else lbSort = { key, dir: 'asc' };
    renderLeaderboard();
  });
  lbFilter.addEventListener('change', renderLeaderboard);

  function renderLeaderboard(){
    const testId = lbFilter.value || '';
    const rows = state.models.map(m => {
      const runs = state.runs.filter(r => r.modelId === m.id && (!testId || r.testId === testId));
      const avg = runs.length ? runs.reduce((a,b)=>a+b.score,0)/runs.length : 0;
      const best = runs.length ? Math.max(...runs.map(r=>r.score)) : 0;
      return { id: m.id, name: m.name, avg: Number(avg.toFixed(1)), best, runs: runs.length };
    }).sort((a,b)=>{
      const dir = lbSort.dir === 'asc' ? 1 : -1;
      const ka = a[lbSort.key];
      const kb = b[lbSort.key];
      return (ka>kb?1:ka<kb?-1:0)*dir;
    });

    lbBody.innerHTML = rows.map((row, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.avg}</td>
        <td>${row.best}</td>
        <td>${row.runs}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">?? ???? ??????.</td></tr>';
  }

  // Selects
  function fillModelSelects(){
    const opts = state.models.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    $('#compare-model-a').innerHTML = `<option value="">?</option>${opts}`;
    $('#compare-model-b').innerHTML = `<option value="">?</option>${opts}`;
  }
  function fillTestSelects(){
    const opts = state.tests.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    $('#compare-test').innerHTML = `<option value="">?</option>${opts}`;
    $('#leaderboard-test-filter').innerHTML = `<option value="">????</option>${opts}`;
  }

  // Charts (vanilla canvas)
  function drawTrendChart(canvas, data){
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = 220 * devicePixelRatio;
    ctx.clearRect(0,0,w,h);

    const pad = 28 * devicePixelRatio;
    const xs = (i) => pad + (w - pad*2) * (data.length <= 1 ? 0.5 : i/(data.length-1));
    const min = 0, max = 100; // fixed
    const ys = (v) => h - pad - (h - pad*2) * ((v - min)/(max - min));

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1 * devicePixelRatio;
    for (let i=0;i<=5;i++){
      const y = pad + (h - pad*2) * (i/5);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w-pad, y); ctx.stroke();
    }

    // line
    if (data.length){
      const grad = ctx.createLinearGradient(0,0,w,0);
      grad.addColorStop(0, '#7c3aed'); grad.addColorStop(1, '#22d3ee');
      ctx.strokeStyle = grad; ctx.lineWidth = 2.5 * devicePixelRatio; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      data.forEach((v,i)=>{ const x = xs(i), y = ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      ctx.stroke();
      // points
      ctx.fillStyle = 'rgba(124,58,237,0.25)';
      data.forEach((v,i)=>{ const x = xs(i), y = ys(v); ctx.beginPath(); ctx.arc(x,y,3.5*devicePixelRatio,0,Math.PI*2); ctx.fill(); });
    }
  }

  function drawCompareChart(canvas, scores){
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = 220 * devicePixelRatio;
    ctx.clearRect(0,0,w,h);
    const barW = Math.min(120*devicePixelRatio, (w/Math.max(2, scores.length)) * 0.5);
    const gap = barW * 0.6;
    const total = scores.length * barW + (scores.length-1)*gap;
    const startX = (w - total)/2;
    const max = 100;
    scores.forEach((s, i) => {
      const x = startX + i*(barW+gap);
      const hBar = (h*0.75) * (s/max);
      const y = h - hBar - 10*devicePixelRatio;
      const grad = ctx.createLinearGradient(x, y, x, y+hBar);
      grad.addColorStop(0, '#22d3ee'); grad.addColorStop(1, '#7c3aed');
      roundRect(ctx, x, y, barW, hBar, 8*devicePixelRatio);
      ctx.fillStyle = grad; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `${12*devicePixelRatio}px Cairo, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(s), x + barW/2, y - 6*devicePixelRatio);
    });
  }

  function roundRect(ctx, x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // Utilities
  function escapeHtml(s){
    return s.replace(/[&<>"]/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
  }

  // Initial fill
  function render(){
    renderDashboard();
    renderModels();
    renderTests();
    renderLeaderboard();
    fillModelSelects();
    fillTestSelects();
  }

  // Prime with some initial runs for visuals
  if (!state.runs.length) {
    for (let i=0;i<8;i++){
      const m = state.models[Math.floor(Math.random()*state.models.length)];
      const t = state.tests[Math.floor(Math.random()*state.tests.length)];
      state.runs.push(simulateRun(m.id, t.id));
    }
    saveState();
  }

  render();
})();
