/* ============ RICO GAMES ERP — Business Intelligence ============ */
const BI = {
  vendas() { return DB.all('vendas').filter(v => !v.cancelada); },
  prods() { return DB.all('produtos'); },
  prodInfo(sku) { return BI.prods().find(p => p.sku === sku); },
  agg(vendasList) {
    const vendas = vendasList || this.vendas();
    const m = {};
    vendas.forEach(v => { const seen = {}; v.itens.forEach(i => {
      const k = i.sku, p = this.prodInfo(k);
      m[k] = m[k] || { sku: k, nome: i.nome, categoria: i.categoria || (p ? p.categoria : '—'), condicao: i.condicao || (p ? p.condicao : 'novo'), qtd: 0, receita: 0, custo: 0, lucro: 0, orders: 0 };
      m[k].qtd += i.qtd; m[k].receita += i.preco * i.qtd; m[k].custo += i.custo * i.qtd; m[k].lucro += (i.preco - i.custo) * i.qtd;
      if (!seen[k]) { m[k].orders++; seen[k] = 1; }
    }); });
    return Object.values(m).map(x => { x.margemV = x.receita ? x.lucro / x.receita * 100 : 0; x.margemC = x.custo ? x.lucro / x.custo * 100 : 0; x.lucroUn = x.qtd ? x.lucro / x.qtd : 0; x.ticket = x.orders ? x.receita / x.orders : x.receita; return x; });
  },
  totals() {
    const a = this.agg();
    const receita = a.reduce((s, x) => s + x.receita, 0), custo = a.reduce((s, x) => s + x.custo, 0);
    const lucro = receita - custo, qtd = a.reduce((s, x) => s + x.qtd, 0), nv = this.vendas().length;
    const taxas = (typeof Taxas !== 'undefined') ? this.vendas().reduce((s, v) => s + Taxas.feeVenda(v), 0) : 0;
    const estUnid = BI.prods().reduce((s, p) => s + p.qtd, 0);
    const lucroLiq = lucro - taxas;
    return {
      receita, custo, lucro, taxas, liquido: receita - taxas, lucroLiq, qtd, nv,
      ticket: nv ? receita / nv : 0,
      margemV: receita ? lucro / receita * 100 : 0, margemC: custo ? lucro / custo * 100 : 0,
      margemLiqV: receita ? lucroLiq / receita * 100 : 0, margemLiqC: custo ? lucroLiq / custo * 100 : 0,
      pctTaxas: receita ? taxas / receita * 100 : 0,
      giro: estUnid ? qtd / estUnid : qtd, estUnid, estValor: BI.prods().reduce((s, p) => s + (p.custoMedio || p.custo) * p.qtd, 0)
    };
  },
  lastSale() { const m = {}; this.vendas().forEach(v => v.itens.forEach(i => { const d = new Date(v.data); if (!m[i.sku] || d > m[i.sku]) m[i.sku] = d; })); return m; },
  crossSell(vendasList) {
    const ordersWith = {}, pairWith = {};
    (vendasList || this.vendas()).forEach(v => {
      const skus = [...new Set(v.itens.map(i => i.sku))];
      skus.forEach(a => { ordersWith[a] = (ordersWith[a] || 0) + 1; pairWith[a] = pairWith[a] || {}; skus.forEach(b => { if (a !== b) pairWith[a][b] = (pairWith[a][b] || 0) + 1; }); });
    });
    return Object.keys(pairWith).filter(a => Object.keys(pairWith[a]).length).map(a => ({
      sku: a, nome: (this.prodInfo(a) || {}).nome || a, orders: ordersWith[a],
      comps: Object.entries(pairWith[a]).map(([b, c]) => ({ sku: b, nome: (this.prodInfo(b) || {}).nome || b, count: c, per10: Math.round(c / ordersWith[a] * 10) })).sort((x, y) => y.count - x.count)
    })).sort((x, y) => y.orders - x.orders);
  },
  recomenda() {
    const a = this.agg(), ls = this.lastSale(), now = Date.now();
    const buy = [], stop = [];
    BI.prods().forEach(p => {
      const ag = a.find(x => x.sku === p.sku) || { qtd: 0, margemV: 0, lucro: 0 };
      const last = ls[p.sku], dias = last ? Math.round((now - last) / 86400000) : 999;
      const giro = p.qtd ? ag.qtd / p.qtd : ag.qtd;
      if (ag.qtd >= 2 && ag.margemV >= 18 && p.qtd <= p.min * 2) buy.push({ nome: p.nome, motivo: 'Gira rápido · margem ' + Fmt.pct(ag.margemV) + ' · estoque ' + p.qtd, score: giro * ag.margemV });
      if (p.qtd > 0 && (dias >= 60 || (ag.margemV < 12 && p.qtd > p.min))) stop.push({ nome: p.nome, motivo: dias >= 999 ? 'Nunca vendeu · ' + p.qtd + ' em estoque' : (dias >= 60 ? dias + ' dias sem vender' : 'Margem baixa ' + Fmt.pct(ag.margemV)), estoque: p.qtd });
    });
    return { buy: buy.sort((x, y) => y.score - x.score).slice(0, 6), stop: stop.slice(0, 6) };
  },
  range(periodo, de, ate) {
    const now = new Date(), s0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }, e0 = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    if (periodo === 'hoje') return { start: s0(now), end: e0(now) };
    if (periodo === 'ontem') { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: s0(y), end: e0(y) }; }
    if (periodo === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: s0(s), end: e0(now) }; }
    if (periodo === '30d') { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: s0(s), end: e0(now) }; }
    if (periodo === 'mes') return { start: s0(new Date(now.getFullYear(), now.getMonth(), 1)), end: e0(now) };
    if (periodo === 'ano') return { start: s0(new Date(now.getFullYear(), 0, 1)), end: e0(now) };
    if (periodo === 'custom') return { start: de ? s0(new Date(de + 'T12:00:00')) : new Date(0), end: ate ? e0(new Date(ate + 'T12:00:00')) : e0(now) };
    return { start: new Date(0), end: e0(now) };
  },
  vendasPeriodo(periodo, de, ate) { const r = this.range(periodo, de, ate); return this.vendas().filter(v => { const d = new Date(v.data); return d >= r.start && d <= r.end; }); },
  crossFor(skus, vendasList) {
    const vendas = vendasList || this.vendas(), res = {};
    skus.forEach(anchor => {
      const ow = vendas.filter(v => v.itens.some(i => i.sku === anchor)), comp = {};
      ow.forEach(v => { [...new Set(v.itens.map(i => i.sku))].forEach(s => { if (s !== anchor) comp[s] = (comp[s] || 0) + 1; }); });
      res[anchor] = { sku: anchor, nome: (this.prodInfo(anchor) || {}).nome || anchor, orders: ow.length, comps: Object.entries(comp).map(([s, c]) => ({ sku: s, nome: (this.prodInfo(s) || {}).nome || s, count: c, pct: ow.length ? c / ow.length * 100 : 0 })).sort((a, b) => b.count - a.count) };
    });
    return res;
  }
};
function periodOptsHtml(sel) { return [['all', 'Todo o período'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['mes', 'Mês atual'], ['ano', 'Ano atual'], ['custom', 'Personalizado']].map(o => `<option value="${o[0]}" ${sel === o[0] ? 'selected' : ''}>${o[1]}</option>`).join(''); }

Modules.biState = { tab: 'geral', trend: 'dia', sel: [] };
Modules.relatorios = function () {
  const tabs = [['geral', '📊 Visão geral'], ['cross', '🔗 Vendas cruzadas'], ['rankings', '🏆 Rankings'], ['pesquisa', '🔍 Pesquisa & comparação'], ['categorias', '🗂️ Categorias'], ['tendencias', '📈 Tendências'], ['rentab', '💎 Rentabilidade'], ['estoque', '📦 Estoque']];
  setTimeout(() => Modules.biRender(), 20);
  return `
  <div class="page-head"><div><h1>Business Intelligence</h1><p>Inteligência de vendas, margem e rentabilidade da Rico Games</p></div>
    <div class="actions"><button class="btn-ghost" onclick="Modules.biExport('xlsx')">⬇️ Excel</button><button class="btn-ghost" onclick="Modules.biExport('pdf')">🖨️ PDF</button></div></div>
  <div class="tabs" id="bi-subnav">${tabs.map(t => `<div class="tab ${this.biState.tab === t[0] ? 'active' : ''}" onclick="Modules.biSetTab('${t[0]}')">${t[1]}</div>`).join('')}</div>
  <div id="bi-body"></div>`;
};
Modules.biInit = function () { this.biRender(); };
Modules.biSetTab = function (t) {
  this.biState.tab = t;
  const keys = ['geral', 'cross', 'rankings', 'pesquisa', 'categorias', 'tendencias', 'rentab', 'estoque'];
  document.querySelectorAll('#bi-subnav .tab').forEach((el, i) => el.classList.toggle('active', keys[i] === t));
  this.biRender();
};
Modules.biRender = function () {
  const b = document.getElementById('bi-body'); if (!b) return;
  const t = this.biState.tab;
  b.innerHTML = ({ geral: this.biGeral, cross: this.biCross, rankings: this.biRankings, pesquisa: this.biPesquisa, categorias: this.biCategorias, tendencias: this.biTendencias, rentab: this.biRentab, estoque: this.biEstoque })[t].call(this);
  if (t === 'pesquisa') this.biCompara();
};

/* ---- helpers de UI ---- */
function biRankRows(items, valFn, subFn, rightFn) {
  const max = Math.max(1, ...items.map(valFn));
  return `<div class="bi-rank">${items.map((x, i) => `
    <div class="bi-row"><div class="bi-pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div class="bi-main"><div class="bi-name">${esc(x.nome)}</div><div class="bi-sub">${subFn(x)}</div>
        <div class="bi-bartrack"><div class="bi-barfill" style="width:${valFn(x) / max * 100}%"></div></div></div>
      <div class="strong" style="white-space:nowrap">${rightFn(x)}</div></div>`).join('')}</div>`;
}

/* ---- VISÃO GERAL ---- */
Modules.biGeral = function () {
  const T = BI.totals(), a = BI.agg();
  const topLucro = a.slice().sort((x, y) => y.lucro - x.lucro).slice(0, 5);
  const topFat = a.slice().sort((x, y) => y.receita - x.receita).slice(0, 5);
  const rec = BI.recomenda();
  return `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Faturamento bruto', Fmt.brl(T.receita), null, '💵', '')}
    ${kpi('Faturamento líquido', Fmt.brl(T.liquido), 'após taxas', '🏦', 'blue')}
    ${kpi('Lucro bruto', Fmt.brl(T.lucro), 'Custo ' + Fmt.brl(T.custo), '📈', '')}
    ${kpi('Lucro líquido', Fmt.brl(T.lucroLiq), 'após taxas', '💎', 'purple')}
  </div>
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Total em taxas', Fmt.brl(T.taxas), Fmt.pct(T.pctTaxas) + ' do faturamento', '💳', 'red')}
    <div class="card kpi"><div class="kpi-ico">📐</div><div class="kpi-label">Margem sobre venda</div><div class="kpi-value">${Fmt.pct(T.margemV)}</div><div class="kpi-sub">líquida: ${Fmt.pct(T.margemLiqV)}</div></div>
    <div class="card kpi blue"><div class="kpi-ico">📐</div><div class="kpi-label">Margem sobre custo</div><div class="kpi-value">${Fmt.pct(T.margemC)}</div><div class="kpi-sub">líquida: ${Fmt.pct(T.margemLiqC)}</div></div>
    ${kpi('Ticket médio', Fmt.brl(T.ticket), null, '🎟️', '')}
  </div>
  <div class="grid kpis" style="margin-bottom:20px">
    ${kpi('Produtos vendidos', Fmt.num(T.qtd), 'unidades', '📦', 'blue')}
    ${kpi('Vendas realizadas', Fmt.num(T.nv), null, '🧾', 'amber')}
    ${kpi('Giro de estoque', T.giro.toFixed(2) + 'x', T.estUnid + ' un · ' + Fmt.brl(T.estValor), '🔄', '')}
    ${kpi('Custo dos produtos', Fmt.brl(T.custo), null, '🏷️', '')}
  </div>
  <div class="grid cols-2" style="margin-bottom:16px">
    <div class="card"><div class="section-title">💎 Top 5 em lucro</div>${biRankRows(topLucro, x => x.lucro, x => x.qtd + ' un · ' + Fmt.pct(x.margemV) + ' margem', x => Fmt.brl(x.lucro))}</div>
    <div class="card"><div class="section-title">💵 Top 5 em faturamento</div>${biRankRows(topFat, x => x.receita, x => x.qtd + ' un · ' + Fmt.pct(x.receita / T.receita * 100) + ' do total', x => Fmt.brl(x.receita))}</div>
  </div>
  <div class="grid cols-2">
    <div class="card"><div class="section-title">🟢 Comprar mais</div>
      ${rec.buy.length ? rec.buy.map(x => `<div class="bi-row"><div class="bi-main"><div class="bi-name">${esc(x.nome)}</div><div class="bi-sub">${esc(x.motivo)}</div></div><span class="rec-tag rec-buy">Comprar</span></div>`).join('') : '<p class="muted">Sem recomendações de compra no momento.</p>'}
    </div>
    <div class="card"><div class="section-title">🔴 Reduzir / parar de comprar</div>
      ${rec.stop.length ? rec.stop.map(x => `<div class="bi-row"><div class="bi-main"><div class="bi-name">${esc(x.nome)}</div><div class="bi-sub">${esc(x.motivo)}</div></div><span class="rec-tag rec-stop">Parar</span></div>`).join('') : '<p class="muted">Nenhum produto problemático. 🎉</p>'}
    </div>
  </div>`;
};

/* ---- VENDAS CRUZADAS ---- */
Modules.biCross = function () {
  const items = BI.prods().map(p => ({ sku: p.sku, nome: p.nome }));
  MSelect.setup('cross', items, () => Modules.biCrossRender());
  setTimeout(() => { MSelect.mount('cross'); Modules.biCrossRender(); }, 20);
  return `
  <div class="card" style="margin-bottom:16px"><div class="section-title">Análise de produtos relacionados</div>
    <p class="muted" style="line-height:1.6;margin-bottom:14px">Selecione um ou mais produtos para descobrir o que vende junto, com frequência e percentual de ocorrência. Sem seleção, mostramos os principais padrões automáticos.</p>
    <div class="toolbar" style="margin-bottom:4px">
      <select id="cross-per" onchange="Modules.biCrossRender()">${periodOptsHtml('all')}</select>
      <span id="cross-custom" style="display:none;gap:8px;align-items:center"><input type="date" id="cross-de" onchange="Modules.biCrossRender()"><span class="muted">até</span><input type="date" id="cross-ate" onchange="Modules.biCrossRender()"></span>
    </div>
    ${MSelect.html('cross', 'Buscar e selecionar produtos (ex: PS5, Switch...)')}
  </div>
  <div id="cross-res"></div>`;
};
Modules.biCrossRender = function () {
  const host = document.getElementById('cross-res'); if (!host) return;
  const per = fval('cross-per') || 'all';
  const cc = document.getElementById('cross-custom'); if (cc) cc.style.display = per === 'custom' ? 'inline-flex' : 'none';
  const vendas = per === 'all' ? BI.vendas() : BI.vendasPeriodo(per, fval('cross-de'), fval('cross-ate'));
  const sel = MSelect.selected('cross');
  if (!sel.length) {
    const anchors = BI.crossSell(vendas).slice(0, 6);
    host.innerHTML = anchors.length ? `<p class="muted" style="margin-bottom:12px">Padrões automáticos (selecione produtos acima para análise detalhada):</p>` + anchors.map(an => biCrossCard({ nome: an.nome, orders: an.orders, comps: an.comps.map(c => ({ nome: c.nome, count: c.count, pct: an.orders ? c.count / an.orders * 100 : 0 })) }, true)).join('') : '<div class="empty-state"><div class="big">🔗</div>Ainda não há vendas com vários itens neste período para detectar padrões.</div>';
    return;
  }
  const cf = BI.crossFor(sel, vendas);
  let html = '';
  if (sel.length >= 2) html += biComparador(sel, vendas);
  sel.forEach(sku => html += biCrossCard(cf[sku], false));
  if (sel.length >= 2) html += biIntersection(sel, cf);
  host.innerHTML = html;
};
function biCrossCard(an, isAuto) {
  if (!an) return '';
  const comps = (an.comps || []).slice(0, 7);
  return `<div class="cross-card">
    <div class="cross-anchor"><span class="ca-ico">🎮</span><div><div>${esc(an.nome)}</div><div class="muted" style="font-size:11.5px;font-weight:500">${an.orders} venda(s) com este produto${isAuto ? ' · padrão automático' : ''}</div></div></div>
    ${comps.length ? comps.map(c => `<div class="cross-comp"><span class="cc-per">${Math.round(c.pct)}%</span><div class="bi-main"><div class="bi-name">${esc(c.nome)}</div><div class="bi-bartrack" style="margin-top:5px"><div class="bi-barfill" style="width:${Math.min(100, c.pct)}%"></div></div></div><span class="badge b-gray">${c.count}x juntos</span></div>`).join('') : '<p class="muted">Nenhum produto vendido junto neste período.</p>'}
  </div>`;
}
function biComparador(skus, vendas) {
  const agg = BI.agg(vendas), cf = BI.crossFor(skus, vendas);
  const rows = skus.map(sku => {
    const a = agg.find(x => x.sku === sku) || { nome: (BI.prodInfo(sku) || {}).nome || sku, qtd: 0, receita: 0, lucro: 0, margemV: 0, ticket: 0 };
    const top = (cf[sku].comps || [])[0];
    return { a, top };
  });
  return `<div class="card" style="margin-bottom:16px"><div class="section-title">⚔️ Comparação inteligente</div>
    <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Ticket médio</th><th>Relacionado nº1</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td class="strong">${esc(r.a.nome)}</td><td class="num">${r.a.qtd}</td><td class="num">${Fmt.brl(r.a.receita)}</td><td class="num" style="color:var(--green)">${Fmt.brl(r.a.lucro)}</td><td class="num">${Fmt.pct(r.a.margemV)}</td><td class="num">${Fmt.brl(r.a.ticket)}</td><td>${r.top ? esc(r.top.nome) + ' <span class="muted">(' + Math.round(r.top.pct) + '%)</span>' : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function biIntersection(skus, cf) {
  const sets = skus.map(s => new Set((cf[s].comps || []).map(c => c.sku).filter(x => !skus.includes(x))));
  const inter = [...(sets[0] || [])].filter(x => sets.every(st => st.has(x)));
  const interRows = inter.map(sku => ({ nome: (BI.prodInfo(sku) || {}).nome || sku, count: skus.reduce((s, a) => { const c = (cf[a].comps || []).find(c => c.sku === sku); return s + (c ? c.count : 0); }, 0) })).sort((a, b) => b.count - a.count);
  const excl = skus.map(s => {
    const others = skus.filter(o => o !== s);
    const ex = (cf[s].comps || []).filter(c => !skus.includes(c.sku) && !others.some(o => (cf[o].comps || []).some(cc => cc.sku === c.sku)));
    return { nome: cf[s].nome, comps: ex.slice(0, 5) };
  });
  return `<div class="grid cols-2">
    <div class="card"><div class="section-title">🤝 Vendidos junto com TODOS os selecionados</div>
      ${interRows.length ? interRows.map(r => `<div class="bi-row"><div class="bi-main"><div class="bi-name">${esc(r.nome)}</div></div><span class="badge b-green">${r.count}x</span></div>`).join('') : '<p class="muted">Nenhum produto em comum entre os selecionados.</p>'}</div>
    <div class="card"><div class="section-title">⭐ Exclusivos de cada produto</div>
      ${excl.map(e => `<div style="margin-bottom:12px"><div class="strong" style="font-size:13px;margin-bottom:5px">${esc(e.nome)}</div>${e.comps.length ? e.comps.map(c => `<div class="bi-sub" style="padding:2px 0">• ${esc(c.nome)} <span class="muted">(${c.count}x)</span></div>`).join('') : '<div class="muted" style="font-size:12px">— nenhum companheiro exclusivo</div>'}</div>`).join('')}</div>
  </div>`;
}

/* ---- RANKINGS ---- */
Modules.biRankings = function () {
  const a = BI.agg(), T = BI.totals(), ls = BI.lastSale(), now = Date.now();
  const lucr = a.slice().sort((x, y) => y.lucro - x.lucro).slice(0, 10);
  const marg = a.slice().filter(x => x.receita > 0).sort((x, y) => y.margemV - x.margemV).slice(0, 10);
  const fat = a.slice().sort((x, y) => y.receita - x.receita).slice(0, 10);
  const fraco = BI.prods().map(p => {
    const ag = a.find(x => x.sku === p.sku) || { qtd: 0, margemV: 0, lucro: 0 };
    const last = ls[p.sku], dias = last ? Math.round((now - last) / 86400000) : null;
    return { nome: p.nome, qtd: ag.qtd, margemV: ag.margemV, estoque: p.qtd, dias, giro: p.qtd ? ag.qtd / p.qtd : ag.qtd };
  }).filter(x => x.estoque > 0).sort((x, y) => (x.giro - y.giro) || ((x.dias || 999) > (y.dias || 999) ? -1 : 1)).slice(0, 10);
  return `
  <div class="grid cols-2b" style="margin-bottom:16px">
    <div class="card"><div class="section-title">💎 Produtos mais lucrativos</div>
      <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Faturam.</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead>
      <tbody>${lucr.map(x => `<tr><td>${esc(x.nome)}</td><td class="num">${x.qtd}</td><td class="num">${Fmt.brl(x.receita)}</td><td class="num strong" style="color:var(--green)">${Fmt.brl(x.lucro)}</td><td class="num"><span class="badge b-green">${Fmt.pct(x.margemV)}</span></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="section-title">📐 Maior margem (%)</div>${biRankRows(marg, x => x.margemV, x => x.qtd + ' un · ' + Fmt.brl(x.lucro) + ' lucro', x => `<span class="badge b-green">${Fmt.pct(x.margemV)}</span>`)}</div>
  </div>
  <div class="grid cols-2b">
    <div class="card"><div class="section-title">💵 Maior faturamento</div>
      <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">% do total</th></tr></thead>
      <tbody>${fat.map(x => `<tr><td>${esc(x.nome)}</td><td class="num">${x.qtd}</td><td class="num strong">${Fmt.brl(x.receita)}</td><td class="num"><span class="badge b-blue">${Fmt.pct(x.receita / T.receita * 100)}</span></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="section-title">⚠️ Menor desempenho</div>
      <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Vend.</th><th class="num">Giro</th><th class="num">Estoque</th><th class="num">Sem venda</th></tr></thead>
      <tbody>${fraco.map(x => `<tr><td>${esc(x.nome)}</td><td class="num">${x.qtd}</td><td class="num">${x.giro.toFixed(1)}x</td><td class="num">${x.estoque}</td><td class="num">${x.dias == null ? '<span class="badge b-red">nunca</span>' : x.dias + 'd'}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
};

/* ---- PESQUISA & COMPARAÇÃO ---- */
Modules.biPesquisa = function () {
  const prods = BI.prods().slice().sort((a, b) => a.nome.localeCompare(b.nome));
  return `
  <div class="grid cols-2" style="margin-bottom:16px">
    <div class="card"><div class="section-title">Selecione os produtos para comparar</div>
      <input id="bi-pq" placeholder="Filtrar lista..." oninput="Modules.biPickFilter()" style="width:100%;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);padding:9px 12px;border-radius:9px;margin-bottom:10px">
      <div class="picker" id="bi-picker">${prods.map(p => `<label data-nome="${esc(p.nome.toLowerCase())}"><input type="checkbox" value="${p.sku}" ${Modules.biState.sel.includes(p.sku) ? 'checked' : ''} onchange="Modules.biToggle('${p.sku}')"> ${esc(p.nome)} <span class="muted" style="margin-left:auto;font-size:11px">${p.sku}</span></label>`).join('')}</div>
    </div>
    <div class="card"><div class="section-title">Resumo da seleção</div><div id="bi-cmp-sum"></div></div>
  </div>
  <div id="bi-cmp-table"></div>`;
};
Modules.biPickFilter = function () { const q = (fval('bi-pq') || '').toLowerCase(); document.querySelectorAll('#bi-picker label').forEach(l => l.style.display = l.dataset.nome.includes(q) ? 'flex' : 'none'); };
Modules.biToggle = function (sku) { const s = this.biState.sel; const i = s.indexOf(sku); if (i >= 0) s.splice(i, 1); else s.push(sku); this.biCompara(); };
Modules.biCompara = function () {
  const sel = this.biState.sel, a = BI.agg();
  const rows = sel.map(sku => a.find(x => x.sku === sku) || { sku, nome: (BI.prodInfo(sku) || {}).nome || sku, qtd: 0, receita: 0, custo: 0, lucro: 0, margemV: 0, margemC: 0 });
  const sumEl = document.getElementById('bi-cmp-sum'), tblEl = document.getElementById('bi-cmp-table');
  if (!sumEl) return;
  if (!rows.length) { sumEl.innerHTML = '<p class="muted">Marque produtos na lista ao lado para ver as métricas e comparar.</p>'; tblEl.innerHTML = ''; return; }
  const tot = rows.reduce((s, x) => ({ qtd: s.qtd + x.qtd, receita: s.receita + x.receita, custo: s.custo + x.custo, lucro: s.lucro + x.lucro }), { qtd: 0, receita: 0, custo: 0, lucro: 0 });
  sumEl.innerHTML = `<div class="mini-stat"><span>Produtos selecionados</span><b>${rows.length}</b></div>
    <div class="mini-stat"><span>Qtd vendida</span><b>${tot.qtd}</b></div>
    <div class="mini-stat"><span>Receita</span><b>${Fmt.brl(tot.receita)}</b></div>
    <div class="mini-stat"><span>Lucro</span><b style="color:var(--green)">${Fmt.brl(tot.lucro)}</b></div>
    <div class="mini-stat"><span>Margem s/ venda</span><b>${Fmt.pct(tot.receita ? tot.lucro / tot.receita * 100 : 0)}</b></div>
    <div class="mini-stat"><span>Margem s/ custo</span><b>${Fmt.pct(tot.custo ? tot.lucro / tot.custo * 100 : 0)}</b></div>`;
  tblEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">Custo</th><th class="num">Lucro</th><th class="num">Marg. venda</th><th class="num">Marg. custo</th><th class="num">Ticket médio</th></tr></thead>
    <tbody>${rows.map(x => `<tr><td class="strong">${esc(x.nome)}</td><td class="num">${x.qtd}</td><td class="num">${Fmt.brl(x.receita)}</td><td class="num muted">${Fmt.brl(x.custo)}</td><td class="num" style="color:var(--green)">${Fmt.brl(x.lucro)}</td><td class="num">${Fmt.pct(x.margemV)}</td><td class="num">${Fmt.pct(x.margemC)}</td><td class="num">${Fmt.brl(x.qtd ? x.receita / x.qtd : 0)}</td></tr>`).join('')}</tbody></table></div>`;
};

/* ---- CATEGORIAS ---- */
Modules.biCategorias = function () {
  const a = BI.agg();
  const grp = (keyFn) => { const m = {}; a.forEach(x => { const k = keyFn(x); m[k] = m[k] || { nome: k, qtd: 0, receita: 0, custo: 0, lucro: 0 }; m[k].qtd += x.qtd; m[k].receita += x.receita; m[k].custo += x.custo; m[k].lucro += x.lucro; }); return Object.values(m).sort((x, y) => y.receita - x.receita); };
  const cats = grp(x => x.categoria), conds = grp(x => x.condicao);
  const maxR = Math.max(1, ...cats.map(c => c.receita));
  const tbl = (arr) => `<div class="table-wrap" style="border:none"><table><thead><tr><th>Categoria</th><th class="num">Qtd</th><th class="num">Faturam.</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead>
    <tbody>${arr.map(c => `<tr><td class="strong">${esc(c.nome)}</td><td class="num">${c.qtd}</td><td class="num">${Fmt.brl(c.receita)}</td><td class="num" style="color:var(--green)">${Fmt.brl(c.lucro)}</td><td class="num"><span class="badge b-green">${Fmt.pct(c.receita ? c.lucro / c.receita * 100 : 0)}</span></td></tr>`).join('')}</tbody></table></div>`;
  return `
  <div class="card" style="margin-bottom:16px"><div class="section-title">Faturamento por categoria</div>
    ${cats.map(c => `<div style="margin-bottom:13px"><div style="display:flex;justify-content:space-between;font-size:13px"><span class="strong">${esc(c.nome)}</span><span>${Fmt.brl(c.receita)} · ${c.qtd} un · ${Fmt.pct(c.receita ? c.lucro / c.receita * 100 : 0)} margem</span></div><div class="bi-bartrack" style="height:8px;margin-top:6px"><div class="bi-barfill" style="width:${c.receita / maxR * 100}%"></div></div></div>`).join('')}
  </div>
  <div class="grid cols-2b">
    <div class="card"><div class="section-title">Por categoria</div>${tbl(cats)}</div>
    <div class="card"><div class="section-title">Por condição (novo / seminovo / usado)</div>${tbl(conds)}</div>
  </div>`;
};

/* ---- TENDÊNCIAS ---- */
Modules.biTendencias = function () {
  const p = this.biState.trend;
  return `<div class="card"><div class="section-title" style="align-items:center">Tendência de vendas
    <div class="period-tabs">${[['dia', 'Diária'], ['semana', 'Semanal'], ['mes', 'Mensal'], ['ano', 'Anual']].map(o => `<button class="${p === o[0] ? 'active' : ''}" onclick="Modules.biSetTrend('${o[0]}')">${o[1]}</button>`).join('')}</div>
  </div>${this.biTrendChart(p)}</div>`;
};
Modules.biSetTrend = function (t) { this.biState.trend = t; this.biRender(); };
Modules.biTrendChart = function (modo) {
  const vendas = BI.vendas(); const now = new Date();
  let buckets = [];
  const add = (label, ini, fim) => { const tot = vendas.filter(v => { const d = new Date(v.data); return d >= ini && d < fim; }).reduce((s, v) => s + v.total, 0); buckets.push({ label, tot }); };
  if (modo === 'dia') { for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); const f = new Date(d); f.setDate(f.getDate() + 1); add(d.getDate() + '/' + (d.getMonth() + 1), d, f); } }
  else if (modo === 'semana') { for (let i = 7; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7 - now.getDay()); d.setHours(0, 0, 0, 0); const f = new Date(d); f.setDate(f.getDate() + 7); add('S' + (8 - i), d, f); } }
  else if (modo === 'mes') { const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const f = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); add(meses[d.getMonth()] + '/' + String(d.getFullYear()).slice(2), d, f); } }
  else { for (let i = 4; i >= 0; i--) { const y = now.getFullYear() - i; add('' + y, new Date(y, 0, 1), new Date(y + 1, 0, 1)); } }
  const max = Math.max(1, ...buckets.map(b => b.tot));
  return `<div class="trend-bars">${buckets.map(b => `<div class="tb-col"><div style="flex:1;display:flex;align-items:flex-end;width:100%"><div class="tb-bar" title="${Fmt.brl(b.tot)}" style="height:${Math.max(2, b.tot / max * 100)}%"></div></div><div class="tb-lbl">${b.label}</div></div>`).join('')}</div>
  <p class="muted" style="margin-top:12px;font-size:12px">Total no período exibido: <b style="color:var(--green)">${Fmt.brl(buckets.reduce((s, b) => s + b.tot, 0))}</b></p>`;
};

