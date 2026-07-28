/* ── Tool Hub — Application Logic ── */

const APP = {
  apiUrl: localStorage.getItem('toolhub_api') || 'http://localhost:8080',
  currentPage: 'dashboard',
  toolsData: null,

  init() {
    this.checkApiStatus();
    this.loadPage('dashboard');
    this.setupNav();
    this.setupConfigForm();
  },

  // ── API ──
  async api(path, options = {}) {
    try {
      const res = await fetch(`${this.apiUrl}${path}`, {
        headers: { 'Accept': 'application/json', ...options.headers },
        ...options
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (e) {
      if (e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to backend. Make sure the API server is running.');
      }
      throw e;
    }
  },

  async checkApiStatus() {
    const dot = document.getElementById('apiDot');
    const text = document.getElementById('apiText');
    dot.className = 'dot checking';
    text.textContent = 'Checking...';
    try {
      const data = await this.api('/api/health');
      dot.className = 'dot online';
      text.textContent = 'API Online';
    } catch (e) {
      dot.className = 'dot';
      text.textContent = 'Offline';
    }
  },

  // ── Navigation ──
  setupNav() {
    document.querySelectorAll('nav a').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        this.loadPage(a.dataset.page);
      });
    });
  },

  loadPage(name) {
    this.currentPage = name;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${name}`).classList.add('active');
    document.querySelectorAll('nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === name);
    });

    switch (name) {
      case 'dashboard': this.renderDashboard(); break;
      case 'schedule': this.renderSchedule(); break;
      case 'tools': this.renderTools(); break;
      case 'magnet': this.renderMagnet(); break;
      case 'pdf-library': this.renderPdfLibrary(); break;
    }
  },

  // ── Toast ──
  toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
  },

  // ── SCHEDULE ──
  SCHEDULE_SLOTS: [
    { time: '00:00', name: 'Bitcoin Philosophy', type: 'reel+carousel', script: 'daily_bitcoin_philosophy_post.py', emoji: '🧠', desc: 'Deep reflections on money, value, and freedom' },
    { time: '03:00', name: 'BTC Bitcoin Bulletin', type: 'reel+carousel', script: 'daily_bitcoin_post.py', emoji: '₿', desc: 'Price, facts, and Austrian economics insights' },
    { time: '08:00', name: 'History of Sound Money', type: 'reel+carousel', script: 'daily_history_post.py', emoji: '🏛️', desc: 'From Menger to Bitcoin — the fight for sound money' },
    { time: '08:00', name: 'News Briefing', type: 'text', script: 'cron (LLM)', emoji: '📰', desc: '6-section news: Bitcoin, Geopolitics, Malaysia, Tech, Wildcard, Weird' },
    { time: '12:00', name: 'Austrian Econ & AI Motivation', type: 'reel+carousel', script: 'daily_ig_post.py', emoji: '⚡', desc: 'Austrian economics meets AI-era motivation' },
    { time: '12:00', name: 'News Briefing', type: 'text', script: 'cron (LLM)', emoji: '📰', desc: '6-section news briefing (repeat)' },
    { time: '15:00', name: 'Engagement Post', type: 'single-image', script: 'engagement_post.py', emoji: '💬', desc: 'Hot-take single image for engagement' },
    { time: '18:00', name: 'The Daily Brief', type: 'reel+carousel', script: 'daily_brief_post.py', emoji: '📋', desc: 'Visual news digest — top stories of the day' },
    { time: '20:00', name: 'News Briefing', type: 'text', script: 'cron (LLM)', emoji: '📰', desc: 'Evening news briefing' },
    { time: '21:00', name: 'Bitcoin Curiosities', type: 'reel+carousel', script: 'daily_quirky_post.py', emoji: '🔮', desc: 'Weird & wonderful Bitcoin and history facts' },
    { time: '11:00 Sat', name: 'Weekly Affiliate Post', type: 'single-image', script: 'affiliate_post.py', emoji: '🤝', desc: 'HATA + Luno affiliate links push' },
  ],

  SCHEDULE_CRON_MAP: {
    'Bitcoin Philosophy': 'cb20234ce271',
    'BTC Bitcoin Bulletin': 'b9934a4874ea',
    'History of Sound Money': '84d748414265',
    'News Briefing': '176823e36a57',
    'Austrian Econ & AI Motivation': 'cc805909a564',
    'Engagement Post': '15ffac5a3112',
    'The Daily Brief': 'fa04bd4f3d7c',
    'Bitcoin Curiosities': '5125e86c6a83',
    'Weekly Affiliate Post': '89c37687603c',
  },

  async renderSchedule() {
    const el = document.getElementById('schedule-content');
    el.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading schedule...</div>';

    // Try fetching live cron status from backend
    let cronStatus = {};
    try {
      const jobs = await this.api('/api/cron');
      if (jobs && jobs.jobs) {
        for (const j of jobs.jobs) {
          cronStatus[j.name] = j;
        }
      }
    } catch (e) {
      // No API — render static schedule
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeMins = currentHour * 60 + currentMin;

    // Group by time
    const timeline = [];
    const seen = new Set();
    for (const slot of this.SCHEDULE_SLOTS) {
      const key = slot.time + slot.name;
      let count = 1;
      let baseKey = key;
      while (seen.has(baseKey)) { count++; baseKey = key + count; }
      seen.add(baseKey);

      const [h, m] = slot.time.split(/[: ]/);
      const slotMins = parseInt(h) * 60 + (parseInt(m) || 0);
      const isPast = slotMins < currentTimeMins;
      const isNow = Math.abs(slotMins - currentTimeMins) < 60;

      timeline.push({ ...slot, isPast, isNow, slotMins });
    }
    timeline.sort((a, b) => a.slotMins - b.slotMins);

    el.innerHTML = `
      <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">
        <div class="card" style="flex:1;min-width:200px">
          <h3>Daily Posts</h3>
          <div class="big-number">${this.SCHEDULE_SLOTS.filter(s => s.type !== 'text').length}</div>
          <div style="font-size:13px;color:var(--text2)">visual posts per day</div>
        </div>
        <div class="card" style="flex:1;min-width:200px">
          <h3>Text Briefings</h3>
          <div class="big-number">${this.SCHEDULE_SLOTS.filter(s => s.type === 'text').length}</div>
          <div style="font-size:13px;color:var(--text2)">per day (8AM, 12PM, 8PM)</div>
        </div>
        <div class="card" style="flex:1;min-width:200px">
          <h3>Weekly</h3>
          <div class="big-number">1</div>
          <div style="font-size:13px;color:var(--text2)">affiliate post (Saturday 11AM)</div>
        </div>
      </div>

      <div class="card">
        <h3>Daily Timeline ${now.toLocaleDateString()}</h3>
        <div style="margin-top:12px">
          ${timeline.map(slot => {
            const cronName = this.SCHEDULE_CRON_MAP[slot.name];
            const job = cronStatus[cronName];
            const statusIcon = job ? (job.last_status === 'ok' ? '✅' : '❌') : '';
            const statusClass = job ? (job.last_status === 'ok' ? 'success' : 'error') : '';
            return `
              <div class="schedule-slot ${slot.isNow ? 'now' : ''} ${slot.isPast ? 'past' : 'future'}" style="
                display:flex;align-items:center;gap:12px;padding:12px 16px;
                border-left:3px solid ${slot.isNow ? 'var(--accent)' : slot.isPast ? 'var(--border)' : 'var(--surface3)'};
                background: ${slot.isNow ? 'rgba(247,147,26,.08)' : 'transparent'};
                border-bottom:1px solid var(--border);
                opacity: ${slot.isPast ? '.6' : '1'};
              ">
                <div style="min-width:80px;font-weight:700;font-size:15px;color:${slot.isNow ? 'var(--accent)' : 'var(--text)'}">
                  ${slot.isNow ? '▶' : ''} ${slot.time}
                </div>
                <div style="font-size:22px;min-width:30px">${slot.emoji}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:14px">${slot.name}</div>
                  <div style="font-size:12px;color:var(--text2)">${slot.desc}</div>
                  <div style="font-size:11px;color:var(--text2);margin-top:2px">
                    <code style="background:var(--surface2);padding:1px 6px;border-radius:4px">${slot.script}</code>
                    <span class="category-tag" style="margin-left:6px;background:${slot.type === 'text' ? 'rgba(99,102,241,.15)' : slot.type === 'single-image' ? 'rgba(34,197,94,.15)' : 'rgba(247,147,26,.15)'};color:${slot.type === 'text' ? '#818cf8' : slot.type === 'single-image' ? '#22c55e' : '#F7931A'}">${slot.type}</span>
                  </div>
                </div>
                ${job ? `
                  <div style="text-align:right;font-size:12px">
                    <div class="status-badge ${statusClass}" style="margin-bottom:4px">${statusIcon} ${job.last_status || 'never run'}</div>
                    <div style="color:var(--text2)">next: ${job.next_run_at ? new Date(job.next_run_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '-'}</div>
                  </div>
                ` : `
                  <div style="text-align:right;font-size:11px;color:var(--text2)">
                    <span class="status-badge" style="background:var(--surface3);color:var(--text2)">⏳ cron</span>
                  </div>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h3>Platforms</h3>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface2);border-radius:var(--radius-sm)">
            <span style="font-size:20px">📸</span>
            <div><div style="font-weight:600;font-size:13px">Instagram</div><div style="font-size:11px;color:var(--text2)">All visual posts + reels</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface2);border-radius:var(--radius-sm)">
            <span style="font-size:20px">📘</span>
            <div><div style="font-weight:600;font-size:13px">Facebook</div><div style="font-size:11px;color:var(--text2)">All visual posts + reels</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface2);border-radius:var(--radius-sm)">
            <span style="font-size:20px">▶️</span>
            <div><div style="font-weight:600;font-size:13px">YouTube</div><div style="font-size:11px;color:var(--text2)">Reels/Shorts only</div></div>
          </div>
        </div>
      </div>
    `;
  },

  // ── DASHBOARD ──
  async renderDashboard() {
    const el = document.getElementById('dashboard-content');
    el.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading analytics...</div>';

    try {
      const stats = await this.api('/api/stats?days=30');
      this.renderStats(el, stats);
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>${e.message}</p><button class="btn btn-secondary" onclick="APP.loadPage('dashboard')">Retry</button></div>`;
    }
  },

  renderStats(el, stats) {
    const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
    const maxDaily = Math.max(...stats.daily.map(d => d.total), 1);

    el.innerHTML = `
      <div class="stats-grid">
        <div class="card"><h3>Total Posts</h3><div class="big-number">${stats.total}</div></div>
        <div class="card"><h3>Success Rate</h3><div class="big-number">${successRate}%</div><div style="font-size:13px;color:var(--text2)">${stats.success} ✅ / ${stats.failures} ❌</div></div>
        <div class="card"><h3>Platforms</h3><div class="big-number">${Object.keys(stats.by_platform).length}</div><div style="font-size:13px;color:var(--text2)">${Object.entries(stats.by_platform).map(([k,v]) => `${k}: ${v}`).join(', ')}</div></div>
        <div class="card"><h3>Categories</h3><div class="big-number">${Object.keys(stats.by_category).length}</div><div style="font-size:13px;color:var(--text2)">${Object.entries(stats.by_category).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}: ${v}`).join(', ')}</div></div>
      </div>

      <div class="breakdown-grid">
        <div class="card">
          <h3>By Platform</h3>
          ${Object.entries(stats.by_platform).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
            const pct = Math.round((v / stats.total) * 100);
            return `<div class="chart-bar"><span class="bar-label">${k}</span><div class="bar-fill" style="width:${pct}%"></div><span class="bar-count">${v}</span></div>`;
          }).join('')}
          ${Object.keys(stats.by_platform).length === 0 ? '<div style="color:var(--text2);font-size:13px">No data yet</div>' : ''}
        </div>

        <div class="card">
          <h3>By Type</h3>
          ${Object.entries(stats.by_type).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
            const pct = Math.round((v / stats.total) * 100);
            return `<div class="chart-bar"><span class="bar-label">${k}</span><div class="bar-fill" style="width:${pct}%"></div><span class="bar-count">${v}</span></div>`;
          }).join('')}
          ${Object.keys(stats.by_type).length === 0 ? '<div style="color:var(--text2);font-size:13px">No data yet</div>' : ''}
        </div>

        <div class="card">
          <h3>By Category</h3>
          ${Object.entries(stats.by_category).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
            const pct = Math.round((v / stats.total) * 100);
            return `<div class="chart-bar"><span class="bar-label">${k}</span><div class="bar-fill" style="width:${pct}%"></div><span class="bar-count">${v}</span></div>`;
          }).join('')}
          ${Object.keys(stats.by_category).length === 0 ? '<div style="color:var(--text2);font-size:13px">No data yet</div>' : ''}
        </div>
      </div>

      <div class="card">
        <h3>Daily Post Activity (Last 14 Days)</h3>
        <div class="daily-chart">
          ${stats.daily.slice(0, 14).reverse().map(d => {
            const h = Math.max(4, (d.total / maxDaily) * 100);
            return `<div class="daily-bar" style="height:${h}px;background:var(--accent);opacity:${d.success > 0 ? 1 : .4}" title="${d.date}: ${d.total} posts">
              <div class="daily-bar-label">${d.date.slice(5)}</div>
            </div>`;
          }).join('')}
          ${stats.daily.length === 0 ? '<div style="color:var(--text2);font-size:13px;padding:20px">No data for last 14 days</div>' : ''}
        </div>
      </div>

      <div class="card">
        <h3>Recent Posts</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Platform</th><th>Type</th><th>Category</th><th>Status</th><th>ID</th></tr></thead>
            <tbody>
              ${stats.recent.slice(0, 15).map(r => `
                <tr>
                  <td>${(r.timestamp || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>${r.platform || '-'}</td>
                  <td>${r.post_type || '-'}</td>
                  <td>${r.category || '-'}</td>
                  <td><span class="status-badge ${r.status === 'success' ? 'success' : 'error'}">${r.status}</span></td>
                  <td style="font-size:11px;color:var(--text2)">${(r.post_id || '-').slice(0, 16)}</td>
                </tr>
              `).join('')}
              ${stats.recent.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text2)">No posts recorded yet</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ── TOOLS ──
  async renderTools() {
    const el = document.getElementById('tools-content');
    el.innerHTML = '<div class="loading-state"><span class="spinner"></span>Scanning scripts...</div>';

    try {
      const data = await this.api('/api/tools');
      this.toolsData = data.tools;
      this.renderToolsList(el, data.tools);
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="icon">🔧</div><p>${e.message}</p><button class="btn btn-secondary" onclick="APP.loadPage('tools')">Retry</button></div>`;
    }
  },

  renderToolsList(el, tools) {
    if (!tools || tools.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">🔧</div><p>No scripts found in ~/.hermes/scripts/</p></div>';
      return;
    }

    const categories = [...new Set(tools.map(t => t.category))];

    el.innerHTML = `
      <div class="filter-bar">
        <input type="text" id="toolSearch" placeholder="Search tools..." oninput="APP.filterTools()">
        <select id="toolCategory" onchange="APP.filterTools()">
          <option value="all">All Categories</option>
          ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <span style="font-size:13px;color:var(--text2);margin-left:auto;padding:6px 0">${tools.length} scripts</span>
      </div>
      <div id="toolDetail" class="tool-detail"></div>
      <div id="toolsGrid" class="tools-grid">
        ${tools.map(t => APP.toolCard(t)).join('')}
      </div>
    `;

    document.querySelectorAll('.tool-card').forEach(card => {
      card.addEventListener('click', () => APP.showToolDetail(card.dataset.name));
    });
  },

  toolCard(t) {
    return `
      <div class="tool-card" data-name="${t.name}" data-category="${t.category}">
        <div class="tool-name">${t.name}</div>
        <div class="tool-desc">${t.description || 'No description'}</div>
        <div class="tool-meta">
          <span class="category-tag ${t.category}">${t.category}</span>
          <span>${t.size_kb} KB</span>
          <span style="margin-left:auto">${(t.modified || '').slice(0, 10)}</span>
        </div>
      </div>
    `;
  },

  filterTools() {
    const search = document.getElementById('toolSearch').value.toLowerCase();
    const cat = document.getElementById('toolCategory').value;

    document.querySelectorAll('.tool-card').forEach(card => {
      const name = card.dataset.name.toLowerCase();
      const category = card.dataset.category;
      const match = name.includes(search) && (cat === 'all' || category === cat);
      card.style.display = match ? 'block' : 'none';
    });
  },

  async showToolDetail(name) {
    const el = document.getElementById('toolDetail');
    el.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading...</div>';
    el.classList.add('open');

    try {
      const info = await this.api(`/api/tools/${name}`);
      el.innerHTML = `
        <div class="detail-header">
          <h2>${info.name}</h2>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="APP.runTool('${info.name}')">▶ Run</button>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('toolDetail').classList.remove('open')">✕</button>
          </div>
        </div>
        <div style="margin-bottom:12px;font-size:12px;color:var(--text2)">
          ${info.size_kb} KB · ${info.line_count} lines · ${info.functions?.length || 0} functions
          ${info.path ? `· ${info.path}` : ''}
        </div>
        ${info.docstring ? `<div style="margin-bottom:12px;font-size:13px;line-height:1.5">${info.docstring}</div>` : ''}
        ${info.functions?.length ? `
          <h3 style="font-size:12px;color:var(--text2);margin-bottom:8px">Functions</h3>
          <div style="margin-bottom:12px">
            ${info.functions.map(f => `<code style="display:block;padding:2px 0;font-size:12px;color:var(--accent)">def ${f.name}(${f.args})</code>`).join('')}
          </div>
        ` : ''}
        <div id="toolRunOutput"></div>
      `;
    } catch (e) {
      el.innerHTML = `<div style="color:var(--error)">${e.message}</div>`;
    }
  },

  async runTool(name) {
    const outputEl = document.getElementById('toolRunOutput');
    outputEl.innerHTML = '<div class="loading-state"><span class="spinner"></span>Running...</div>';

    try {
      const result = await this.api(`/api/tools/${name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: '', timeout: 180 })
      });

      outputEl.innerHTML = `
        <div style="margin-bottom:8px">
          <span class="status-badge ${result.success ? 'success' : 'error'}">Exit: ${result.exit_code}</span>
        </div>
        ${result.stdout ? `<h4 style="font-size:12px;color:var(--text2);margin:8px 0 4px">stdout</h4><pre class="log-output">${result.stdout}</pre>` : ''}
        ${result.stderr ? `<h4 style="font-size:12px;color:var(--error);margin:8px 0 4px">stderr</h4><pre class="log-output">${result.stderr}</pre>` : ''}
        ${!result.stdout && !result.stderr ? '<div style="color:var(--text2);font-size:13px">No output</div>' : ''}
      `;
      this.toast(result.success ? `✅ ${name} completed` : `❌ ${name} failed (exit ${result.exit_code})`, result.success ? 'success' : 'error');
    } catch (e) {
      outputEl.innerHTML = `<div style="color:var(--error)">${e.message}</div>`;
      this.toast(`Error: ${e.message}`, 'error');
    }
  },

  // ── LEAD MAGNET ──
  renderMagnet() {
    const el = document.getElementById('magnet-content');
    el.innerHTML = `
      <div class="card" style="max-width:600px">
        <h3>Generate PDF</h3>
        <p style="font-size:13px;color:var(--text2);margin-bottom:16px">
          Generates a "Bitcoin for Beginners" lead magnet PDF with ~40 curated stories across 5 sections, 
          affiliate links, and Bitcoin orange branding. Generated file is saved to home directory and uploaded for sharing.
        </p>
        <button class="btn btn-primary" id="generateBtn" onclick="APP.generateMagnet()">
          ⚡ Generate Bitcoin for Beginners PDF
        </button>
        <div id="magnetOutput" style="margin-top:16px"></div>
      </div>

      <div class="card" style="max-width:600px">
        <h3>Last Generated</h3>
        <div id="magnetLastGen">
          <div style="color:var(--text2);font-size:13px">Run the generator to see results here.</div>
        </div>
      </div>
    `;
  },

  async generateMagnet() {
    const btn = document.getElementById('generateBtn');
    const output = document.getElementById('magnetOutput');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Generating...';
    output.innerHTML = '';

    try {
      const result = await this.api('/api/generate-lead-magnet', { method: 'POST' });
      output.innerHTML = `
        ${result.success ? `
          <div style="padding:12px;background:rgba(34,197,94,.1);border-radius:var(--radius-sm)">
            <div style="font-weight:600;color:var(--success)">✅ PDF Generated Successfully</div>
            <div style="font-size:13px;margin-top:8px">
              <div>Path: <code style="color:var(--accent)">${result.path}</code></div>
              <div>Size: ${result.size_kb} KB</div>
              ${result.url ? `<div style="margin-top:4px">Share: <a href="${result.url}" target="_blank" style="color:var(--accent)">${result.url}</a></div>` : ''}
            </div>
          </div>
        ` : `
          <div style="padding:12px;background:rgba(239,68,68,.1);border-radius:var(--radius-sm);color:var(--error)">
            <div style="font-weight:600">❌ Generation Failed</div>
            <pre style="margin-top:8px;font-size:12px">${result.error || 'Unknown error'}</pre>
          </div>
        `}
      `;
      this.toast(result.success ? '✅ PDF generated!' : '❌ Generation failed', result.success ? 'success' : 'error');
      document.getElementById('magnetLastGen').innerHTML = result.success ? `
        <div style="font-size:13px">
          <div>Generated: ${new Date().toLocaleString()}</div>
          <div>Size: ${result.size_kb} KB</div>
          ${result.url ? `<div>URL: <a href="${result.url}" target="_blank" style="color:var(--accent)">${result.url.slice(0, 50)}...</a></div>` : ''}
        </div>
      ` : '<div style="color:var(--text2);font-size:13px">Failed to generate</div>';
    } catch (e) {
      output.innerHTML = `<div style="color:var(--error)">${e.message}</div>`;
      this.toast(`Error: ${e.message}`, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '⚡ Generate Bitcoin for Beginners PDF';
  },

  // ── PDF LIBRARY ──
  async renderPdfLibrary() {
    const el = document.getElementById('pdf-library-content');
    el.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading PDF library...</div>';

    let topics = [];
    try {
      const data = await this.api('/api/pdf-library');
      topics = data.topics || [];
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="icon">📚</div><p>${e.message}</p><button class="btn btn-secondary" onclick="APP.loadPage('pdf-library')">Retry</button></div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
        <div class="card" style="flex:1;min-width:200px">
          <h3>PDF Library</h3>
          <div class="big-number">${topics.length}</div>
          <div style="font-size:13px;color:var(--text2)">lead magnet variations</div>
        </div>
        <button class="btn btn-primary" onclick="APP.generateAllPdfs()" id="generateAllBtn" style="height:fit-content">
          ⚡ Generate All ${topics.length} PDFs
        </button>
      </div>
      <div id="pdfLibraryGrid" class="pdf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
        ${topics.map(t => APP.pdfCard(t)).join('')}
      </div>
      <div id="pdfLibraryOutput" style="margin-top:16px"></div>
    `;
  },

  pdfCard(t) {
    return `
      <div class="card" style="padding:16px;border-left:4px solid ${t.color};cursor:pointer" onclick="APP.generateSinglePdf('${t.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">${t.title}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">${t.subtitle}</div>
          </div>
          <span class="category-tag content" style="background:${t.color}22;color:${t.color};font-size:10px">PDF</span>
        </div>
        <div style="margin-top:10px">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();APP.generateSinglePdf('${t.id}')">
            ⚡ Generate
          </button>
          <span id="pdfStatus_${t.id}" style="margin-left:8px;font-size:12px;color:var(--text2)"></span>
        </div>
      </div>
    `;
  },

  async generateSinglePdf(topicId) {
    const statusEl = document.getElementById(`pdfStatus_${topicId}`);
    const output = document.getElementById('pdfLibraryOutput');
    statusEl.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span>';
    output.innerHTML = '';

    try {
      const result = await this.api(`/api/pdf-library/${topicId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload: false })
      });

      if (result.success) {
        statusEl.innerHTML = `✅ ${result.size_kb} KB`;
        output.innerHTML = `
          <div style="padding:12px;background:rgba(34,197,94,.1);border-radius:var(--radius-sm)">
            <div style="font-weight:600;color:var(--success)">✅ ${result.topic_id} generated</div>
            <div style="font-size:13px;margin-top:4px;color:var(--text2)">${result.path} (${result.size_kb} KB)</div>
          </div>
        `;
        this.toast(`✅ ${result.topic_id} PDF generated`, 'success');
      } else {
        statusEl.innerHTML = '❌';
        output.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,.1);border-radius:var(--radius-sm);color:var(--error)">${result.error || 'Failed'}</div>`;
      }
    } catch (e) {
      statusEl.innerHTML = '❌';
      output.innerHTML = `<div style="color:var(--error)">${e.message}</div>`;
    }
  },

  async generateAllPdfs() {
    const btn = document.getElementById('generateAllBtn');
    const output = document.getElementById('pdfLibraryOutput');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Generating 12 PDFs...';
    output.innerHTML = '';

    try {
      const result = await this.api('/api/pdf-library/generate/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload: false })
      });

      if (result.success && result.results) {
        const successes = result.results.filter(r => r.success).length;
        const failures = result.results.filter(r => !r.success).length;
        output.innerHTML = `
          <div style="padding:16px;background:rgba(34,197,94,.1);border-radius:var(--radius-sm)">
            <div style="font-weight:600;color:var(--success)">✅ Generated ${successes}/${result.total} PDFs</div>
            <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
              ${result.results.map(r => `
                <div style="font-size:12px;padding:6px 10px;background:var(--surface2);border-radius:6px;color:${r.success ? 'var(--success)' : 'var(--error)'}">
                  ${r.success ? '✅' : '❌'} ${r.id}
                  ${r.success ? `<span style="color:var(--text2)">${r.size_kb || ''} KB</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
        if (failures === 0) {
          this.toast(`✅ All ${result.total} PDFs generated!`, 'success');
        } else {
          this.toast(`⚠️ ${successes}/${result.total} generated, ${failures} failed`, failures === 0 ? 'success' : 'error');
        }
      } else {
        output.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,.1);border-radius:var(--radius-sm);color:var(--error)">${result.error || 'Batch generation failed'}</div>`;
      }
    } catch (e) {
      output.innerHTML = `<div style="color:var(--error)">${e.message}</div>`;
      this.toast(`Error: ${e.message}`, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '⚡ Generate All 12 PDFs';
  },

  // ── CONFIG ──
  setupConfigForm() {
    document.getElementById('configUrl').value = this.apiUrl;
  },

  saveConfig() {
    const url = document.getElementById('configUrl').value.trim().replace(/\/+$/, '');
    if (!url) return this.toast('Please enter a valid URL', 'error');
    this.apiUrl = url;
    localStorage.setItem('toolhub_api', url);
    document.getElementById('currentUrl').textContent = url;
    this.checkApiStatus();
    this.toast('✅ API URL saved', 'success');
  }
};

document.addEventListener('DOMContentLoaded', () => APP.init());
