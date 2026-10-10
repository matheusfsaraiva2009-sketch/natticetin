'use strict';
// ════════════════════════════════════════════════
//  NAT CETIM — Sistema de Gestão  |  script.js
//  Versão simplificada
// ════════════════════════════════════════════════

// ── BANCO DE DADOS LOCAL + FIREBASE ─────────────
const DB = {
  get(k)  { try { return JSON.parse(localStorage.getItem('nc2_'+k) || '[]'); } catch { return []; } },
  set(k,d){ localStorage.setItem('nc2_'+k, JSON.stringify(d)); FSync.write(k,d); },
  obj(k)  { try { return JSON.parse(localStorage.getItem('nc2_'+k) || '{}'); } catch { return {}; } },
  sobj(k,d){ localStorage.setItem('nc2_'+k, JSON.stringify(d)); FSync.write(k,d); },
  save(k,item){
    const d = this.get(k);
    const i = d.findIndex(r => r.id === item.id);
    i > -1 ? d[i] = item : d.push(item);
    this.set(k, d);
  },
  del(k,id){ this.set(k, this.get(k).filter(r => r.id !== id)); },
  one(k,id){ return this.get(k).find(r => r.id === id); }
};

// ── FIREBASE SYNC ────────────────────────────────
const FSync = {
  db: null,
  ready: false,
  ns: 'nat_cetim_v2',
  keys: ['expenses','production','sales','gifts','losses','products_list'],

  init() {
    const el = document.getElementById('fb-dot');
    const msg = document.getElementById('fb-msg');
    if (!window.FIREBASE_ENABLED || !window.FIREBASE_CONFIG) {
      if(msg) msg.textContent = 'Firebase desativado (dados locais).';
      return;
    }
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg.apiKey || !cfg.databaseURL) {
      if(msg) msg.textContent = 'Credenciais incompletas.';
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.db = firebase.database();
      this.ready = true;
      if(el) { el.style.background = 'var(--ok)'; }
      if(msg) msg.textContent = 'Firebase conectado ✓';
      this.pull();
    } catch(e) {
      if(msg) msg.textContent = 'Erro ao conectar: ' + e.message;
      console.warn('Firebase error:', e.message);
    }
  },

  write(key, data) {
    if (!this.ready) return;
    this.db.ref(this.ns+'/'+key).set(data)
      .catch(e => console.warn('Sync write falhou:', e.message));
  },

  async pull() {
    if (!this.ready) return;
    try {
      const snap = await this.db.ref(this.ns).get();
      if (!snap.exists()) { this.pushAll(); return; }
      const data = snap.val();
      this.keys.forEach(k => {
        const cloud = data[k];
        if (Array.isArray(cloud) && cloud.length > 0) {
          const local = DB.get(k);
          const merged = cloud.map(ci => local.find(l => l.id === ci.id) || ci);
          local.forEach(li => { if (!merged.find(m => m.id === li.id)) merged.push(li); });
          localStorage.setItem('nc2_'+k, JSON.stringify(merged));
        }
      });
      toast('☁️ Dados sincronizados!', 'ok');
      renderAll();
    } catch(e) {
      console.warn('Firebase pull falhou:', e.message);
    }
  },

  pushAll() {
    if (!this.ready) return;
    this.keys.forEach(k => this.write(k, DB.get(k)));
    toast('☁️ Dados enviados para a nuvem!', 'ok');
  },

  syncNow() {
    if (!this.ready) { toast('Firebase não configurado.', 'warn'); return; }
    this.pushAll();
    setTimeout(() => this.pull(), 1200);
  }
};

// ── UTILITÁRIOS ──────────────────────────────────
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const R$   = v  => 'R$ ' + (Number(v)||0).toFixed(2).replace('.',',');
const today = () => new Date().toISOString().split('T')[0];