/* ---- RENTABILIDADE ---- */
Modules.biRentab = function () {
  const a = BI.agg();
  const porUnid = a.slice().filter(x => x.qtd > 0).sort((x, y) => y.lucroUn - x.lucroUn).slice(0, 10);
  const acum = a.slice().sort((x, y) => y.lucro - x.lucro).slice(0, 10);
  const roi = BI.prods().map(p => {
    const ag = a.find(x => x.sku === p.sku) || { lucro: 0, custo: 0 };
    const invest = (p.custoMedio || p.custo) * p.qtd;
    return { nome: p.nome, lucro: ag.lucro, invest, roi: invest ? ag.lucro / invest * 100 : (ag.lucro > 0 ? 999 : 0), roiCusto: ag.custo ? ag.lucro / ag.custo * 100 : 0 };
  }).filter(x => x.invest > 0).sort((x, y) => y.roi - x.roi).slice(0, 10);
  return `
  <div class="card" style="margin-bottom:16px"><div class="section-title">💡 O mais vendido nem sempre é o mais lucrativo</div>
    <p class="muted">Compare o lucro acumulado (volume) com o lucro por unidade (eficiência). Produtos de baixo volume e alta margem podem render mais que campeões de venda.</p></div>
  <div class="grid cols-2b" style="margin-bottom:16px">
    <div class="card"><div class="section-title">Lucro acumulado</div>${biRankRows(acum, x => x.lucro, x => x.qtd + ' un vendidas', x => Fmt.brl(x.lucro))}</div>
    <div class="card"><div class="section-title">Lucro por unidade</div>${biRankRows(porUnid, x => x.lucroUn, x => x.qtd + ' un · margem ' + Fmt.pct(x.margemV), x => Fmt.brl(x.lucroUn))}</div>
  </div>
  <div class="card"><div class="section-title">ROI sobre estoque (retorno do capital investido)</div>
    <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Lucro gerado</th><th class="num">Capital em estoque</th><th class="num">ROI</th></tr></thead>
    <tbody>${roi.map(x => `<tr><td>${esc(x.nome)}</td><td class="num" style="color:var(--green)">${Fmt.brl(x.lucro)}</td><td class="num muted">${Fmt.brl(x.invest)}</td><td class="num"><span class="badge ${x.roi >= 100 ? 'b-green' : 'b-amber'}">${x.roi >= 999 ? '∞' : Fmt.pct(x.roi)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
};

/* ---- ESTOQUE ---- */
Modules.biEstoque = function () {
  const a = BI.agg(), ls = BI.lastSale(), now = Date.now();
  const maisVend = a.slice().sort((x, y) => y.qtd - x.qtd).slice(0, 8);
  const maisLucr = a.slice().sort((x, y) => y.lucro - x.lucro).slice(0, 8);
  const parados = (typeof Calc !== 'undefined' ? Calc.produtosParados(60) : []);
  const semGiro = BI.prods().filter(p => p.qtd > 0 && !ls[p.sku]);
  const tempoMedio = (() => { const ps = BI.prods().filter(p => p.qtd > 0); return ps.length ? ps.reduce((s, p) => s + (now - new Date(p.criadoEm).getTime()) / 86400000, 0) / ps.length : 0; })();
  return `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Itens em estoque', Fmt.num(BI.prods().reduce((s, p) => s + p.qtd, 0)), BI.prods().length + ' SKUs', '📦', '')}
    ${kpi('Capital em estoque', Fmt.brl(BI.prods().reduce((s, p) => s + (p.custoMedio || p.custo) * p.qtd, 0)), null, '💰', 'blue')}
    ${kpi('Produtos parados (60d+)', Fmt.num(parados.length), null, '🐌', 'red')}
    ${kpi('Tempo médio em estoque', Math.round(tempoMedio) + ' dias', null, '⏳', 'amber')}
  </div>
  <div class="grid cols-2b" style="margin-bottom:16px">
    <div class="card"><div class="section-title">🏆 Mais vendidos</div>${biRankRows(maisVend, x => x.qtd, x => Fmt.brl(x.receita) + ' em receita', x => x.qtd + ' un')}</div>
    <div class="card"><div class="section-title">💎 Mais lucrativos</div>${biRankRows(maisLucr, x => x.lucro, x => x.qtd + ' un', x => Fmt.brl(x.lucro))}</div>
  </div>
  <div class="grid cols-2b">
    <div class="card"><div class="section-title">🐌 Estoque parado (60+ dias)</div>
      ${parados.length ? `<div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th>Cond.</th><th class="num">Qtd</th><th class="num">Capital</th></tr></thead><tbody>${parados.map(p => `<tr><td>${esc(p.nome)}</td><td>${condBadge(p.condicao)}</td><td class="num">${p.qtd}</td><td class="num">${Fmt.brl((p.custoMedio || p.custo) * p.qtd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum produto parado. 🎉</p>'}
    </div>
    <div class="card"><div class="section-title">❄️ Sem giro (nunca vendidos)</div>
      ${semGiro.length ? semGiro.slice(0, 10).map(p => `<div class="bi-row"><div class="bi-main"><div class="bi-name">${esc(p.nome)}</div><div class="bi-sub">${p.sku} · ${Math.round((now - new Date(p.criadoEm).getTime()) / 86400000)} dias em estoque</div></div><span class="muted">${p.qtd} un</span></div>`).join('') : '<p class="muted">Todos os produtos já venderam.</p>'}
    </div>
  </div>`;
};

/* ---- EXPORT ---- */
Modules.biExport = function (fmt) {
  const T = BI.totals(), a = BI.agg().slice().sort((x, y) => y.lucro - x.lucro), r2 = x => Math.round(x * 100) / 100;
  if (fmt === 'xlsx') {
    const aoa = [
      ['Rico Games — Relatório de Business Intelligence'], ['Gerado em', Fmt.date(new Date())], [],
      ['INDICADORES'], ['Faturamento bruto', r2(T.receita)], ['Taxas de pagamento', r2(T.taxas)], ['Faturamento líquido', r2(T.liquido)], ['Custo dos produtos', r2(T.custo)], ['Lucro bruto', r2(T.lucro)], ['Lucro líquido', r2(T.lucroLiq)],
      ['Margem bruta s/ venda (%)', r2(T.margemV)], ['Margem líquida s/ venda (%)', r2(T.margemLiqV)], ['Margem bruta s/ custo (%)', r2(T.margemC)], ['Margem líquida s/ custo (%)', r2(T.margemLiqC)], ['% taxas sobre faturamento', r2(T.pctTaxas)], ['Ticket médio', r2(T.ticket)], ['Produtos vendidos', T.qtd], ['Vendas', T.nv], ['Giro de estoque', r2(T.giro)], [],
      ['PRODUTOS', 'Categoria', 'Condição', 'Qtd', 'Receita', 'Custo', 'Lucro', 'Margem venda %', 'Margem custo %']
    ];
    a.forEach(x => aoa.push([x.nome, x.categoria, x.condicao, x.qtd, r2(x.receita), r2(x.custo), r2(x.lucro), r2(x.margemV), r2(x.margemC)]));
    Exporter.xlsx('bi-rico-games-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'BI', aoa);
  } else {
    const kp = (l, v) => `<div class="k"><div class="l">${l}</div><div class="v">${v}</div></div>`;
    const kpis = `<div class="kpis">${kp('Faturamento', Fmt.brl(T.receita))}${kp('Lucro bruto', Fmt.brl(T.lucro))}${kp('Lucro líquido', Fmt.brl(T.lucroLiq))}${kp('Margem venda', Fmt.pct(T.margemV))}${kp('Margem custo', Fmt.pct(T.margemC))}${kp('Ticket médio', Fmt.brl(T.ticket))}${kp('Giro', T.giro.toFixed(2) + 'x')}</div>`;
    const rows = a.slice(0, 30).map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.categoria)}</td><td class="num">${x.qtd}</td><td class="num">${Fmt.brl(x.receita)}</td><td class="num">${Fmt.brl(x.lucro)}</td><td class="num">${Fmt.pct(x.margemV)}</td></tr>`).join('');
    Exporter.pdf('Business Intelligence', kpis + `<table><thead><tr><th>Produto</th><th>Categoria</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
};
