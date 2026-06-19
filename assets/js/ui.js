/* ============ RICO GAMES ERP — UI Helpers ============ */
const Fmt = {
  brl: v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num: v => (Number(v) || 0).toLocaleString('pt-BR'),
  pct: v => (Number(v) || 0).toFixed(1).replace('.', ',') + '%',
  date: d => new Date(d).toLocaleDateString('pt-BR'),
  datetime: d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
  time: d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
};

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---- Toast ---- */
const Toast = {
  show(msg, type) {
    const w = document.getElementById('toast-wrap');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.innerHTML = msg;
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(() => t.remove(), 250); }, 2800);
  },
  ok(m) { this.show('✅ ' + m); }, err(m) { this.show('⚠️ ' + m, 'err'); }, warn(m) { this.show('🔔 ' + m, 'warn'); }
};

/* ---- Modal ---- */
const Modal = {
  open({ title, body, foot, wide }) {
    document.getElementById('modal-title').innerHTML = title || '';
    document.getElementById('modal-body').innerHTML = body || '';
    document.getElementById('modal-foot').innerHTML = foot || '';
    document.getElementById('modal').className = 'modal' + (wide ? ' wide' : '');
    document.getElementById('modal-backdrop').classList.remove('hidden');
  },
  close() { document.getElementById('modal-backdrop').classList.add('hidden'); },
  confirm(msg, onYes, yesLabel) {
    this.open({
      title: 'Confirmar', body: '<p style="color:var(--txt-2);line-height:1.6">' + msg + '</p>',
      foot: '<button class="btn-ghost" onclick="Modal.close()">Cancelar</button>' +
        '<button class="btn-danger" id="cf-yes">' + (yesLabel || 'Confirmar') + '</button>'
    });
    document.getElementById('cf-yes').onclick = () => { Modal.close(); onYes(); };
  }
};

/* ---- Form value reader ---- */
function fval(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function fnum(id) { return parseFloat(fval(id).replace(',', '.')) || 0; }
function fchk(id) { const e = document.getElementById(id); return e ? e.checked : false; }

/* ---- Small builders ---- */
function kpi(label, value, sub, ico, cls) {
  return `<div class="card kpi ${cls || ''}">
    <div class="kpi-ico">${ico}</div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}
function condBadge(c) {
  const map = { novo: 'cond-novo', seminovo: 'cond-seminovo', usado: 'cond-usado' };
  return `<span class="cond ${map[c] || ''}">${c}</span>`;
}
function statusBadge(s) {
  const map = {
    disponivel: ['b-green', 'Disponível'], reservado: ['b-blue', 'Reservado'],
    vendido: ['b-gray', 'Vendido'], manutencao: ['b-amber', 'Manutenção'],
    garantia: ['b-purple', 'Garantia'], pago: ['b-green', 'Pago'],
    pendente: ['b-amber', 'Pendente'], ativa: ['b-green', 'Ativa'],
    em_atendimento: ['b-amber', 'Em atendimento'], encerrada: ['b-gray', 'Encerrada'],
    avaliado: ['b-blue', 'Avaliado'], recebido: ['b-green', 'Recebido']
  };
  const m = map[s] || ['b-gray', s];
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
}
function movIcon(t) {
  return { venda: '🛒', compra: '🚚', troca: '🔄', garantia: '🛡️', devolucao: '↩️', ajuste: '⚖️', manutencao: '🔧', usado: '🔍' }[t] || '📌';
}
