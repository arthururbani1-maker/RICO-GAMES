/* ============ RICO GAMES ERP — Caixa da Loja (dinheiro físico) ============ */
const Caixa = {
  add(o) {
    return DB.insert('caixa', {
      data: o.data || new Date().toISOString(), fluxo: o.fluxo, tipo: o.tipo,
      origem: o.origem || o.tipo, categoria: o.categoria || '', valor: Math.abs(o.valor) || 0,
      obs: o.obs || '', comprovante: o.comprovante || '', responsavel: 'Admin', refId: o.refId || null
    });
  },
  saldo() { return DB.all('caixa').reduce((s, m) => s + (m.fluxo === 'entrada' ? m.valor : -m.valor), 0); },
  hoje() { const t = new Date(); return DB.all('caixa').filter(m => new Date(m.data).toDateString() === t.toDateString()); },
  somaHoje(fluxo, pred) { return this.hoje().filter(m => m.fluxo === fluxo && (!pred || pred(m))).reduce((s, m) => s + m.valor, 0); },
  // estorno de venda em dinheiro (cancelamento)
  estornarVenda(venda) {
    const cash = (venda.pagamentos || []).filter(p => p.tipo === 'Dinheiro').reduce((s, p) => s + p.valor, 0);
    if (cash > 0) this.add({ fluxo: 'saida', tipo: 'Cancelamento de venda', origem: 'Cancelamento de venda', categoria: 'Estorno', valor: cash, obs: 'Estorno venda #' + venda.id.slice(-4), refId: venda.id });
  }
};

Modules.caixa = function () {
  setTimeout(() => Modules.cxRender(), 20);
  return `
  <div class="page-head">
    <div><h1>Caixa da Loja</h1><p>Controle do dinheiro físico que entra e sai da loja</p></div>
    <div class="actions">
      <button class="btn-ghost" onclick="Modules.cxSuprimento()">⬆️ Entrada</button>
      ${App.can('podeSangria') ? '<button class="btn-ghost" onclick="Modules.cxSangria()">⬇️ Saída</button>' : ''}
      <button class="btn-primary" onclick="Modules.cxFechamento()">🔒 Fechar caixa</button>
    </div>
  </div>

  <div class="grid kpis" id="cx-kpis" style="margin-bottom:16px"></div>

  <div class="grid cols-3" style="margin-bottom:18px">
    <div class="card" style="cursor:pointer" onclick="Modules.cxDeposito()">
      <div class="list-row" style="border:none;padding:2px 0"><div class="lr-ico">🏦</div>
      <div class="lr-main"><div class="lr-title">Depósito Bancário</div><div class="lr-sub">Tirar do caixa e depositar no banco</div></div><span style="font-size:20px;color:var(--txt-3)">›</span></div>
    </div>
    <div class="card" style="cursor:pointer" onclick="Modules.cxDespesa()">
      <div class="list-row" style="border:none;padding:2px 0"><div class="lr-ico">🧾</div>
      <div class="lr-main"><div class="lr-title">Despesa pelo Caixa</div><div class="lr-sub">Pagar despesa com dinheiro do caixa</div></div><span style="font-size:20px;color:var(--txt-3)">›</span></div>
    </div>
    <div class="card" style="cursor:pointer" onclick="Modules.cxCompraUsado()">
      <div class="list-row" style="border:none;padding:2px 0"><div class="lr-ico">🎮</div>
      <div class="lr-main"><div class="lr-title">Comprar Usado</div><div class="lr-sub">Comprar produto usado pagando em dinheiro</div></div><span style="font-size:20px;color:var(--txt-3)">›</span></div>
    </div>
  </div>

  <div id="cx-fechamento-card"></div>

  <div class="section-title">Histórico de movimentações
    <select id="cx-filtro" onchange="Modules.cxRender()" style="background:var(--panel);border:1px solid var(--line);color:var(--txt);padding:7px 10px;border-radius:8px;font-weight:500">
      <option value="">Todas</option><option value="hoje">Somente hoje</option>
      <option value="entrada">Entradas</option><option value="saida">Saídas</option>
    </select>
  </div>
  <div id="cx-hist"></div>`;
};

