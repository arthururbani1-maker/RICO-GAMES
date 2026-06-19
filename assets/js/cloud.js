/* ============ RICO GAMES ERP — Sincronização na nuvem (Supabase) ============
   Mantém o sistema funcionando offline (localStorage) e, quando configurado,
   espelha todo o estado num banco na nuvem para acesso de qualquer lugar. */
const Cloud = {
  pushTimer: null, syncTimer: null, pushing: false,

  cfg() { try { return JSON.parse(localStorage.getItem('rg_cloud')); } catch (e) { return null; } },
  configured() { const c = this.cfg(); return !!(c && c.url && c.key); },
  setCfg(url, key) { localStorage.setItem('rg_cloud', JSON.stringify({ url: String(url).replace(/\/+$/, ''), key: String(key).trim() })); },
  clear() { localStorage.removeItem('rg_cloud'); this.stop(); this.status('Offline · salvo localmente', null); },
  rev() { return parseInt(localStorage.getItem('rg_rev') || '0', 10); },
  setRev(n) { localStorage.setItem('rg_rev', String(n)); },
  headers() { const c = this.cfg(); return { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }; },

  status(txt, ok) {
    const el = document.getElementById('sync-label'); if (el) el.textContent = txt;
    const dot = document.querySelector('.sync-pill .dot');
    if (dot) dot.style.background = ok === null ? 'var(--txt-3)' : (ok ? 'var(--green)' : 'var(--amber)');
    if (dot) dot.style.boxShadow = ok ? '0 0 8px var(--green)' : 'none';
  },

  async pull() {
    const c = this.cfg();
    const r = await fetch(c.url + '/rest/v1/erp_state?id=eq.main&select=data,rev', { headers: this.headers() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    return rows[0] || null;
  },
  async push(state, rev) {
    const c = this.cfg();
    const r = await fetch(c.url + '/rest/v1/erp_state', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates' }, this.headers()),
      body: JSON.stringify({ id: 'main', data: state, rev: rev, updated_at: new Date().toISOString() })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
  },

  afterLocalSave() {
    if (!this.configured()) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.doPush(), 1200);
  },
  async doPush() {
    if (!this.configured() || this.pushing) return;
    this.pushing = true; this.status('Sincronizando…', true);
    try { const newRev = this.rev() + 1; await this.push(DB.state(), newRev); this.setRev(newRev); this.status('Nuvem · sincronizado', true); }
    catch (e) { console.warn('push falhou', e); this.status('Sem conexão · salvo local', false); }
    this.pushing = false;
  },
  async checkRemote() {
    if (!this.configured() || this.pushing) return;
    try {
      const row = await this.pull();
      if (row && row.rev > this.rev()) {
        DB.importState(row.data); this.setRev(row.rev);
        if (typeof App !== 'undefined' && App.refresh) App.refresh();
        this.status('Nuvem · atualizado agora', true);
      } else this.status('Nuvem · sincronizado', true);
    } catch (e) { this.status('Sem conexão · local', false); }
  },
  async initialSync() {
    if (!this.configured()) { this.status('Offline · salvo localmente', null); return; }
    this.status('Conectando…', true);
    try {
      const row = await this.pull();
      if (row && row.data) { DB.importState(row.data); this.setRev(row.rev || 0); }
      else { const r = this.rev() + 1; await this.push(DB.state(), r); this.setRev(r); }
      this.status('Nuvem · sincronizado', true);
    } catch (e) { this.status('Sem conexão · local', false); }
  },
  start() { if (!this.configured()) return; this.stop(); this.syncTimer = setInterval(() => this.checkRemote(), 5000); },
  stop() { clearInterval(this.syncTimer); this.syncTimer = null; },
  async test() { try { await this.pull(); return true; } catch (e) { return false; } }
};