function fmtDate(s) {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function prodLabel(name, size) {
  if (!size || size === '—') return name;
  return `${name} ${size}`;
}

function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function req(id, label) {
  const el = document.getElementById(id);
  if (!el || !el.value.toString().trim()) {
    toast(`Preencha o campo: ${label}`, 'err');
    el && el.focus();
    return false;
  }
  return true;
}

// ── NAVEGAÇÃO ────────────────────────────────────
const pageTitles = {
  dashboard: 'Resumo',
  expenses:  'Gastos',
  production:'Produção',
  sales:     'Vendas',
  gifts:     'Brindes',
  losses:    'Perdas',
  stock:     'Estoque',
  settings:  'Configurações'
};

function nav(s) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const sec = document.getElementById('sec-'+s);
  if (sec) sec.classList.add('active');
  const ni = document.querySelector(`.nav-item[data-s="${s}"]`);
  if (ni) ni.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[s] || s;
  closeSB();

  // render the active section
  const renders = {
    dashboard: renderDash,
    expenses:  () => renderExpenses(),
    production:() => renderProduction(),
    sales:     () => renderSales(),
    gifts:     () => renderGifts(),
    losses:    () => renderLosses(),
    stock:     renderStock,
    settings:  renderSettings
  };
  if (renders[s]) renders[s]();
}

function toggleSB() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sbo').classList.toggle('show');
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sbo').classList.remove('show');
}

// ── MODALS ───────────────────────────────────────
function openOv(id)  { document.getElementById(id).classList.add('open'); }
function closeOv(id) { document.getElementById(id).classList.remove('open'); }

// ── PRODUTOS (lista simples) ─────────────────────
function getProducts() {
  const list = DB.get('products_list');
  if (!list || list.length === 0) {
    // defaults
    return [
      { id: 'p1', name: 'Touca de cetim' },
      { id: 'p2', name: 'Xuxinha de cetim' },
      { id: 'p3', name: 'Kit touca + xuxinha' }
    ];
  }
  return list;
}

function saveProductsList(list) {
  DB.set('products_list', list);
}

function fillProductSelect(selId, selectedName) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prods = getProducts();
  sel.innerHTML = '<option value="">Selecione...</option>';
  prods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function addProduct() {
  const input = document.getElementById('new-product-name');
  const name = (input.value || '').trim();
  if (!name) { toast('Digite o nome do produto.', 'err'); return; }
  const list = getProducts();
  if (list.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('Produto já cadastrado.', 'warn'); return;
  }
  list.push({ id: uid(), name });
  saveProductsList(list);
  input.value = '';
  toast('Produto adicionado!', 'ok');
  renderSettings();
}

function removeProduct(id) {
  const list = getProducts().filter(p => p.id !== id);
  saveProductsList(list);
  toast('Produto removido.', '');
  renderSettings();
}

function renderSettings() {
  const list = getProducts();
  const el = document.getElementById('products-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text2)">Nenhum produto cadastrado.</p>'; return; }
  el.innerHTML = list.map(p =>
    `<span class="prod-tag">${p.name}<button onclick="removeProduct('${p.id}')" title="Remover">×</button></span>`
  ).join('');
}

// ── GASTOS ───────────────────────────────────────
let expFilter = 'all';