Modules.cxRender = function () {
  if (!document.getElementById('cx-kpis')) return;
  const saldo = Caixa.saldo();
  const entHoje = Caixa.somaHoje('entrada');
  const saiHoje = Caixa.somaHoje('saida');
  const depHoje = Caixa.somaHoje('saida', m => m.tipo === 'Depósito bancário');
  const despHoje = Caixa.somaHoje('saida', m => m.tipo === 'Despesa pelo caixa');
  document.getElementById('cx-kpis').innerHTML =
    kpi('💵 Saldo atual no caixa', Fmt.brl(saldo), 'dinheiro físico disponível', '🪙', saldo >= 0 ? '' : 'red') +
    kpi('Entradas hoje', Fmt.brl(entHoje), null, '⬆️', '') +
    kpi('Saídas hoje', Fmt.brl(saiHoje), null, '⬇️', 'red') +
    kpi('Depositado no banco (hoje)', Fmt.brl(depHoje), null, '🏦', 'blue') +
    kpi('Despesas pelo caixa (hoje)', Fmt.brl(despHoje), null, '🧾', 'amber');

  // último fechamento
  const fechs = DB.all('fechamentos').slice().sort((a, b) => new Date(b.data) - new Date(a.data));
  const fc = document.getElementById('cx-fechamento-card');
  if (fc) {
    if (fechs.length) {
      const f = fechs[0];
      const cls = f.diferenca === 0 ? 'b-green' : (f.diferenca > 0 ? 'b-blue' : 'b-red');
      fc.innerHTML = `<div class="card" style="margin-bottom:18px"><div class="section-title">Último fechamento — ${Fmt.datetime(f.data)}</div>
        <div class="grid cols-3">
          <div class="mini-stat"><span>Saldo esperado</span><b>${Fmt.brl(f.saldoEsperado)}</b></div>
          <div class="mini-stat"><span>Saldo contado</span><b>${Fmt.brl(f.saldoContado)}</b></div>
          <div class="mini-stat"><span>Diferença</span><b><span class="badge ${cls}">${f.diferenca >= 0 ? '+' : ''}${Fmt.brl(f.diferenca)}</span></b></div>
        </div>${f.obs ? `<p class="muted" style="margin-top:10px">📝 ${esc(f.obs)}</p>` : ''}</div>`;
    } else fc.innerHTML = '';
  }

  // histórico
  const filtro = fval('cx-filtro');
  let list = DB.all('caixa').slice().sort((a, b) => new Date(b.data) - new Date(a.data));
  if (filtro === 'hoje') { const t = new Date(); list = list.filter(m => new Date(m.data).toDateString() === t.toDateString()); }
  else if (filtro === 'entrada' || filtro === 'saida') list = list.filter(m => m.fluxo === filtro);
  document.getElementById('cx-hist').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Origem</th><th>Categoria</th><th>Obs.</th><th>Resp.</th><th class="num">Valor</th></tr></thead>
    <tbody>${list.map(m => `<tr>
      <td>${Fmt.datetime(m.data)}</td>
      <td><span class="badge ${m.fluxo === 'entrada' ? 'b-green' : 'b-red'}">${m.fluxo === 'entrada' ? '⬆️' : '⬇️'} ${esc(m.tipo)}</span></td>
      <td>${esc(m.origem)}</td><td>${esc(m.categoria || '—')}</td>
      <td class="muted">${esc(m.obs || '—')}${m.comprovante ? ' 📎' : ''}</td><td>${esc(m.responsavel)}</td>
      <td class="num strong" style="color:${m.fluxo === 'entrada' ? 'var(--green)' : 'var(--red)'}">${m.fluxo === 'entrada' ? '+' : '−'} ${Fmt.brl(m.valor)}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">Sem movimentações.</td></tr>'}</tbody></table></div>`;
};

/* -------- Ações -------- */
Modules.cxSuprimento = function () {
  Modal.open({
    title: '⬆️ Entrada no caixa',
    body: `<p class="muted" style="margin-bottom:12px">Adicionar dinheiro ao caixa (troco, fundo, reforço).</p>
      <div class="form-grid">
      <div class="field"><label>Tipo de entrada</label><select id="cx-tipo">
        <option>Suprimento / Fundo de troco</option><option>Reforço de caixa</option><option>Ajuste manual</option><option>Outra entrada</option>
      </select></div>
      <div class="field"><label>Valor (R$) *</label><input id="cx-val" type="number" step="0.01" value="0"></div>
      <div class="field full"><label>Observação</label><input id="cx-obs" placeholder="Ex: fundo de troco"></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSave('suprimento')">Confirmar entrada</button>`
  });
};
Modules.cxSangria = function () {
  Modal.open({
    title: '⬇️ Saída do caixa',
    body: `<p class="muted" style="margin-bottom:12px">Saldo atual: <b style="color:var(--green)">${Fmt.brl(Caixa.saldo())}</b></p>
      <div class="form-grid">
      <div class="field"><label>Tipo de retirada</label><select id="cx-tipo">
        <option>Retirada administrativa</option><option>Depósito bancário</option><option>Pagamento de despesa</option><option>Compra de produto para a loja</option><option>Ajuste manual</option>
      </select></div>
      <div class="field"><label>Valor (R$) *</label><input id="cx-val" type="number" step="0.01" value="0"></div>
      <div class="field full"><label>Observação</label><input id="cx-obs" placeholder="Motivo da retirada"></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSave('sangria')">Confirmar retirada</button>`
  });
};
Modules.cxDeposito = function () {
  Modal.open({
    title: '🏦 Depósito bancário',
    body: `<p class="muted" style="margin-bottom:12px">Saldo no caixa: <b style="color:var(--green)">${Fmt.brl(Caixa.saldo())}</b>. O valor sai do caixa físico e vai para o banco.</p>
      <div class="form-grid"><div class="field"><label>Valor do depósito (R$) *</label><input id="cx-val" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Banco / Conta</label><input id="cx-banco" placeholder="Ex: Banco do Brasil"></div>
      <div class="field full"><label>Observação</label><input id="cx-obs" placeholder="Comprovante, autenticação..."></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSave('deposito')">Confirmar depósito</button>`
  });
};
Modules.cxDespesa = function () {
  const cats = ['Limpeza', 'Alimentação', 'Transporte', 'Manutenção', 'Material de escritório', 'Marketing', 'Outros'];
  Modal.open({
    title: '🧾 Despesa paga pelo caixa',
    body: `<div class="form-grid">
      <div class="field"><label>Valor (R$) *</label><input id="cx-val" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Categoria</label><select id="cx-cat">${cats.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field full"><label>Descrição *</label><input id="cx-obs" placeholder="Ex: produtos de limpeza"></div>
      <div class="field full"><label>Comprovante (link/nº opcional)</label><input id="cx-comp" placeholder="Nº da nota ou link da foto"></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSave('despesa')">Registrar despesa</button>`
  });
};
Modules.cxCompraUsado = function () {
  Modal.open({
    title: '🎮 Compra de usado (dinheiro do caixa)',
    body: `<p class="muted" style="margin-bottom:12px">O produto entra no estoque de usados e o valor sai do caixa. Manutenção e acessórios podem ser lançados depois em "Avaliação de Usados".</p>
      <div class="form-grid">
      <div class="field full"><label>Produto *</label><input id="cx-prod" placeholder="Ex: PlayStation 4 Pro 1TB"></div>
      <div class="field"><label>Categoria</label><select id="cx-cat">${DB.all('categorias').map(c => `<option>${c.nome}</option>`).join('')}</select></div>
      <div class="field"><label>Condição</label><select id="cx-cond"><option>usado</option><option>seminovo</option></select></div>
      <div class="field"><label>Valor pago (R$) *</label><input id="cx-val" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Nº de série</label><input id="cx-serie"></div>
      <div class="field full"><label>Observação</label><input id="cx-obs" placeholder="Acompanha caixa, controles..."></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSave('usado')">Confirmar compra</button>`
  });
};

Modules.cxSave = function (acao) {
  const val = fnum('cx-val'), obs = fval('cx-obs');
  if (val <= 0) return Toast.err('Informe um valor válido.');
  const saldo = Caixa.saldo();
  if (acao === 'suprimento') {
    const tipoE = fval('cx-tipo') || 'Entrada';
    Caixa.add({ fluxo: 'entrada', tipo: 'Entrada', origem: tipoE, categoria: 'Entrada', valor: val, obs });
  } else if (acao === 'sangria') {
    const tipo = fval('cx-tipo');
    if (val > saldo) return Toast.err('Valor maior que o saldo do caixa (' + Fmt.brl(saldo) + ').');
    Caixa.add({ fluxo: 'saida', tipo: tipo === 'Depósito bancário' ? 'Depósito bancário' : 'Sangria', origem: tipo, categoria: 'Sangria', valor: val, obs });
  } else if (acao === 'deposito') {
    if (val > saldo) return Toast.err('Valor maior que o saldo do caixa (' + Fmt.brl(saldo) + ').');
    Caixa.add({ fluxo: 'saida', tipo: 'Depósito bancário', origem: 'Depósito bancário', categoria: 'Depósito', valor: val, obs: (fval('cx-banco') ? fval('cx-banco') + ' · ' : '') + obs });
    DB.logMov('ajuste', 'Depósito bancário — saída do caixa físico para o banco', { valor: val });
  } else if (acao === 'despesa') {
    if (!obs) return Toast.err('Informe a descrição da despesa.');
    if (val > saldo) return Toast.err('Valor maior que o saldo do caixa (' + Fmt.brl(saldo) + ').');
    Caixa.add({ fluxo: 'saida', tipo: 'Despesa pelo caixa', origem: 'Despesa paga pelo caixa', categoria: fval('cx-cat'), valor: val, obs, comprovante: fval('cx-comp') });
    DB.logFin({ tipo: 'saida', categoria: fval('cx-cat'), descricao: '[Caixa] ' + obs, valor: val, status: 'pago', origem: 'caixa' });
    DB.logMov('ajuste', 'Despesa paga pelo caixa: ' + obs + ' (' + fval('cx-cat') + ')', { valor: val });
  } else if (acao === 'usado') {
    const prod = fval('cx-prod'); if (!prod) return Toast.err('Informe o produto.');
    if (val > saldo) return Toast.err('Valor maior que o saldo do caixa (' + Fmt.brl(saldo) + ').');
    Caixa.add({ fluxo: 'saida', tipo: 'Compra de usado', origem: 'Compra de usado', categoria: 'Compra usado', valor: val, obs });
    DB.insert('produtos', {
      nome: prod, sku: 'USD-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '',
      categoria: fval('cx-cat'), marca: '—', modelo: '', condicao: fval('cx-cond'),
      qtd: 1, min: 1, custo: val, custoMedio: val, preco: Math.round(val * 1.6), serie: fval('cx-serie'),
      local: 'Usados', status: 'disponivel'
    });
    DB.logFin({ tipo: 'saida', categoria: 'Compra de usado', descricao: '[Caixa] Compra usado: ' + prod, valor: val, status: 'pago', origem: 'usado' });
    DB.logMov('usado', 'Compra de usado (caixa): ' + prod + ' — custo ' + Fmt.brl(val), { valor: val });
  }
  Modal.close();
  Toast.ok('Movimentação registrada no caixa.');
  App.go('caixa');
};

/* -------- Fechamento de caixa -------- */
Modules.cxFechamento = function () {
  const saldo = Caixa.saldo();
  const entHoje = Caixa.somaHoje('entrada');
  const saiHoje = Caixa.somaHoje('saida');
  const depHoje = Caixa.somaHoje('saida', m => m.tipo === 'Depósito bancário');
  const despHoje = Caixa.somaHoje('saida', m => m.tipo === 'Despesa pelo caixa');
  const saldoInicial = saldo - (entHoje - saiHoje);
  Modal.open({
    title: '🔒 Fechamento de Caixa — ' + Fmt.date(new Date()),
    body: `<div class="card" style="background:var(--bg-2);margin-bottom:14px">
        <div class="mini-stat"><span>Saldo inicial do dia</span><b>${Fmt.brl(saldoInicial)}</b></div>
        <div class="mini-stat"><span>(+) Entradas em dinheiro</span><b style="color:var(--green)">${Fmt.brl(entHoje)}</b></div>
        <div class="mini-stat"><span>(−) Saídas do caixa</span><b style="color:var(--red)">${Fmt.brl(saiHoje)}</b></div>
        <div class="mini-stat"><span>↳ Depósitos realizados</span><b>${Fmt.brl(depHoje)}</b></div>
        <div class="mini-stat"><span>↳ Despesas pelo caixa</span><b>${Fmt.brl(despHoje)}</b></div>
        <div class="mini-stat" style="font-size:16px"><span class="strong">Saldo esperado</span><b style="color:var(--green)">${Fmt.brl(saldo)}</b></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Saldo contado manualmente (R$) *</label><input id="cx-contado" type="number" step="0.01" value="${saldo.toFixed(2)}" oninput="Modules.cxDiff(${saldo})"></div>
        <div class="field"><label>Diferença</label><input id="cx-diff" value="R$ 0,00" disabled style="font-weight:700"></div>
        <div class="field full"><label>Observação (justifique a diferença, se houver)</label><input id="cx-fobs" placeholder="Ex: faltou troco, sobra de moedas..."></div>
      </div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cxSaveFechamento(${saldo},${saldoInicial},${entHoje},${saiHoje},${depHoje},${despHoje})">Registrar fechamento</button>`
  });
  this.cxDiff(saldo);
};
Modules.cxDiff = function (esperado) {
  const contado = fnum('cx-contado'); const dif = contado - esperado;
  const el = document.getElementById('cx-diff'); if (!el) return;
  el.value = (dif >= 0 ? '+ ' : '− ') + Fmt.brl(Math.abs(dif));
  el.style.color = dif === 0 ? 'var(--green)' : (dif > 0 ? 'var(--blue)' : 'var(--red)');
};
Modules.cxSaveFechamento = function (esperado, inicial, ent, sai, dep, desp) {
  const contado = fnum('cx-contado'), dif = contado - esperado, obs = fval('cx-fobs');
  DB.insert('fechamentos', {
    data: new Date().toISOString(), saldoInicial: inicial, entradas: ent, saidas: sai,
    depositos: dep, despesas: desp, saldoEsperado: esperado, saldoContado: contado, diferenca: dif,
    obs, responsavel: 'Admin'
  });
  // alinha o saldo do sistema ao valor contado
  if (dif !== 0) Caixa.add({ fluxo: dif > 0 ? 'entrada' : 'saida', tipo: 'Ajuste manual', origem: 'Ajuste de fechamento', categoria: 'Fechamento', valor: Math.abs(dif), obs: 'Diferença de fechamento' + (obs ? ': ' + obs : '') });
  Modal.close();
  Toast.ok('Caixa fechado. Diferença: ' + (dif >= 0 ? '+' : '') + Fmt.brl(dif));
  App.go('caixa');
};
