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
      case 'tools': this.renderTools(); break;
      case 'magnet': this.renderMagnet(); break;
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