function setEF(f, btn) {
  expFilter = f;
  document.querySelectorAll('#exp-fb .f-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderExpenses();
}

function openExpModal(id) {
  document.getElementById('e-id').value   = '';
  document.getElementById('e-desc').value = '';
  document.getElementById('e-cat').value  = 'material';
  document.getElementById('e-date').value = today();
  document.getElementById('e-val').value  = '';
  document.getElementById('exp-modal-title').textContent = 'Novo Gasto';
  if (id) {
    const r = DB.one('expenses', id);
    if (r) {
      document.getElementById('e-id').value   = r.id;
      document.getElementById('e-desc').value = r.desc;
      document.getElementById('e-cat').value  = r.cat;
      document.getElementById('e-date').value = r.date;
      document.getElementById('e-val').value  = r.val;
      document.getElementById('exp-modal-title').textContent = 'Editar Gasto';
    }
  }
  openOv('ov-expense');
}

function saveExp() {
  if (!req('e-desc','Descrição')) return;
  if (!req('e-date','Data')) return;
  if (!req('e-val','Valor')) return;
  const item = {
    id:   document.getElementById('e-id').value || uid(),
    desc: document.getElementById('e-desc').value.trim(),
    cat:  document.getElementById('e-cat').value,
    date: document.getElementById('e-date').value,
    val:  parseFloat(document.getElementById('e-val').value) || 0,
    ts:   Date.now()
  };
  DB.save('expenses', item);
  closeOv('ov-expense');
  toast('Gasto salvo!', 'ok');
  renderExpenses();
  renderDash();
}

function deleteExp(id) {
  confirm2('Excluir este gasto?', () => {
    DB.del('expenses', id);
    toast('Gasto excluído.', '');
    renderExpenses();
    renderDash();
  });
}

function renderExpenses() {
  const all   = DB.get('expenses').sort((a,b) => b.date.localeCompare(a.date));
  const items = expFilter === 'all' ? all : all.filter(r => r.cat === expFilter);
  const tb    = document.getElementById('exp-tb');
  const empty = document.getElementById('exp-empty');
  const bar   = document.getElementById('exp-total-bar');

  if (!items.length) {
    if (tb)    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (bar)   bar.classList.remove('show');
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = items.reduce((s,r) => s + (r.val||0), 0);
  if (bar) {
    bar.textContent = `Total ${expFilter === 'all' ? 'geral' : 'filtrado'}: ${R$(total)}`;
    bar.classList.add('show');
  }

  const catLabel = { material:'Material', embalagem:'Embalagem', frete:'Frete', divulgacao:'Divulgação', equipamento:'Equipamento', outro:'Outro' };

  tb.innerHTML = items.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.desc}</td>
      <td><span class="badge bneu">${catLabel[r.cat]||r.cat}</span></td>
      <td><strong>${R$(r.val)}</strong></td>
      <td class="ra">
        <button class="btn btn-g btn-sm btn-ic" title="Editar" onclick="openExpModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-d btn-sm btn-ic" title="Excluir" onclick="deleteExp('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </td>
    </tr>`).join('');
}

// ── PRODUÇÃO ─────────────────────────────────────
function openProdModal(id) {
  document.getElementById('p-id').value   = '';
  document.getElementById('p-size').value = '';
  document.getElementById('p-qty').value  = 1;
  document.getElementById('p-date').value = today();
  document.getElementById('prod-modal-title').textContent = 'Registrar Produção';
  fillProductSelect('p-prod', '');
  if (id) {
    const r = DB.one('production', id);
    if (r) {
      document.getElementById('p-id').value   = r.id;
      document.getElementById('p-size').value = r.size || '';
      document.getElementById('p-qty').value  = r.qty;
      document.getElementById('p-date').value = r.date;
      document.getElementById('prod-modal-title').textContent = 'Editar Produção';
      fillProductSelect('p-prod', r.prod);
    }
  }
  openOv('ov-production');
}

function saveProd() {
  if (!req('p-prod','Produto')) return;
  if (!req('p-qty','Quantidade')) return;
  if (!req('p-date','Data')) return;
  const item = {
    id:   document.getElementById('p-id').value || uid(),
    prod: document.getElementById('p-prod').value,
    size: document.getElementById('p-size').value,
    qty:  parseInt(document.getElementById('p-qty').value) || 1,
    date: document.getElementById('p-date').value,
    ts:   Date.now()
  };
  DB.save('production', item);
  closeOv('ov-production');
  toast('Produção registrada!', 'ok');
  renderProduction();
  renderDash();
  renderStock();
}

function deleteProd(id) {
  confirm2('Excluir este registro de produção?', () => {
    DB.del('production', id);
    toast('Registro excluído.', '');
    renderProduction();
    renderDash();
    renderStock();
  });
}

function renderProduction() {
  const all   = DB.get('production').sort((a,b) => b.date.localeCompare(a.date));
  const tb    = document.getElementById('prod-tb');
  const empty = document.getElementById('prod-empty');
  if (!all.length) {
    if (tb)    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  tb.innerHTML = all.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.prod}</td>
      <td>${r.size || '—'}</td>
      <td><strong>${r.qty}</strong></td>
      <td class="ra">
        <button class="btn btn-g btn-sm btn-ic" title="Editar" onclick="openProdModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-d btn-sm btn-ic" title="Excluir" onclick="deleteProd('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </td>
    </tr>`).join('');
}

