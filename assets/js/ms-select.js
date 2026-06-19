/* ============ RICO GAMES ERP — Multi-seleção (chips + busca instantânea) ============ */
const MSelect = {
  inst: {},
  setup(id, items, onChange) {
    this.inst[id] = this.inst[id] || { sel: [] };
    this.inst[id].items = items;
    this.inst[id].onChange = onChange;
    return this.inst[id];
  },
  selected(id) { return (this.inst[id] || { sel: [] }).sel; },
  setSelected(id, arr) { this.inst[id] = this.inst[id] || { sel: [] }; this.inst[id].sel = arr.slice(); },
  html(id, placeholder) {
    return `<div class="ms" id="ms-${id}">
      <div class="ms-box" onclick="var i=document.getElementById('ms-input-${id}');if(i)i.focus()">
        <span class="ms-chips" id="ms-chips-${id}"></span>
        <input class="ms-input" id="ms-input-${id}" autocomplete="off" placeholder="${placeholder || 'Buscar produto...'}" oninput="MSelect.filter('${id}')" onfocus="MSelect.filter('${id}')" onblur="MSelect.blur('${id}')">
      </div>
      <div class="ms-drop" id="ms-drop-${id}"></div>
    </div>`;
  },
  mount(id) { this.renderChips(id); },
  renderChips(id) {
    const inst = this.inst[id], el = document.getElementById('ms-chips-' + id);
    if (!el) return;
    el.innerHTML = inst.sel.map(sku => {
      const it = (inst.items || []).find(x => x.sku === sku) || { nome: sku };
      return `<span class="ms-chip">${esc(it.nome)}<span class="x" onmousedown="event.preventDefault();MSelect.remove('${id}','${sku}')">✕</span></span>`;
    }).join('');
  },
  filter(id) {
    const inst = this.inst[id]; if (!inst) return;
    const inp = document.getElementById('ms-input-' + id), q = (inp ? inp.value : '').toLowerCase();
    const matches = (inst.items || []).filter(it => !inst.sel.includes(it.sku) && (it.nome.toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q))).slice(0, 12);
    const drop = document.getElementById('ms-drop-' + id); if (!drop) return;
    drop.innerHTML = matches.length
      ? matches.map(it => `<div class="ms-opt" onmousedown="event.preventDefault();MSelect.add('${id}','${it.sku}')"><span>${esc(it.nome)}</span><span class="o-sku">${it.sku}</span></div>`).join('')
      : '<div class="ms-empty">Nenhum produto encontrado.</div>';
    drop.classList.add('show');
  },
  blur(id) { setTimeout(() => { const d = document.getElementById('ms-drop-' + id); if (d) d.classList.remove('show'); }, 160); },
  add(id, sku) {
    const inst = this.inst[id]; if (!inst.sel.includes(sku)) inst.sel.push(sku);
    const inp = document.getElementById('ms-input-' + id); if (inp) { inp.value = ''; inp.focus(); }
    this.renderChips(id); this.filter(id); if (inst.onChange) inst.onChange();
  },
  remove(id, sku) {
    const inst = this.inst[id]; inst.sel = inst.sel.filter(s => s !== sku);
    this.renderChips(id); if (inst.onChange) inst.onChange();
  },
  clear(id) { const inst = this.inst[id]; if (inst) { inst.sel = []; this.renderChips(id); if (inst.onChange) inst.onChange(); } }
};