// ── VENDAS ───────────────────────────────────────
let saleFilter = 'all';

// Preços sugeridos para toucas
const PRICE_HINTS = {
  'Touca de cetim': { M: { varejo: 10, atacado: 8 }, G: { varejo: 12, atacado: 10 } }
};
const ATACADO_MIN = 10;

function setSF(f, btn) {
  saleFilter = f;
  document.querySelectorAll('#sale-fb .f-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSales();
}

function openSaleModal(id) {
  document.getElementById('s-id').value     = '';
  document.getElementById('s-size').value   = '';
  document.getElementById('s-qty').value    = 1;
  document.getElementById('s-price').value  = '';
  document.getElementById('s-date').value   = today();
  document.getElementById('s-status').value = 'pago';
  document.getElementById('s-notes').value  = '';
  document.getElementById('s-total-display').textContent = 'R$ 0,00';
  document.getElementById('s-price-hint').classList.remove('show');
  document.getElementById('s-price-hint').textContent = '';
  document.getElementById('sale-modal-title').textContent = 'Nova Venda';
  fillProductSelect('s-prod', '');
  if (id) {
    const r = DB.one('sales', id);
    if (r) {
      document.getElementById('s-id').value     = r.id;
      document.getElementById('s-size').value   = r.size || '';
      document.getElementById('s-qty').value    = r.qty;
      document.getElementById('s-price').value  = r.price;
      document.getElementById('s-date').value   = r.date;
      document.getElementById('s-status').value = r.status;
      document.getElementById('s-notes').value  = r.notes || '';
      document.getElementById('sale-modal-title').textContent = 'Editar Venda';
      fillProductSelect('s-prod', r.prod);
      calcSaleTotal();
    }
  }
  openOv('ov-sale');
}

function fillSalePrice() {
  const prod  = document.getElementById('s-prod').value;
  const size  = document.getElementById('s-size').value;
  const qty   = parseInt(document.getElementById('s-qty').value) || 1;
  const hint  = document.getElementById('s-price-hint');
  const hints = PRICE_HINTS[prod] && PRICE_HINTS[prod][size];
  if (hints) {
    const tipo = qty >= ATACADO_MIN ? 'atacado' : 'varejo';
    const preco = hints[tipo];
    document.getElementById('s-price').value = preco;
    hint.textContent = `💡 ${tipo.charAt(0).toUpperCase()+tipo.slice(1)} (${qty >= ATACADO_MIN ? '≥'+ATACADO_MIN+' unid.' : '<'+ATACADO_MIN+' unid.'}): ${R$(preco)} sugerido. Você pode alterar.`;
    hint.classList.add('show');
  } else {
    hint.classList.remove('show');
  }
  calcSaleTotal();
}

function calcSaleTotal() {
  const qty   = parseInt(document.getElementById('s-qty').value) || 0;
  const price = parseFloat(document.getElementById('s-price').value) || 0;
  document.getElementById('s-total-display').textContent = R$(qty * price);
}

function saveSale() {
  if (!req('s-prod','Produto')) return;
  if (!req('s-qty','Quantidade')) return;
  if (!req('s-price','Preço unitário')) return;
  if (!req('s-date','Data')) return;
  const item = {
    id:     document.getElementById('s-id').value || uid(),
    prod:   document.getElementById('s-prod').value,
    size:   document.getElementById('s-size').value,
    qty:    parseInt(document.getElementById('s-qty').value) || 1,
    price:  parseFloat(document.getElementById('s-price').value) || 0,
    total:  (parseInt(document.getElementById('s-qty').value)||1) * (parseFloat(document.getElementById('s-price').value)||0),
    date:   document.getElementById('s-date').value,
    status: document.getElementById('s-status').value,
    notes:  document.getElementById('s-notes').value.trim(),
    ts:     Date.now()
  };
  DB.save('sales', item);
  closeOv('ov-sale');
  toast('Venda registrada!', 'ok');
  renderSales();
  renderDash();
  renderStock();
}

function deleteSale(id) {
  confirm2('Excluir esta venda?', () => {
    DB.del('sales', id);
    toast('Venda excluída.', '');
    renderSales();
    renderDash();
    renderStock();
  });
}

function renderSales() {
  const all   = DB.get('sales').sort((a,b) => b.date.localeCompare(a.date));
  const items = saleFilter === 'all' ? all : all.filter(r => r.status === saleFilter);
  const tb    = document.getElementById('sales-tb');
  const empty = document.getElementById('sales-empty');
  if (!items.length) {
    if (tb)    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  const statusLabel = { pago:'Pago', pendente:'Pendente', cancelado:'Cancelado' };
  const statusClass = { pago:'bok', pendente:'bwarn', cancelado:'berr' };
  tb.innerHTML = items.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.prod}</td>
      <td>${r.size || '—'}</td>
      <td>${r.qty}</td>
      <td>${R$(r.price)}</td>
      <td><strong>${R$(r.total)}</strong></td>
      <td><span class="badge ${statusClass[r.status]||'bneu'}">${statusLabel[r.status]||r.status}</span></td>
      <td class="ra">
        <button class="btn btn-g btn-sm btn-ic" title="Editar" onclick="openSaleModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-d btn-sm btn-ic" title="Excluir" onclick="deleteSale('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </td>
    </tr>`).join('');
}

// ── BRINDES ──────────────────────────────────────
function openGiftModal(id) {
  document.getElementById('g-id').value   = '';
  document.getElementById('g-size').value = '';
  document.getElementById('g-qty').value  = 1;
  document.getElementById('g-date').value = today();
  document.getElementById('gift-modal-title').textContent = 'Novo Brinde';
  fillProductSelect('g-prod', '');
  if (id) {
    const r = DB.one('gifts', id);
    if (r) {
      document.getElementById('g-id').value   = r.id;
      document.getElementById('g-size').value = r.size || '';
      document.getElementById('g-qty').value  = r.qty;
      document.getElementById('g-date').value = r.date;
      document.getElementById('gift-modal-title').textContent = 'Editar Brinde';
      fillProductSelect('g-prod', r.prod);
    }
  }
  openOv('ov-gift');
}

function saveGift() {
  if (!req('g-prod','Produto')) return;
  if (!req('g-qty','Quantidade')) return;
  if (!req('g-date','Data')) return;
  const item = {
    id:   document.getElementById('g-id').value || uid(),
    prod: document.getElementById('g-prod').value,
    size: document.getElementById('g-size').value,
    qty:  parseInt(document.getElementById('g-qty').value) || 1,
    date: document.getElementById('g-date').value,
    ts:   Date.now()
  };
  DB.save('gifts', item);
  closeOv('ov-gift');
  toast('Brinde registrado!', 'ok');
  renderGifts();
  renderDash();
  renderStock();
}

function deleteGift(id) {
  confirm2('Excluir este brinde?', () => {
    DB.del('gifts', id);
    toast('Brinde excluído.', '');
    renderGifts();
    renderDash();
    renderStock();
  });
}

function renderGifts() {
  const all   = DB.get('gifts').sort((a,b) => b.date.localeCompare(a.date));
  const tb    = document.getElementById('gifts-tb');
  const empty = document.getElementById('gifts-empty');
  if (!all.length) {
    if (tb)    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  tb.innerHTML = all.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.prod}</td>
      <td>${r.size || '—'}</td>
      <td><strong>${r.qty}</strong></td>
      <td class="ra">
        <button class="btn btn-g btn-sm btn-ic" title="Editar" onclick="openGiftModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-d btn-sm btn-ic" title="Excluir" onclick="deleteGift('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </td>
    </tr>`).join('');
}

// ── PERDAS ───────────────────────────────────────
function openLossModal(id) {
  document.getElementById('l-id').value     = '';
  document.getElementById('l-size').value   = '';
  document.getElementById('l-qty').value    = 1;
  document.getElementById('l-date').value   = today();
  document.getElementById('l-reason').value = 'danificado';
  document.getElementById('loss-modal-title').textContent = 'Registrar Perda';
  fillProductSelect('l-prod', '');
  if (id) {
    const r = DB.one('losses', id);
    if (r) {
      document.getElementById('l-id').value     = r.id;
      document.getElementById('l-size').value   = r.size || '';
      document.getElementById('l-qty').value    = r.qty;
      document.getElementById('l-date').value   = r.date;
      document.getElementById('l-reason').value = r.reason;
      document.getElementById('loss-modal-title').textContent = 'Editar Perda';
      fillProductSelect('l-prod', r.prod);
    }
  }
  openOv('ov-loss');
}

function saveLoss() {
  if (!req('l-prod','Produto')) return;
  if (!req('l-qty','Quantidade')) return;
  if (!req('l-date','Data')) return;
  const item = {
    id:     document.getElementById('l-id').value || uid(),
    prod:   document.getElementById('l-prod').value,
    size:   document.getElementById('l-size').value,
    qty:    parseInt(document.getElementById('l-qty').value) || 1,
    date:   document.getElementById('l-date').value,
    reason: document.getElementById('l-reason').value,
    ts:     Date.now()
  };
  DB.save('losses', item);
  closeOv('ov-loss');
  toast('Perda registrada.', '');
  renderLosses();
  renderDash();
  renderStock();
}

function deleteLoss(id) {
  confirm2('Excluir este registro de perda?', () => {
    DB.del('losses', id);
    toast('Registro excluído.', '');
    renderLosses();
    renderDash();
    renderStock();
  });
}

function renderLosses() {
  const all   = DB.get('losses').sort((a,b) => b.date.localeCompare(a.date));
  const tb    = document.getElementById('losses-tb');
  const empty = document.getElementById('losses-empty');
  if (!all.length) {
    if (tb)    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  const reasonLabel = { danificado:'Danificado', defeituoso:'Defeituoso', perdido:'Perdido', outro:'Outro' };
  tb.innerHTML = all.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.prod}</td>
      <td>${r.size || '—'}</td>
      <td><strong>${r.qty}</strong></td>
      <td><span class="badge berr">${reasonLabel[r.reason]||r.reason}</span></td>
      <td class="ra">
        <button class="btn btn-g btn-sm btn-ic" title="Editar" onclick="openLossModal('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn btn-d btn-sm btn-ic" title="Excluir" onclick="deleteLoss('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </td>
    </tr>`).join('');
}

// ── ESTOQUE (calculado automaticamente) ──────────
function getStockMap() {
  const map = {};
  const key = (prod, size) => prod + '||' + (size || '');

  DB.get('production').forEach(r => {
    const k = key(r.prod, r.size);
    if (!map[k]) map[k] = { prod: r.prod, size: r.size||'', produced:0, sold:0, gifted:0, lost:0 };
    map[k].produced += r.qty;
  });
  DB.get('sales').filter(r => r.status !== 'cancelado').forEach(r => {
    const k = key(r.prod, r.size);
    if (!map[k]) map[k] = { prod: r.prod, size: r.size||'', produced:0, sold:0, gifted:0, lost:0 };
    map[k].sold += r.qty;
  });
  DB.get('gifts').forEach(r => {
    const k = key(r.prod, r.size);
    if (!map[k]) map[k] = { prod: r.prod, size: r.size||'', produced:0, sold:0, gifted:0, lost:0 };
    map[k].gifted += r.qty;
  });
  DB.get('losses').forEach(r => {
    const k = key(r.prod, r.size);
    if (!map[k]) map[k] = { prod: r.prod, size: r.size||'', produced:0, sold:0, gifted:0, lost:0 };
    map[k].lost += r.qty;
  });
  return map;
}

function renderStock() {
  const map   = getStockMap();
  const rows  = Object.values(map);
  const tb    = document.getElementById('stock-tb');
  const empty = document.getElementById('stock-empty');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  rows.sort((a,b) => a.prod.localeCompare(b.prod) || a.size.localeCompare(b.size));
  tb.innerHTML = rows.map(r => {
    const stock = r.produced - r.sold - r.gifted - r.lost;
    const cls   = stock > 3 ? 'stock-ok' : stock > 0 ? 'stock-warn' : 'stock-zero';
    return `<tr>
      <td>${r.prod}</td>
      <td>${r.size || '—'}</td>
      <td>${r.produced}</td>
      <td>${r.sold}</td>
      <td>${r.gifted}</td>
      <td>${r.lost}</td>
      <td class="${cls}">${stock}</td>
    </tr>`;
  }).join('');
}

// ── DASHBOARD ────────────────────────────────────
function statCard(icon, label, value, sub, hi, cls) {
  return `<div class="sc${hi?' hi':''}">
    <div class="si">${icon}</div>
    <div class="sl">${label}</div>
    <div class="sv${cls?' '+cls:''}">${value}</div>
    ${sub ? `<div class="ss">${sub}</div>` : ''}
  </div>`;
}

const ico = {
  money:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  cart:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  box:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  gift:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  trend:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  stock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h14M5 8a2 2 0 1 0 0-4h14a2 2 0 1 0 0 4M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/></svg>'
};

function renderDash() {
  const sales      = DB.get('sales').filter(r => r.status !== 'cancelado');
  const expenses   = DB.get('expenses');
  const production = DB.get('production');
  const gifts      = DB.get('gifts');
  const losses     = DB.get('losses');

  const totalVendido  = sales.reduce((s,r) => s + (r.total||0), 0);
  const totalGasto    = expenses.reduce((s,r) => s + (r.val||0), 0);
  const saldo         = totalVendido - totalGasto;
  const totalProduzido = production.reduce((s,r) => s + r.qty, 0);
  const totalVendidoQty = sales.reduce((s,r) => s + r.qty, 0);
  const totalBrindes  = gifts.reduce((s,r) => s + r.qty, 0);
  const totalPerdas   = losses.reduce((s,r) => s + r.qty, 0);
  const totalEstoque  = totalProduzido - totalVendidoQty - totalBrindes - totalPerdas;

  const statsEl = document.getElementById('dash-stats');
  if (statsEl) {
    statsEl.innerHTML =
      statCard(ico.expense, 'Total Gasto',    R$(totalGasto),   `${expenses.length} registro(s)`, false) +
      statCard(ico.cart,    'Total Vendido',   R$(totalVendido), `${sales.length} venda(s)`, false) +
      statCard(ico.trend,   'Saldo',           R$(saldo),        'Vendas − Gastos', true, saldo>=0?'pos':'neg') +
      statCard(ico.box,     'Produzido',       totalProduzido+'', `${production.length} registro(s)`, false) +
      statCard(ico.cart,    'Vendido (unid.)', totalVendidoQty+'', '', false) +
      statCard(ico.gift,    'Brindes',         totalBrindes+'', '', false) +
      statCard(ico.stock,   'Em Estoque',      totalEstoque+'', 'Calculado automaticamente', false, totalEstoque>0?'pos':totalEstoque===0?'':'neg');
  }

  // Últimas vendas
  const recentEl = document.getElementById('recent-sales');
  if (recentEl) {
    const last5 = [...sales].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    if (!last5.length) {
      recentEl.innerHTML = '<div class="empty-inline">Nenhuma venda ainda.</div>';
    } else {
      const statusClass = { pago:'bok', pendente:'bwarn', cancelado:'berr' };
      recentEl.innerHTML = last5.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--blt)">
          <div>
            <div style="font-size:13.5px;font-weight:600">${r.prod}${r.size?' '+r.size:''}</div>
            <div style="font-size:12px;color:var(--text2)">${fmtDate(r.date)} · ${r.qty} unid.</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">${R$(r.total)}</div>
            <span class="badge ${statusClass[r.status]||'bneu'}" style="font-size:10px">${r.status}</span>
          </div>
        </div>`).join('');
    }
  }

  // Últimos gastos
  const recentExpEl = document.getElementById('recent-expenses');
  if (recentExpEl) {
    const last5 = [...expenses].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    if (!last5.length) {
      recentExpEl.innerHTML = '<div class="empty-inline">Nenhum gasto ainda.</div>';
    } else {
      recentExpEl.innerHTML = last5.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--blt)">
          <div>
            <div style="font-size:13.5px;font-weight:600">${r.desc}</div>
            <div style="font-size:12px;color:var(--text2)">${fmtDate(r.date)}</div>
          </div>
          <div style="font-weight:700;color:var(--err)">${R$(r.val)}</div>
        </div>`).join('');
    }
  }

  // Estoque no dashboard
  const dashStockEl = document.getElementById('dash-stock');
  if (dashStockEl) {
    const map  = getStockMap();
    const rows = Object.values(map).sort((a,b) => a.prod.localeCompare(b.prod));
    if (!rows.length) {
      dashStockEl.innerHTML = '<div class="empty-inline">Nenhum produto no estoque.</div>';
    } else {
      dashStockEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">` +
        rows.map(r => {
          const stock = r.produced - r.sold - r.gifted - r.lost;
          const cls   = stock > 3 ? 'ok' : stock > 0 ? 'warn' : 'err';
          return `<div style="background:var(--bg2);border-radius:var(--rs);padding:14px;text-align:center">
            <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${r.prod}${r.size?' '+r.size:''}</div>
            <div style="font-family:var(--fd);font-size:26px;font-weight:700;color:var(--${cls})">${stock}</div>
            <div style="font-size:11px;color:var(--text2)">em estoque</div>
          </div>`;
        }).join('') + '</div>';
    }
  }
}

function renderAll() {
  renderDash();
}

// ── CONFIRM ──────────────────────────────────────
let _confirmCb = null;
function confirm2(msg, cb) {
  _confirmCb = cb;
  document.getElementById('con-msg').textContent = msg;
  openOv('ov-confirm');
  document.getElementById('con-ok').onclick = () => { closeOv('ov-confirm'); if (_confirmCb) _confirmCb(); };
}

function confirmClearAll() {
  confirm2('Apagar TODOS os dados permanentemente? Esta ação não pode ser desfeita!', () => {
    ['expenses','production','sales','gifts','losses','products_list'].forEach(k => {
      localStorage.removeItem('nc2_'+k);
      FSync.write(k, []);
    });
    toast('Todos os dados foram apagados.', 'warn');
    renderAll();
    renderSettings();
  });
}

// ── BACKUP ───────────────────────────────────────
function exportBackup() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    expenses:    DB.get('expenses'),
    production:  DB.get('production'),
    sales:       DB.get('sales'),
    gifts:       DB.get('gifts'),
    losses:      DB.get('losses'),
    products_list: DB.get('products_list')
  };
  const a = document.createElement('a');
  a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(data, null, 2));
  a.download = `natcetim-backup-${today()}.json`;
  a.click();
  toast('Backup exportado!', 'ok');
}

function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const keys = ['expenses','production','sales','gifts','losses','products_list'];
      keys.forEach(k => { if (Array.isArray(data[k])) DB.set(k, data[k]); });
      toast('Backup importado com sucesso!', 'ok');
      renderAll();
      renderSettings();
    } catch { toast('Arquivo inválido.', 'err'); }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Data no header
  const d = new Date();
  const dateStr = d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
  const hdDate = document.getElementById('hd-date');
  if (hdDate) hdDate.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Ano no footer
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = d.getFullYear();

  // Fechar modal ao clicar no overlay
  document.querySelectorAll('.ov').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
  });

  // Firebase
  FSync.init();

  // Render inicial
  renderDash();
});
