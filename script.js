'use strict';
// ════════════════════════════════════════════════
//  NATI CETIM — Sistema de Gestão  |  script.js
// ════════════════════════════════════════════════

// ── DB ──────────────────────────────────────────
const DB = {
  get(k){try{return JSON.parse(localStorage.getItem('nc_'+k)||'[]');}catch{return[];}},
  set(k,d){
    localStorage.setItem('nc_'+k,JSON.stringify(d));
    FSync.write(k,d);
  },
  obj(k){try{return JSON.parse(localStorage.getItem('nc_'+k)||'{}');}catch{return{};}},
  sobj(k,d){
    localStorage.setItem('nc_'+k,JSON.stringify(d));
    FSync.write(k,d);
  },
  save(k,item){const d=this.get(k);const i=d.findIndex(r=>r.id===item.id);i>-1?d[i]=item:d.push(item);this.set(k,d);},
  del(k,id){this.set(k,this.get(k).filter(r=>r.id!==id));},
  one(k,id){return this.get(k).find(r=>r.id===id);}
};

// ── FIREBASE SYNC ────────────────────────────────
const FSync = {
  db: null,
  ready: false,
  ns: 'nati_cetim',
  keys: ['products','materials','batches','movements','sales','clients','gifts','losses','expenses'],

  init() {
    if (!window.FIREBASE_ENABLED || !window.FIREBASE_CONFIG) return;
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg.apiKey || !cfg.databaseURL) {
      console.warn('Firebase: credenciais incompletas. Usando dados locais.');
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.db = firebase.database();
      this.ready = true;
      this.pull();
      console.log('✅ Firebase conectado e sincronizando!');
    } catch(e) {
      console.warn('Firebase não iniciou:', e.message);
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
      if (!snap.exists()) {
        // First use on this device — push local data to cloud
        this.pushAll();
        return;
      }
      const data = snap.val();
      // Get most recent: compare by checking if Firebase has more data
      this.keys.forEach(k => {
        const cloud = data[k];
        if (Array.isArray(cloud) && cloud.length > 0) {
          const local = DB.get(k);
          // Use cloud data (merge: keep items not in local)
          const merged = cloud.map(ci => {
            const li = local.find(l => l.id === ci.id);
            return li || ci;
          });
          // Add local items not in cloud
          local.forEach(li => {
            if (!merged.find(m => m.id === li.id)) merged.push(li);
          });
          localStorage.setItem('nc_'+k, JSON.stringify(merged));
        }
      });
      if (data.settings) localStorage.setItem('nc_settings', JSON.stringify(data.settings));
      toast('☁️ Dados sincronizados da nuvem!', 'ok');
      renderDash();
    } catch(e) {
      console.warn('Firebase pull falhou:', e.message);
    }
  },

  pushAll() {
    if (!this.ready) return;
    this.keys.forEach(k => this.write(k, DB.get(k)));
    this.write('settings', DB.obj('settings'));
    toast('☁️ Dados locais enviados para a nuvem!', 'ok');
  },

  syncNow() {
    if (!this.ready) {
      toast('Firebase não configurado. Abra firebase-config.js e preencha as credenciais.', 'warn');
      return;
    }
    this.pushAll();
    toast('☁️ Sincronizando com a nuvem...', '');
  }
};


// ── UTILS ────────────────────────────────────────
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(+v||0);
const fmtD=s=>{if(!s)return'—';const[y,m,d]=s.split('-');return`${d}/${m}/${y}`;};
const today=()=>new Date().toISOString().split('T')[0];
const n=v=>parseFloat(v)||0;

function avgCost(productId){
  const batches=DB.get('batches').filter(b=>b.productId===productId);
  if(!batches.length){const p=DB.one('products',productId);return p?(p.productionCost||0):0;}
  const tc=batches.reduce((s,b)=>s+(b.totalCost||0),0);
  const tq=batches.reduce((s,b)=>s+(b.qty||0),0);
  return tq>0?tc/tq:0;
}

// ── STATE ────────────────────────────────────────
let dFilt='today', pFilt='all', sFilt='all', eFilt='all', fFilt='month';
let bMats=[], sItems=[];
let chSales=null, chStock=null, chFin=null, chExp=null;

// ── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('yr').textContent=new Date().getFullYear();
  const opts={weekday:'long',year:'numeric',month:'long',day:'numeric'};
  document.getElementById('hd-date').textContent=new Date().toLocaleDateString('pt-BR',opts);
  loadSettings();
  FSync.init(); // Start Firebase sync
  renderDash();
  // close overlays on bg click
  document.querySelectorAll('.ov').forEach(o=>{
    o.addEventListener('click',e=>{if(e.target===o)closeOv(o.id);});
  });
});


// ── NAVIGATION ───────────────────────────────────
const titles={dashboard:'Visão Geral',products:'Produtos',materials:'Matéria-prima',production:'Produção',stock:'Estoque',sales:'Vendas',clients:'Clientes',gifts:'Brindes',losses:'Perdas e Avarias',expenses:'Despesas',financial:'Financeiro',reports:'Relatórios',settings:'Configurações'};

function nav(s){
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  const sec=document.getElementById('sec-'+s);
  if(sec)sec.classList.add('active');
  const ni=document.querySelector(`.nav-item[data-s="${s}"]`);
  if(ni)ni.classList.add('active');
  document.getElementById('page-title').textContent=titles[s]||s;
  closeSB();
  ({dashboard:renderDash,products:renderProds,materials:renderMats,production:renderBatches,stock:renderStock,sales:renderSales,clients:renderClients,gifts:renderGifts,losses:renderLosses,expenses:renderExps,financial:renderFin,reports:renderReport,settings:renderSettings})[s]?.();
}

// ── SIDEBAR ──────────────────────────────────────
function toggleSB(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sbo').classList.toggle('show');}
function closeSB(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sbo').classList.remove('show');}

// ── OVERLAYS ─────────────────────────────────────
function openOv(id){document.getElementById(id).classList.add('open');}
function closeOv(id){document.getElementById(id).classList.remove('open');}

// ── TOAST ────────────────────────────────────────
function toast(msg,type=''){
  const el=document.createElement('div');
  el.className='toast '+(type||'');
  const icons={ok:'<polyline points="20 6 9 17 4 12"/>',err:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',warn:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'};
  el.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type]||icons.warn}</svg>${msg}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

// ── CONFIRM ──────────────────────────────────────
function showConfirm(title,msg,cb){
  document.getElementById('conf-title').textContent=title;
  document.getElementById('conf-msg').textContent=msg;
  document.getElementById('conf-ok').onclick=()=>{closeOv('ov-confirm');cb();};
  openOv('ov-confirm');
}

// ── FINANCIAL CALC ───────────────────────────────
function calcFin(filter){
  const now=new Date();
  function inR(ds){
    if(!filter||filter==='all')return true;
    const d=new Date(ds+'T00:00:00');
    if(filter==='today')return d.toDateString()===now.toDateString();
    if(filter==='week'){const s=new Date(now);s.setDate(now.getDate()-7);return d>=s;}
    if(filter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(filter==='year')return d.getFullYear()===now.getFullYear();
    return true;
  }
  const sales=DB.get('sales').filter(s=>s.status!=='cancelado'&&s.status!=='devolvido'&&inR(s.date));
  const rev=sales.reduce((s,v)=>s+(v.totalRevenue||0),0);
  const cogs=sales.reduce((s,v)=>s+(v.totalCost||0),0);
  const giftCost=DB.get('gifts').filter(g=>inR(g.date)).reduce((s,g)=>s+(g.totalCost||0),0);
  const lossCost=DB.get('losses').filter(l=>inR(l.date)).reduce((s,l)=>s+(l.totalCost||0),0);
  const expTotal=DB.get('expenses').filter(e=>e.status==='pago'&&inR(e.date)).reduce((s,e)=>s+(e.value||0),0);
  const gross=rev-cogs;
  const net=gross-expTotal;
  const stockVal=DB.get('products').reduce((s,p)=>s+(p.stock||0)*avgCost(p.id),0);
  return{rev,cogs,gross,expTotal,net,giftCost,lossCost,stockVal};
}

// ── ICON SVGs ────────────────────────────────────
const ico={
  dollar:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trending:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  box:'<path d="M5 8h14M5 8a2 2 0 1 0 0-4h14a2 2 0 1 0 0 4M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  gift:'<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>',
  alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

function svgI(d){return`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${d}</svg>`;}
function statCard(label,val,sub,icon,hi,cls){
  return`<div class="sc ${hi?'hi':''}"><div class="si">${svgI(icon)}</div><div class="sl">${label}</div><div class="sv ${cls||''}">${val}</div>${sub?`<div class="ss">${sub}</div>`:''}`;
}

// ─────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────
function setDF(f,btn){
  dFilt=f;
  document.querySelectorAll('#dash-fb .f-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');renderDash();
}

function renderDash(){
  const fin=calcFin(dFilt);
  const now=new Date();
  function inR(ds){
    if(!dFilt||dFilt==='all')return true;
    const d=new Date(ds+'T00:00:00');
    if(dFilt==='today')return d.toDateString()===now.toDateString();
    if(dFilt==='week'){const s=new Date(now);s.setDate(now.getDate()-7);return d>=s;}
    if(dFilt==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(dFilt==='year')return d.getFullYear()===now.getFullYear();
    return true;
  }
  const prods=DB.get('products');
  const lowStock=prods.filter(p=>(p.stock||0)<=(p.minStock||5)&&p.status==='ativo');
  const totalStock=prods.reduce((s,p)=>s+(p.stock||0),0);
  const totalProduced=DB.get('batches').filter(b=>inR(b.date)).reduce((s,b)=>s+(b.qty||0),0);
  const activeSales=DB.get('sales').filter(v=>v.status!=='cancelado'&&inR(v.date));
  const totalSold=activeSales.reduce((s,v)=>s+v.items.reduce((ss,i)=>ss+(i.qty||0),0),0);
  const totalGifted=DB.get('gifts').filter(g=>inR(g.date)).reduce((s,g)=>s+(g.qty||0),0);

  document.getElementById('dash-stats').innerHTML=`
    ${statCard('Receita de Vendas',money(fin.rev),'',ico.dollar,true,'pos')}
    ${statCard('Custo Vendidos',money(fin.cogs),'',ico.card,false,'')}
    ${statCard('Lucro Bruto',money(fin.gross),'',ico.trending,true,fin.gross>=0?'pos':'neg')}
    ${statCard('Despesas Op.',money(fin.expTotal),'',ico.card,false,'neg')}
    ${statCard('Resultado Final',money(fin.net),'',ico.trending,true,fin.net>=0?'pos':'neg')}
    ${statCard('Em Estoque',totalStock,money(fin.stockVal)+' em valor',ico.box,false,'')}
    ${statCard('Produzidos',totalProduced,'unidades',ico.gear,false,'')}
    ${statCard('Vendidos',totalSold,'unidades',ico.cart,false,'')}
    ${statCard('Brindes',totalGifted,money(fin.giftCost)+' em custo',ico.gift,false,'')}
    ${statCard('Estoque Baixo',lowStock.length,lowStock.length>0?'produtos abaixo do mínimo':'tudo em ordem',ico.alert,lowStock.length>0,lowStock.length>0?'neg':'')}
  `;

  // Low stock card
  const lc=document.getElementById('low-card');
  const lb=document.getElementById('low-body');
  if(!lowStock.length){lc.style.display='none';}
  else{
    lc.style.display='';
    lb.innerHTML=`<div class="tw"><table><thead><tr><th>Produto</th><th>Cor/Tam.</th><th>Estoque</th><th>Mínimo</th><th>Status</th></tr></thead><tbody>${
      lowStock.map(p=>`<tr><td><strong>${p.name}</strong></td><td>${[p.color,p.size].filter(Boolean).join(' / ')||'—'}</td><td>${p.stock||0}</td><td>${p.minStock||5}</td><td>${(p.stock||0)===0?'<span class="badge berr">Sem estoque</span>':'<span class="badge bwarn">Baixo</span>'}</td></tr>`).join('')
    }</tbody></table></div>`;
  }

  // Recent sales
  const rs=document.getElementById('recent-sales');
  const rSales=[...DB.get('sales')].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  rs.innerHTML=rSales.length?`<div class="tw"><table><thead><tr><th>Código</th><th>Data</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead><tbody>${
    rSales.map(s=>`<tr><td><code>${s.code}</code></td><td>${fmtD(s.date)}</td><td>${s.clientName||'—'}</td><td><strong>${money(s.totalRevenue)}</strong></td><td>${sbadge(s.status)}</td></tr>`).join('')
  }</tbody></table></div>`:'<div class="empty"><p>Nenhuma venda registrada ainda.</p></div>';

  buildSalesChart();buildStockChart();
}

function buildSalesChart(){
  const sales=DB.get('sales').filter(s=>s.status!=='cancelado');
  const mo={};
  sales.forEach(s=>{const m=s.date.slice(0,7);if(!mo[m])mo[m]={r:0,c:0};mo[m].r+=s.totalRevenue||0;mo[m].c+=s.totalCost||0;});
  const labs=Object.keys(mo).sort().slice(-6);
  const ctx=document.getElementById('ch-sales').getContext('2d');
  if(chSales)chSales.destroy();
  if(!labs.length)return;
  chSales=new Chart(ctx,{type:'bar',data:{
    labels:labs.map(l=>{const[y,m]=l.split('-');return m+'/'+y.slice(2);}),
    datasets:[
      {label:'Receita',data:labs.map(l=>mo[l].r),backgroundColor:'rgba(53,39,31,.25)',borderColor:'rgba(53,39,31,.6)',borderWidth:2,borderRadius:4},
      {label:'Custos',data:labs.map(l=>mo[l].c),backgroundColor:'rgba(116,104,93,.18)',borderColor:'rgba(116,104,93,.5)',borderWidth:2,borderRadius:4},
      {label:'Lucro',data:labs.map(l=>mo[l].r-mo[l].c),type:'line',fill:false,borderColor:'rgba(77,122,77,.8)',borderWidth:2,pointBackgroundColor:'rgba(77,122,77,.8)',tension:.4}
    ]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"'Lato',sans-serif",size:11},color:'#74685D'}}},scales:{x:{ticks:{color:'#74685D',font:{size:11}},grid:{color:'rgba(0,0,0,.04)'}},y:{ticks:{color:'#74685D',font:{size:11},callback:v=>'R$'+n(v).toFixed(0)},grid:{color:'rgba(0,0,0,.04)'}}}}});
}

function buildStockChart(){
  const prods=DB.get('products').filter(p=>p.status==='ativo'&&(p.stock||0)>0);
  const ctx=document.getElementById('ch-stock').getContext('2d');
  if(chStock)chStock.destroy();
  if(!prods.length)return;
  const clrs=['rgba(53,39,31,.7)','rgba(116,104,93,.6)','rgba(232,223,206,.9)','rgba(53,39,31,.4)','rgba(92,61,46,.6)','rgba(116,104,93,.35)'];
  chStock=new Chart(ctx,{type:'doughnut',data:{
    labels:prods.map(p=>p.name+(p.color?' – '+p.color:'')),
    datasets:[{data:prods.map(p=>p.stock||0),backgroundColor:prods.map((_,i)=>clrs[i%clrs.length]),borderColor:'#F8F6EC',borderWidth:2}]
  },options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{font:{family:"'Lato',sans-serif",size:11},color:'#74685D',boxWidth:12}}}}});
}

// ─────────────────────────────────────────────────
//  PRODUCTS
// ─────────────────────────────────────────────────
function setPF(f,btn){pFilt=f;document.querySelectorAll('#prod-fb .f-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderProds();}

function renderProds(){
  const q=(document.getElementById('prod-search')?.value||'').toLowerCase();
  let prods=DB.get('products').filter(p=>{
    if(pFilt!=='all'&&p.status!==pFilt)return false;
    if(q&&!`${p.name} ${p.sku||''} ${p.color||''} ${p.category||''}`.toLowerCase().includes(q))return false;
    return true;
  });
  const tb=document.getElementById('prod-tb'),em=document.getElementById('prod-empty');
  if(!prods.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  tb.innerHTML=prods.map(p=>{
    const ac=avgCost(p.id),mg=p.salePrice>0?((p.salePrice-ac)/p.salePrice*100).toFixed(1):0;
    const st=(p.stock||0)===0?'out':(p.stock||0)<=(p.minStock||5)?'lw':'ok';
    const sb=st==='ok'?'<span class="badge bok">OK</span>':st==='lw'?'<span class="badge bwarn">Baixo</span>':'<span class="badge berr">Zerado</span>';
    return`<tr><td><strong>${p.name}</strong><div style="font-size:11px;color:var(--text2)">${p.category||''}</div></td>
    <td><code>${p.sku||'—'}</code></td>
    <td>${[p.color,p.size].filter(Boolean).join(' / ')||'—'}</td>
    <td>${money(p.salePrice)}</td>
    <td>${money(ac)}<div style="font-size:11px;color:var(--text2)">${mg}% margem</div></td>
    <td><span class="sdot ${st}"></span>${p.stock||0} ${sb}</td>
    <td><span class="badge ${p.status==='ativo'?'bok':'bneu'}">${p.status}</span></td>
    <td><div class="ra">${btnEd('editProd',''+p.id)}${btnDel('delProd',''+p.id)}</div></td></tr>`;
  }).join('');
}

function openProdModal(p=null){
  document.getElementById('prod-modal-title').textContent=p?'Editar Produto':'Novo Produto';
  document.getElementById('p-id').value=p?.id||'';
  document.getElementById('p-name').value=p?.name||'';
  document.getElementById('p-cat').value=p?.category||'';
  document.getElementById('p-sku').value=p?.sku||'';
  document.getElementById('p-color').value=p?.color||'';
  document.getElementById('p-size').value=p?.size||'';
  document.getElementById('p-price').value=p?.salePrice||'';
  document.getElementById('p-cost').value=p?.productionCost||'';
  document.getElementById('p-min').value=p?.minStock||5;
  document.getElementById('p-status').value=p?.status||'ativo';
  document.getElementById('p-desc').value=p?.description||'';
  openOv('ov-product');
}
function editProd(id){openProdModal(DB.one('products',id));}

function saveProd(){
  const id=document.getElementById('p-id').value;
  const name=document.getElementById('p-name').value.trim();
  const category=document.getElementById('p-cat').value;
  const sku=document.getElementById('p-sku').value.trim();
  const color=document.getElementById('p-color').value.trim();
  const size=document.getElementById('p-size').value;
  const salePrice=n(document.getElementById('p-price').value);
  const productionCost=n(document.getElementById('p-cost').value);
  const minStock=parseInt(document.getElementById('p-min').value)||0;
  const status=document.getElementById('p-status').value;
  const description=document.getElementById('p-desc').value.trim();
  if(!name)return toast('Nome obrigatório.','err');
  if(!category)return toast('Selecione uma categoria.','err');
  if(salePrice<=0)return toast('Informe um preço de venda.','err');
  const ex=id?DB.one('products',id):null;
  DB.save('products',{id:id||uid(),name,category,sku,color,size,salePrice,productionCost,minStock,status,description,stock:ex?.stock||0,createdAt:ex?.createdAt||today()});
  closeOv('ov-product');toast(id?'Produto atualizado.':'Produto cadastrado.','ok');renderProds();
}

function delProd(id){showConfirm('Excluir Produto','Deseja excluir este produto? Esta ação não pode ser desfeita.',()=>{DB.del('products',id);toast('Produto excluído.','ok');renderProds();});}

// ─────────────────────────────────────────────────
//  MATERIALS
// ─────────────────────────────────────────────────
function renderMats(){
  const mats=DB.get('materials');
  const tb=document.getElementById('mat-tb'),em=document.getElementById('mat-empty');
  if(!mats.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  tb.innerHTML=mats.map(m=>`<tr>
    <td><strong>${m.name}</strong></td><td>${m.unit}</td>
    <td><strong>${m.availableQty}</strong> ${m.unit}</td>
    <td>${m.purchasedQty} ${m.unit}</td>
    <td>${money(m.costPerUnit)}</td>
    <td>${m.supplier||'—'}</td>
    <td>${fmtD(m.purchaseDate)}</td>
    <td><div class="ra">${btnEd('editMat',''+m.id)}${btnDel('delMat',''+m.id)}</div></td></tr>`).join('');
}

function openMatModal(m=null){
  document.getElementById('mat-modal-title').textContent=m?'Editar Material':'Novo Material';
  document.getElementById('m-id').value=m?.id||'';
  document.getElementById('m-name').value=m?.name||'';
  document.getElementById('m-unit').value=m?.unit||'metros';
  document.getElementById('m-qty').value=m?.purchasedQty||'';
  document.getElementById('m-price').value=m?.totalCost||'';
  document.getElementById('m-supplier').value=m?.supplier||'';
  document.getElementById('m-date').value=m?.purchaseDate||today();
  document.getElementById('m-cpu').textContent=money(m?.costPerUnit||0);
  openOv('ov-material');
}
function editMat(id){openMatModal(DB.one('materials',id));}

function calcMatCPU(){
  const q=n(document.getElementById('m-qty').value);
  const p=n(document.getElementById('m-price').value);
  document.getElementById('m-cpu').textContent=money(q>0?p/q:0);
}

function saveMat(){
  const id=document.getElementById('m-id').value;
  const name=document.getElementById('m-name').value.trim();
  const unit=document.getElementById('m-unit').value;
  const purchasedQty=n(document.getElementById('m-qty').value);
  const totalCost=n(document.getElementById('m-price').value);
  const supplier=document.getElementById('m-supplier').value.trim();
  const purchaseDate=document.getElementById('m-date').value;
  if(!name)return toast('Nome obrigatório.','err');
  if(purchasedQty<=0)return toast('Informe a quantidade comprada.','err');
  const costPerUnit=purchasedQty>0?totalCost/purchasedQty:0;
  const ex=id?DB.one('materials',id):null;
  const diff=ex?purchasedQty-ex.purchasedQty:purchasedQty;
  const availableQty=ex?Math.max(0,Math.min(ex.availableQty+diff,purchasedQty)):purchasedQty;
  DB.save('materials',{id:id||uid(),name,unit,purchasedQty,availableQty,totalCost,costPerUnit,supplier,purchaseDate});
  closeOv('ov-material');toast(id?'Material atualizado.':'Material cadastrado.','ok');renderMats();
}

function delMat(id){showConfirm('Excluir Material','Deseja excluir este material?',()=>{DB.del('materials',id);toast('Material excluído.','ok');renderMats();});}

// ─────────────────────────────────────────────────
//  PRODUCTION BATCHES
// ─────────────────────────────────────────────────
function renderBatches(){
  const batches=[...DB.get('batches')].sort((a,b)=>b.date.localeCompare(a.date));
  const tb=document.getElementById('batch-tb'),em=document.getElementById('batch-empty');
  if(!batches.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  tb.innerHTML=batches.map(b=>`<tr>
    <td><code>${b.code}</code></td>
    <td><strong>${b.productName}</strong><div style="font-size:11px;color:var(--text2)">${[b.color,b.size].filter(Boolean).join(' / ')}</div></td>
    <td>${fmtD(b.date)}</td><td><strong>${b.qty}</strong></td>
    <td>${money(b.totalCost)}</td><td>${money(b.unitCost)}</td>
    <td><div class="ra">
      <button class="btn btn-g btn-ic btn-sm" onclick="viewBatch('${b.id}')" title="Ver">${svgI('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>')}</button>
      ${btnDel('delBatch',''+b.id)}
    </div></td></tr>`).join('');
}

function openBatchModal(){
  document.getElementById('b-id').value='';
  document.getElementById('b-code').value='';
  document.getElementById('b-qty').value='';
  document.getElementById('b-date').value=today();
  document.getElementById('b-labor').value='';
  document.getElementById('b-other').value='';
  document.getElementById('b-notes').value='';
  const prods=DB.get('products').filter(p=>p.status==='ativo');
  document.getElementById('b-prod').innerHTML='<option value="">Selecione o produto...</option>'+
    prods.map(p=>`<option value="${p.id}">${p.name}${p.color?' – '+p.color:''}${p.size?' / '+p.size:''}</option>`).join('');
  bMats=[];renderBM();calcBatch();openOv('ov-production');
}

function addBM(){
  const mats=DB.get('materials');
  if(!mats.length)return toast('Nenhum material cadastrado.','warn');
  bMats.push({matId:'',qty:0,cost:0});renderBM();
}

function renderBM(){
  const mats=DB.get('materials');
  const el=document.getElementById('bm-list');
  if(!bMats.length){el.innerHTML='<div style="font-size:13px;color:var(--text2);padding:8px 0">Nenhum material — custo será R$ 0,00.</div>';return;}
  el.innerHTML=bMats.map((bm,i)=>`<div class="bmr">
    <div class="fgi" style="margin:0"><select onchange="updBMmat(${i},this.value)">
      <option value="">Selecione...</option>
      ${mats.map(m=>`<option value="${m.id}" ${bm.matId===m.id?'selected':''}>${m.name} (${m.availableQty} ${m.unit} disp.)</option>`).join('')}
    </select></div>
    <div class="fgi" style="margin:0"><input type="number" min="0" step="0.01" placeholder="Qtd" value="${bm.qty||''}" onchange="updBMqty(${i},this.value)"></div>
    <div style="padding:8px 10px;background:var(--bg2);border-radius:var(--rs);font-size:13px;color:var(--text2);border:1px solid var(--blt)">${money(bm.cost)}</div>
    <button class="btn btn-g btn-ic btn-sm" onclick="rmBM(${i})">${svgI('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}</button>
  </div>`).join('');
}

function updBMmat(i,v){bMats[i].matId=v;const m=DB.one('materials',v);if(m)bMats[i].cost=m.costPerUnit*(bMats[i].qty||0);renderBM();calcBatch();}
function updBMqty(i,v){bMats[i].qty=n(v);const m=DB.one('materials',bMats[i].matId);if(m)bMats[i].cost=m.costPerUnit*bMats[i].qty;renderBM();calcBatch();}
function rmBM(i){bMats.splice(i,1);renderBM();calcBatch();}

function calcBatch(){
  const mc=bMats.reduce((s,bm)=>s+(bm.cost||0),0);
  const lc=n(document.getElementById('b-labor')?.value);
  const oc=n(document.getElementById('b-other')?.value);
  const tc=mc+lc+oc;
  const qty=parseInt(document.getElementById('b-qty')?.value)||0;
  document.getElementById('b-mat-cost').textContent=money(mc);
  document.getElementById('b-lab-cost').textContent=money(lc);
  document.getElementById('b-oth-cost').textContent=money(oc);
  document.getElementById('b-total').textContent=money(tc);
  document.getElementById('b-unit').textContent=money(qty>0?tc/qty:0);
}

function saveBatch(){
  const productId=document.getElementById('b-prod').value;
  const qty=parseInt(document.getElementById('b-qty').value)||0;
  const date=document.getElementById('b-date').value;
  const labor=n(document.getElementById('b-labor').value);
  const other=n(document.getElementById('b-other').value);
  const notes=document.getElementById('b-notes').value.trim();
  let code=document.getElementById('b-code').value.trim();
  if(!productId)return toast('Selecione um produto.','err');
  if(qty<=0)return toast('Informe a quantidade produzida.','err');
  if(!date)return toast('Informe a data.','err');
  const product=DB.one('products',productId);
  if(!product)return toast('Produto não encontrado.','err');
  // Check materials
  for(const bm of bMats){
    if(!bm.matId||!bm.qty)continue;
    const m=DB.one('materials',bm.matId);
    if(m&&m.availableQty<bm.qty)return toast(`Material "${m.name}" insuficiente. Disponível: ${m.availableQty} ${m.unit}.`,'err');
  }
  const matCost=bMats.reduce((s,bm)=>s+(bm.cost||0),0);
  const totalCost=matCost+labor+other;
  const unitCost=qty>0?totalCost/qty:0;
  if(!code){const cnt=DB.get('batches').length+1;code=`LOTE-${String(cnt).padStart(3,'0')}`;}
  const batch={id:uid(),code,productId,productName:product.name,color:product.color,size:product.size,qty,date,materials:bMats.filter(bm=>bm.matId&&bm.qty>0).map(bm=>({...bm})),laborCost:labor,otherCost:other,totalCost,unitCost,notes,createdAt:today()};
  DB.save('batches',batch);
  // Deduct materials
  for(const bm of batch.materials){const m=DB.one('materials',bm.matId);if(m){m.availableQty=Math.max(0,m.availableQty-bm.qty);DB.save('materials',m);}}
  // Add stock
  product.stock=(product.stock||0)+qty;DB.save('products',product);
  // Movement
  addMov({productId,productName:product.name,type:'entrada',subtype:'producao',qty,date,unitCost,totalCost,ref:code,batchId:batch.id});
  closeOv('ov-production');toast(`Lote ${code} finalizado! +${qty} unidades.`,'ok');renderBatches();
}

function viewBatch(id){
  const b=DB.one('batches',id);if(!b)return;
  const mList=b.materials.map(bm=>{const m=DB.one('materials',bm.matId);return`<div class="sr"><span>${m?.name||'Material'} (${bm.qty} ${m?.unit||'un.'})</span><span>${money(bm.cost)}</span></div>`;}).join('');
  document.getElementById('view-title').textContent='Lote: '+b.code;
  document.getElementById('view-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div class="sl">Produto</div><div>${b.productName}</div></div>
      <div><div class="sl">Data</div><div>${fmtD(b.date)}</div></div>
      <div><div class="sl">Quantidade</div><div><strong>${b.qty}</strong> unidades</div></div>
      <div><div class="sl">Custo Unitário</div><div><strong>${money(b.unitCost)}</strong></div></div>
    </div>
    <div class="sum">${mList||'<div class="sr"><span>Sem materiais registrados</span></div>'}
      ${b.laborCost?`<div class="sr"><span>Mão de obra</span><span>${money(b.laborCost)}</span></div>`:''}
      ${b.otherCost?`<div class="sr"><span>Outros custos</span><span>${money(b.otherCost)}</span></div>`:''}
      <div class="sr tot"><span>Custo total</span><span>${money(b.totalCost)}</span></div>
    </div>
    ${b.notes?`<div style="margin-top:10px;font-size:13px;color:var(--text2)">Obs: ${b.notes}</div>`:''}`;
  openOv('ov-view');
}

function delBatch(id){showConfirm('Excluir Lote','Esta ação não desfaz o estoque adicionado. Continuar?',()=>{DB.del('batches',id);toast('Lote excluído.','ok');renderBatches();});}

// ─────────────────────────────────────────────────
//  MOVEMENTS
// ─────────────────────────────────────────────────
function addMov(d){DB.save('movements',{id:uid(),productId:d.productId,productName:d.productName,type:d.type,subtype:d.subtype||'',qty:d.qty,date:d.date||today(),unitCost:d.unitCost||0,totalCost:d.totalCost||0,ref:d.ref||'',batchId:d.batchId||''});}

function switchTab(sec,tab,btn){
  document.querySelectorAll(`#sec-${sec} .tab-btn`).forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`#sec-${sec} .tab-pane`).forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');document.getElementById(`${sec}-${tab}`).classList.add('active');
  if(tab==='movements')renderMvs();
}

function renderStock(){
  const prods=DB.get('products').filter(p=>p.status==='ativo');
  const tot=prods.reduce((s,p)=>s+(p.stock||0),0);
  const val=prods.reduce((s,p)=>s+(p.stock||0)*avgCost(p.id),0);
  const low=prods.filter(p=>(p.stock||0)<=(p.minStock||5)&&(p.stock||0)>0).length;
  const emp=prods.filter(p=>(p.stock||0)===0).length;
  document.getElementById('stock-stats').innerHTML=`
    ${statCard('Total em Estoque',tot,'unidades',ico.box,false,'')}
    ${statCard('Valor em Estoque',money(val),'',ico.dollar,false,'')}
    ${statCard('Estoque Baixo',low,'produtos',ico.alert,low>0,low>0?'neg':'')}
    ${statCard('Sem Estoque',emp,'produtos',ico.alert,emp>0,emp>0?'neg':'')}
  `;
  // Position
  document.getElementById('stock-tb').innerHTML=prods.map(p=>{
    const ac=avgCost(p.id),sv=(p.stock||0)*ac;
    const st=(p.stock||0)===0?'out':(p.stock||0)<=(p.minStock||5)?'lw':'ok';
    return`<tr><td><strong>${p.name}</strong><div style="font-size:11px;color:var(--text2)">${p.category||''}</div></td>
    <td>${[p.color,p.size].filter(Boolean).join(' / ')||'—'}</td>
    <td><strong>${p.stock||0}</strong></td><td>${p.minStock||5}</td>
    <td>${st==='ok'?'<span class="badge bok">Normal</span>':st==='lw'?'<span class="badge bwarn">Baixo</span>':'<span class="badge berr">Zerado</span>'}</td>
    <td>${money(sv)}</td></tr>`;
  }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">Nenhum produto ativo.</td></tr>';
  // Populate adj dropdown
  const adj=document.getElementById('adj-prod');
  if(adj)adj.innerHTML='<option value="">Selecione...</option>'+prods.map(p=>`<option value="${p.id}">${p.name}${p.color?' – '+p.color:''}</option>`).join('');
  document.getElementById('adj-date').value=today();
}

function renderMvs(){
  const mvs=[...DB.get('movements')].sort((a,b)=>b.date.localeCompare(a.date));
  const tmap={entrada:'<span class="badge bok">Entrada</span>',venda:'<span class="badge binfo">Venda</span>',brinde:'<span class="badge bwarn">Brinde</span>',perda:'<span class="badge berr">Perda</span>',ajuste:'<span class="badge bneu">Ajuste</span>'};
  document.getElementById('mv-tb').innerHTML=mvs.map(m=>`<tr>
    <td>${fmtD(m.date)}</td><td>${m.productName}</td><td>${tmap[m.type]||m.type}</td>
    <td>${m.type==='entrada'?'+':'-'}${Math.abs(m.qty)}</td><td>${money(m.totalCost)}</td>
    <td style="font-size:12px;color:var(--text2)">${m.ref||'—'}</td></tr>`).join()||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">Nenhuma movimentação.</td></tr>';
}

function openAdjModal(){
  renderStock();openOv('ov-adj');
}

function saveAdj(){
  const productId=document.getElementById('adj-prod').value;
  const type=document.getElementById('adj-type').value;
  const qty=parseInt(document.getElementById('adj-qty').value)||0;
  const date=document.getElementById('adj-date').value||today();
  const reason=document.getElementById('adj-reason').value.trim();
  if(!productId)return toast('Selecione um produto.','err');
  if(qty<=0)return toast('Informe uma quantidade válida.','err');
  if(!reason)return toast('Informe o motivo.','err');
  const p=DB.one('products',productId);if(!p)return;
  if(type==='saida'&&(p.stock||0)<qty)return toast(`Estoque insuficiente. Disponível: ${p.stock||0}.`,'err');
  const delta=type==='entrada'?qty:-qty;
  p.stock=Math.max(0,(p.stock||0)+delta);DB.save('products',p);
  const uc=avgCost(productId);
  addMov({productId,productName:p.name,type:'ajuste',qty:Math.abs(delta),date,unitCost:uc,totalCost:Math.abs(delta)*uc,ref:'Ajuste: '+reason});
  closeOv('ov-adj');toast(`Ajuste: ${type==='entrada'?'+':'-'}${qty} unidade(s).`,'ok');renderStock();
}

// ─────────────────────────────────────────────────
//  SALES
// ─────────────────────────────────────────────────
function setSF(f,btn){sFilt=f;document.querySelectorAll('#sale-fb .f-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderSales();}

function sbadge(s){const m={pago:'<span class="badge bok">Pago</span>',pendente:'<span class="badge bwarn">Pendente</span>',cancelado:'<span class="badge berr">Cancelado</span>',devolvido:'<span class="badge bneu">Devolvido</span>'};return m[s]||`<span class="badge bneu">${s}</span>`;}

function renderSales(){
  let sales=DB.get('sales');
  if(sFilt!=='all')sales=sales.filter(s=>s.status===sFilt);
  sales=[...sales].sort((a,b)=>b.date.localeCompare(a.date));
  const tb=document.getElementById('sales-tb'),em=document.getElementById('sales-empty');
  if(!sales.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  tb.innerHTML=sales.map(s=>`<tr>
    <td><code>${s.code}</code></td><td>${fmtD(s.date)}</td>
    <td>${s.clientName||'—'}</td><td>${s.items.length} item(s)</td>
    <td><strong>${money(s.totalRevenue)}</strong></td><td>${s.payment}</td>
    <td>${sbadge(s.status)}</td>
    <td><div class="ra">
      <button class="btn btn-g btn-ic btn-sm" onclick="viewSale('${s.id}')">${svgI('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>')}</button>
      ${s.status==='pago'||s.status==='pendente'?`<button class="btn btn-g btn-ic btn-sm" onclick="cancelSale('${s.id}')" title="Cancelar">${svgI('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>')}</button>`:''}
      ${btnDel('delSale',''+s.id)}
    </div></td></tr>`).join('');
}

function openSaleModal(){
  document.getElementById('sale-modal-title').textContent='Nova Venda';
  document.getElementById('s-id').value='';
  document.getElementById('s-date').value=today();
  document.getElementById('s-disc').value='0';
  document.getElementById('s-notes').value='';
  // Populate clients
  const cli=DB.get('clients');
  document.getElementById('s-client').innerHTML='<option value="">Anônimo</option>'+cli.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  sItems=[];renderSI();calcSale();openOv('ov-sale');
}

function addSI(){
  const prods=DB.get('products').filter(p=>p.status==='ativo'&&(p.stock||0)>0);
  if(!prods.length)return toast('Nenhum produto com estoque disponível.','warn');
  sItems.push({productId:prods[0].id,qty:1,unitPrice:prods[0].salePrice||0,subtotal:prods[0].salePrice||0});
  renderSI();calcSale();
}

function renderSI(){
  const prods=DB.get('products').filter(p=>p.status==='ativo');
  const el=document.getElementById('s-items');
  if(!sItems.length){el.innerHTML='<div style="padding:10px;font-size:13px;color:var(--text2)">Adicione ao menos um item.</div>';return;}
  el.innerHTML=sItems.map((si,i)=>`<div class="sir">
    <select onchange="updSIprod(${i},this.value)">
      ${prods.map(p=>`<option value="${p.id}" ${si.productId===p.id?'selected':''}>${p.name}${p.color?' – '+p.color:''} (est:${p.stock||0})</option>`).join('')}
    </select>
    <input type="number" min="1" value="${si.qty}" onchange="updSIqty(${i},this.value)">
    <div class="ig"><span class="ip">R$</span><input type="number" min="0" step="0.01" value="${si.unitPrice}" onchange="updSIprice(${i},this.value)"></div>
    <div style="font-size:13px;font-weight:600;padding:8px 0">${money(si.subtotal)}</div>
    <button class="btn btn-g btn-ic btn-sm" onclick="rmSI(${i})">${svgI('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}</button>
  </div>`).join('');
}

function updSIprod(i,v){const p=DB.one('products',v);sItems[i].productId=v;sItems[i].unitPrice=p?.salePrice||0;sItems[i].subtotal=sItems[i].qty*(p?.salePrice||0);renderSI();calcSale();}
function updSIqty(i,v){sItems[i].qty=parseInt(v)||1;sItems[i].subtotal=sItems[i].qty*sItems[i].unitPrice;renderSI();calcSale();}
function updSIprice(i,v){sItems[i].unitPrice=n(v);sItems[i].subtotal=sItems[i].qty*n(v);renderSI();calcSale();}
function rmSI(i){sItems.splice(i,1);renderSI();calcSale();}

function calcSale(){
  const sub=sItems.reduce((s,i)=>s+i.subtotal,0);
  const disc=n(document.getElementById('s-disc')?.value);
  document.getElementById('s-sub').textContent=money(sub);
  document.getElementById('s-dv').textContent=money(disc);
  document.getElementById('s-total').textContent=money(sub-disc);
}

function saveSale(){
  const id=document.getElementById('s-id').value;
  const date=document.getElementById('s-date').value;
  const clientId=document.getElementById('s-client').value;
  const payment=document.getElementById('s-pay').value;
  const status=document.getElementById('s-status').value;
  const disc=n(document.getElementById('s-disc').value);
  const notes=document.getElementById('s-notes').value.trim();
  if(!date)return toast('Informe a data.','err');
  if(!sItems.length)return toast('Adicione ao menos um item.','err');
  // Validate stock
  for(const si of sItems){
    const p=DB.one('products',si.productId);
    if(!p)return toast('Produto não encontrado.','err');
    if((p.stock||0)<si.qty)return toast(`Estoque insuficiente para "${p.name}". Disponível: ${p.stock||0}.`,'err');
  }
  const client=clientId?DB.one('clients',clientId):null;
  const sub=sItems.reduce((s,i)=>s+i.subtotal,0);
  const totalRevenue=sub-disc;
  // Calc COGS
  const itemsWithCost=sItems.map(si=>{const uc=avgCost(si.productId);return{...si,unitCost:uc,itemCost:uc*si.qty};});
  const totalCost=itemsWithCost.reduce((s,i)=>s+i.itemCost,0);
  const cnt=DB.get('sales').length+1;
  const code=`VENDA-${String(cnt).padStart(3,'0')}`;
  const sale={id:id||uid(),code,date,clientId,clientName:client?.name||'',payment,status,items:itemsWithCost,totalRevenue,totalCost,discount:disc,notes,createdAt:today()};
  DB.save('sales',sale);
  // Deduct stock + movements
  for(const si of sale.items){
    const p=DB.one('products',si.productId);
    if(p){p.stock=Math.max(0,(p.stock||0)-si.qty);DB.save('products',p);}
    addMov({productId:si.productId,productName:DB.one('products',si.productId)?.name||'',type:'venda',qty:si.qty,date,unitCost:si.unitCost,totalCost:si.itemCost,ref:code});
  }
  // Update client purchases
  if(client){client.totalPurchases=(client.totalPurchases||0)+totalRevenue;client.purchaseCount=(client.purchaseCount||0)+1;DB.save('clients',client);}
  closeOv('ov-sale');toast(`Venda ${code} registrada! ${money(totalRevenue)}`,'ok');renderSales();
}

function viewSale(id){
  const s=DB.one('sales',id);if(!s)return;
  document.getElementById('view-title').textContent='Venda: '+s.code;
  document.getElementById('view-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div class="sl">Data</div><div>${fmtD(s.date)}</div></div>
      <div><div class="sl">Status</div><div>${sbadge(s.status)}</div></div>
      <div><div class="sl">Cliente</div><div>${s.clientName||'Anônimo'}</div></div>
      <div><div class="sl">Pagamento</div><div>${s.payment}</div></div>
    </div>
    <div class="sih"><div>Produto</div><div>Qtd</div><div>Preço</div><div>Subtotal</div><div></div></div>
    ${s.items.map(i=>`<div class="sir"><div>${DB.one('products',i.productId)?.name||'—'}</div><div>${i.qty}</div><div>${money(i.unitPrice)}</div><div>${money(i.subtotal)}</div><div></div></div>`).join('')}
    <div class="sum" style="margin-top:12px">
      <div class="sr"><span>Subtotal</span><span>${money(s.items.reduce((t,i)=>t+i.subtotal,0))}</span></div>
      ${s.discount?`<div class="sr"><span>Desconto</span><span>-${money(s.discount)}</span></div>`:''}
      <div class="sr tot"><span>Total</span><span>${money(s.totalRevenue)}</span></div>
      <div class="sr" style="margin-top:4px"><span>Custo dos produtos</span><span>${money(s.totalCost)}</span></div>
      <div class="sr"><span>Lucro bruto</span><span style="color:var(--ok)">${money(s.totalRevenue-s.totalCost)}</span></div>
    </div>
    ${s.notes?`<div style="margin-top:10px;font-size:13px;color:var(--text2)">Obs: ${s.notes}</div>`:''}`;
  openOv('ov-view');
}

function cancelSale(id){
  showConfirm('Cancelar Venda','Cancelar a venda devolve os produtos ao estoque.',()=>{
    const s=DB.one('sales',id);if(!s)return;
    s.status='cancelado';DB.save('sales',s);
    // Restore stock
    for(const si of s.items){
      const p=DB.one('products',si.productId);
      if(p){p.stock=(p.stock||0)+si.qty;DB.save('products',p);}
      addMov({productId:si.productId,productName:DB.one('products',si.productId)?.name||'',type:'entrada',subtype:'devolucao',qty:si.qty,date:today(),unitCost:si.unitCost||0,totalCost:(si.itemCost||0),ref:'Cancelamento: '+s.code});
    }
    toast('Venda cancelada. Estoque restaurado.','ok');renderSales();
  });
}

function delSale(id){showConfirm('Excluir Venda','Excluir o registro da venda? O estoque NÃO será revertido.',()=>{DB.del('sales',id);toast('Registro excluído.','ok');renderSales();});}

// ─────────────────────────────────────────────────
//  CLIENTS
// ─────────────────────────────────────────────────
function renderClients(){
  const clients=DB.get('clients');
  const tb=document.getElementById('clients-tb'),em=document.getElementById('clients-empty');
  if(!clients.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  tb.innerHTML=clients.map(c=>`<tr>
    <td><strong>${c.name}</strong></td>
    <td>${c.phone||'—'}</td><td>${c.email||'—'}</td>
    <td>${c.purchaseCount||0}</td><td>${money(c.totalPurchases||0)}</td>
    <td>${fmtD(c.createdAt)}</td>
    <td><div class="ra">${btnEd('editClient',''+c.id)}${btnDel('delClient',''+c.id)}</div></td></tr>`).join('');
}

function openClientModal(c=null){
  document.getElementById('cli-modal-title').textContent=c?'Editar Cliente':'Novo Cliente';
  document.getElementById('c-id').value=c?.id||'';
  document.getElementById('c-name').value=c?.name||'';
  document.getElementById('c-phone').value=c?.phone||'';
  document.getElementById('c-email').value=c?.email||'';
  document.getElementById('c-notes').value=c?.notes||'';
  openOv('ov-client');
}
function editClient(id){openClientModal(DB.one('clients',id));}

function saveClient(){
  const id=document.getElementById('c-id').value;
  const name=document.getElementById('c-name').value.trim();
  if(!name)return toast('Nome obrigatório.','err');
  const ex=id?DB.one('clients',id):null;
  DB.save('clients',{id:id||uid(),name,phone:document.getElementById('c-phone').value.trim(),email:document.getElementById('c-email').value.trim(),notes:document.getElementById('c-notes').value.trim(),totalPurchases:ex?.totalPurchases||0,purchaseCount:ex?.purchaseCount||0,giftCount:ex?.giftCount||0,createdAt:ex?.createdAt||today()});
  closeOv('ov-client');toast(id?'Cliente atualizado.':'Cliente cadastrado.','ok');renderClients();
}

function delClient(id){showConfirm('Excluir Cliente','Deseja excluir este cliente?',()=>{DB.del('clients',id);toast('Cliente excluído.','ok');renderClients();});}

// ─────────────────────────────────────────────────
//  GIFTS
// ─────────────────────────────────────────────────
function renderGifts(){
  const gifts=[...DB.get('gifts')].sort((a,b)=>b.date.localeCompare(a.date));
  // Stats
  const totGifts=gifts.length,totQty=gifts.reduce((s,g)=>s+(g.qty||0),0),totCost=gifts.reduce((s,g)=>s+(g.totalCost||0),0);
  document.getElementById('gift-stats').innerHTML=`
    ${statCard('Total de Registros',totGifts,'brindes',ico.gift,false,'')}
    ${statCard('Unidades Dadas',totQty,'produtos',ico.box,false,'')}
    ${statCard('Custo Total',money(totCost),'em brindes',ico.dollar,true,'neg')}
  `;
  const tb=document.getElementById('gifts-tb'),em=document.getElementById('gifts-empty');
  if(!gifts.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  const rm={divulgacao:'Divulgação',presente_cliente:'Presente',acao_promocional:'Ação promo.',parceria:'Parceria',amostras:'Amostras',outro:'Outro'};
  tb.innerHTML=gifts.map(g=>`<tr>
    <td>${fmtD(g.date)}</td>
    <td>${DB.one('products',g.productId)?.name||'—'}</td>
    <td>${g.qty}</td>
    <td>${g.recipient||g.clientName||'—'}</td>
    <td><span class="badge bneu">${rm[g.reason]||g.reason}</span></td>
    <td style="color:var(--warn);font-weight:600">${money(g.totalCost)}</td>
    <td><div class="ra">${btnDel('delGift',''+g.id)}</div></td></tr>`).join('');
}

function openGiftModal(){
  document.getElementById('g-id').value='';
  document.getElementById('g-date').value=today();
  document.getElementById('g-qty').value='1';
  document.getElementById('g-recip').value='';
  document.getElementById('g-notes').value='';
  document.getElementById('g-cost').textContent='R$ 0,00';
  const prods=DB.get('products').filter(p=>p.status==='ativo'&&(p.stock||0)>0);
  document.getElementById('g-prod').innerHTML='<option value="">Selecione...</option>'+prods.map(p=>`<option value="${p.id}">${p.name}${p.color?' – '+p.color:''} (est:${p.stock||0})</option>`).join('');
  const cli=DB.get('clients');
  document.getElementById('g-client').innerHTML='<option value="">Nenhum</option>'+cli.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  // Batches
  const batches=DB.get('batches');
  document.getElementById('g-batch').innerHTML='<option value="">Auto (custo médio)</option>'+batches.map(b=>`<option value="${b.id}">${b.code} – ${b.productName} (${money(b.unitCost)}/un.)</option>`).join('');
  openOv('ov-gift');
}

function calcGift(){
  const pId=document.getElementById('g-prod').value;
  const qty=parseInt(document.getElementById('g-qty').value)||0;
  const batchId=document.getElementById('g-batch')?.value;
  let uc=0;
  if(batchId){const b=DB.one('batches',batchId);uc=b?.unitCost||0;}
  else if(pId){uc=avgCost(pId);}
  document.getElementById('g-cost').textContent=money(uc*qty);
}

function saveGift(){
  const id=document.getElementById('g-id').value;
  const productId=document.getElementById('g-prod').value;
  const qty=parseInt(document.getElementById('g-qty').value)||0;
  const date=document.getElementById('g-date').value;
  const reason=document.getElementById('g-reason').value;
  const recipient=document.getElementById('g-recip').value.trim();
  const clientId=document.getElementById('g-client').value;
  const batchId=document.getElementById('g-batch').value;
  const notes=document.getElementById('g-notes').value.trim();
  if(!productId)return toast('Selecione um produto.','err');
  if(qty<=0)return toast('Informe a quantidade.','err');
  if(!date)return toast('Informe a data.','err');
  const p=DB.one('products',productId);
  if(!p)return toast('Produto não encontrado.','err');
  if((p.stock||0)<qty)return toast(`Estoque insuficiente. Disponível: ${p.stock||0}.`,'err');
  const client=clientId?DB.one('clients',clientId):null;
  let uc=batchId?(DB.one('batches',batchId)?.unitCost||0):avgCost(productId);
  const totalCost=uc*qty;
  const cnt=DB.get('gifts').length+1;
  const code=`BRINDE-${String(cnt).padStart(3,'0')}`;
  DB.save('gifts',{id:id||uid(),code,productId,productName:p.name,qty,date,reason,recipient,clientId,clientName:client?.name||'',batchId,unitCost:uc,totalCost,notes,createdAt:today()});
  // Deduct stock
  p.stock=Math.max(0,(p.stock||0)-qty);DB.save('products',p);
  addMov({productId,productName:p.name,type:'brinde',qty,date,unitCost:uc,totalCost,ref:code});
  // Update client gift count
  if(client){client.giftCount=(client.giftCount||0)+qty;DB.save('clients',client);}
  closeOv('ov-gift');toast(`Brinde ${code} registrado!`,'ok');renderGifts();
}

function delGift(id){showConfirm('Excluir Brinde','Excluir não reverte o estoque.',()=>{DB.del('gifts',id);toast('Brinde excluído.','ok');renderGifts();});}

// ─────────────────────────────────────────────────
//  LOSSES
// ─────────────────────────────────────────────────
function renderLosses(){
  const losses=[...DB.get('losses')].sort((a,b)=>b.date.localeCompare(a.date));
  const tb=document.getElementById('losses-tb'),em=document.getElementById('losses-empty');
  if(!losses.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  const rm={danificado:'Danificado',defeituoso:'Defeituoso',perdido:'Perdido',vencido:'Vencido',outro:'Outro'};
  tb.innerHTML=losses.map(l=>`<tr>
    <td>${fmtD(l.date)}</td>
    <td>${l.productName||'—'}</td><td>${l.qty}</td>
    <td><span class="badge berr">${rm[l.reason]||l.reason}</span></td>
    <td><code>${l.batchCode||'—'}</code></td>
    <td style="color:var(--err);font-weight:600">${money(l.totalCost)}</td>
    <td><div class="ra">${btnDel('delLoss',''+l.id)}</div></td></tr>`).join('');
}

function openLossModal(){
  document.getElementById('l-id').value='';
  document.getElementById('l-date').value=today();
  document.getElementById('l-qty').value='1';
  document.getElementById('l-notes').value='';
  document.getElementById('l-cost').textContent='R$ 0,00';
  const prods=DB.get('products').filter(p=>p.status==='ativo'&&(p.stock||0)>0);
  document.getElementById('l-prod').innerHTML='<option value="">Selecione...</option>'+prods.map(p=>`<option value="${p.id}">${p.name}${p.color?' – '+p.color:''} (est:${p.stock||0})</option>`).join('');
  openOv('ov-loss');
}

function calcLoss(){
  const pId=document.getElementById('l-prod').value;
  const qty=parseInt(document.getElementById('l-qty').value)||0;
  const uc=pId?avgCost(pId):0;
  document.getElementById('l-cost').textContent=money(uc*qty);
}

function saveLoss(){
  const id=document.getElementById('l-id').value;
  const productId=document.getElementById('l-prod').value;
  const qty=parseInt(document.getElementById('l-qty').value)||0;
  const date=document.getElementById('l-date').value;
  const reason=document.getElementById('l-reason').value;
  const notes=document.getElementById('l-notes').value.trim();
  if(!productId)return toast('Selecione um produto.','err');
  if(qty<=0)return toast('Informe a quantidade.','err');
  if(!date)return toast('Informe a data.','err');
  const p=DB.one('products',productId);
  if(!p)return toast('Produto não encontrado.','err');
  if((p.stock||0)<qty)return toast(`Estoque insuficiente. Disponível: ${p.stock||0}.`,'err');
  const uc=avgCost(productId);
  const totalCost=uc*qty;
  DB.save('losses',{id:id||uid(),productId,productName:p.name,qty,date,reason,unitCost:uc,totalCost,notes,createdAt:today()});
  p.stock=Math.max(0,(p.stock||0)-qty);DB.save('products',p);
  addMov({productId,productName:p.name,type:'perda',qty,date,unitCost:uc,totalCost,ref:'Perda: '+reason});
  closeOv('ov-loss');toast(`Perda de ${qty} unidade(s) registrada.`,'ok');renderLosses();
}

function delLoss(id){showConfirm('Excluir Perda','Excluir não reverte o estoque.',()=>{DB.del('losses',id);toast('Registro excluído.','ok');renderLosses();});}

// ─────────────────────────────────────────────────
//  EXPENSES
// ─────────────────────────────────────────────────
function setEF(f,btn){eFilt=f;document.querySelectorAll('#exp-fb .f-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderExps();}

function renderExps(){
  let exps=DB.get('expenses');
  if(eFilt!=='all')exps=exps.filter(e=>e.category===eFilt);
  exps=[...exps].sort((a,b)=>b.date.localeCompare(a.date));
  const tb=document.getElementById('exp-tb'),em=document.getElementById('exp-empty');
  if(!exps.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  const cm={embalagem:'Embalagem',frete:'Frete',divulgacao:'Divulgação',taxa_pagamento:'Taxa pagamento',equipamento:'Equipamento',energia:'Energia',outro:'Outro'};
  tb.innerHTML=exps.map(e=>`<tr>
    <td>${fmtD(e.date)}</td><td>${e.description}</td>
    <td><span class="badge bneu">${cm[e.category]||e.category}</span></td>
    <td style="font-weight:600">${money(e.value)}</td>
    <td>${e.payment}</td>
    <td>${e.status==='pago'?'<span class="badge bok">Pago</span>':'<span class="badge bwarn">Pendente</span>'}</td>
    <td><div class="ra">${btnEd('editExp',''+e.id)}${btnDel('delExp',''+e.id)}</div></td></tr>`).join('');
}

function openExpModal(e=null){
  document.getElementById('exp-modal-title').textContent=e?'Editar Despesa':'Nova Despesa';
  document.getElementById('e-id').value=e?.id||'';
  document.getElementById('e-desc').value=e?.description||'';
  document.getElementById('e-cat').value=e?.category||'embalagem';
  document.getElementById('e-val').value=e?.value||'';
  document.getElementById('e-date').value=e?.date||today();
  document.getElementById('e-pay').value=e?.payment||'Pix';
  document.getElementById('e-status').value=e?.status||'pago';
  document.getElementById('e-notes').value=e?.notes||'';
  openOv('ov-expense');
}
function editExp(id){openExpModal(DB.one('expenses',id));}

function saveExp(){
  const id=document.getElementById('e-id').value;
  const description=document.getElementById('e-desc').value.trim();
  const category=document.getElementById('e-cat').value;
  const value=n(document.getElementById('e-val').value);
  const date=document.getElementById('e-date').value;
  const payment=document.getElementById('e-pay').value;
  const status=document.getElementById('e-status').value;
  const notes=document.getElementById('e-notes').value.trim();
  if(!description)return toast('Descrição obrigatória.','err');
  if(value<=0)return toast('Informe um valor.','err');
  if(!date)return toast('Informe a data.','err');
  DB.save('expenses',{id:id||uid(),description,category,value,date,payment,status,notes,createdAt:today()});
  closeOv('ov-expense');toast(id?'Despesa atualizada.':'Despesa registrada.','ok');renderExps();
}

function delExp(id){showConfirm('Excluir Despesa','Deseja excluir esta despesa?',()=>{DB.del('expenses',id);toast('Despesa excluída.','ok');renderExps();});}

// ─────────────────────────────────────────────────
//  FINANCIAL
// ─────────────────────────────────────────────────
function setFF(f,btn){fFilt=f;document.querySelectorAll('#sec-financial .f-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderFin();}

function renderFin(){
  const fin=calcFin(fFilt);
  document.getElementById('fin-stats').innerHTML=`
    ${statCard('Receita de Vendas',money(fin.rev),'',ico.dollar,true,'pos')}
    ${statCard('Custo Produtos Vendidos',money(fin.cogs),'',ico.card,false,'')}
    ${statCard('Lucro Bruto',money(fin.gross),'',ico.trending,true,fin.gross>=0?'pos':'neg')}
    ${statCard('Despesas Operacionais',money(fin.expTotal),'',ico.card,false,'neg')}
    ${statCard('Resultado Final',money(fin.net),'',ico.trending,true,fin.net>=0?'pos':'neg')}
    ${statCard('Valor em Estoque',money(fin.stockVal),'não vendido',ico.box,false,'')}
  `;
  // DRE
  document.getElementById('fin-dre').innerHTML=`
    <div class="fr"><span>Receita de Vendas</span><span style="color:var(--ok);font-weight:700">${money(fin.rev)}</span></div>
    <div class="fr ind"><span>(–) Custo dos produtos vendidos</span><span>–${money(fin.cogs)}</span></div>
    <div class="fr" style="font-weight:700"><span>= Lucro Bruto</span><span style="color:${fin.gross>=0?'var(--ok)':'var(--err)'}">${money(fin.gross)}</span></div>
    <div class="fr ind"><span>(–) Despesas operacionais</span><span>–${money(fin.expTotal)}</span></div>
    <div class="fr tot"><span>= Resultado Final</span><span style="color:${fin.net>=0?'var(--ok)':'var(--err)'}">${money(fin.net)}</span></div>
  `;
  // Gifts & losses box
  document.getElementById('fin-gl').innerHTML=`
    <div class="fr"><span>Custo dos Brindes</span><span style="color:var(--warn);font-weight:600">–${money(fin.giftCost)}</span></div>
    <div class="fr"><span>Custo das Perdas</span><span style="color:var(--err);font-weight:600">–${money(fin.lossCost)}</span></div>
    <div class="fr" style="font-size:13px;color:var(--text2)"><span>Total sem retorno</span><span>–${money(fin.giftCost+fin.lossCost)}</span></div>
    <div style="margin-top:16px;padding:12px 14px;background:var(--bg2);border-radius:var(--rs);font-size:13px;color:var(--text2)">
      <strong style="display:block;margin-bottom:4px;color:var(--black)">Valor em Estoque</strong>
      ${money(fin.stockVal)} em produtos ainda não vendidos (não contabilizado como receita nem despesa).
    </div>
  `;
  buildFinChart();buildExpChart();
}

function buildFinChart(){
  const sales=DB.get('sales').filter(s=>s.status!=='cancelado');
  const exps=DB.get('expenses').filter(e=>e.status==='pago');
  const mo={};
  sales.forEach(s=>{const m=s.date.slice(0,7);if(!mo[m])mo[m]={r:0,c:0,e:0};mo[m].r+=s.totalRevenue||0;mo[m].c+=s.totalCost||0;});
  exps.forEach(e=>{const m=e.date.slice(0,7);if(!mo[m])mo[m]={r:0,c:0,e:0};mo[m].e+=e.value||0;});
  const labs=Object.keys(mo).sort().slice(-12);
  const ctx=document.getElementById('ch-fin').getContext('2d');
  if(chFin)chFin.destroy();
  if(!labs.length)return;
  chFin=new Chart(ctx,{type:'line',data:{
    labels:labs.map(l=>{const[y,m]=l.split('-');return m+'/'+y.slice(2);}),
    datasets:[
      {label:'Receita',data:labs.map(l=>mo[l]?.r||0),borderColor:'rgba(53,39,31,.7)',backgroundColor:'rgba(53,39,31,.08)',fill:true,tension:.4,borderWidth:2},
      {label:'Resultado',data:labs.map(l=>(mo[l]?.r||0)-(mo[l]?.c||0)-(mo[l]?.e||0)),borderColor:'rgba(77,122,77,.8)',backgroundColor:'rgba(77,122,77,.06)',fill:true,tension:.4,borderWidth:2}
    ]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"'Lato',sans-serif",size:11},color:'#74685D'}}},scales:{x:{ticks:{color:'#74685D',font:{size:11}},grid:{color:'rgba(0,0,0,.04)'}},y:{ticks:{color:'#74685D',font:{size:11},callback:v=>'R$'+n(v).toFixed(0)},grid:{color:'rgba(0,0,0,.04)'}}}}});
}

function buildExpChart(){
  const exps=DB.get('expenses').filter(e=>e.status==='pago');
  const cats={};
  exps.forEach(e=>{cats[e.category]=(cats[e.category]||0)+e.value;});
  const ctx=document.getElementById('ch-exp').getContext('2d');
  if(chExp)chExp.destroy();
  if(!Object.keys(cats).length)return;
  const clrs=['rgba(53,39,31,.7)','rgba(92,61,46,.6)','rgba(116,104,93,.6)','rgba(232,223,206,.9)','rgba(53,39,31,.4)','rgba(116,104,93,.35)','rgba(200,180,160,.7)'];
  const cm={embalagem:'Embalagem',frete:'Frete',divulgacao:'Divulgação',taxa_pagamento:'Taxa pagto',equipamento:'Equipamento',energia:'Energia',outro:'Outro'};
  const keys=Object.keys(cats);
  chExp=new Chart(ctx,{type:'pie',data:{
    labels:keys.map(k=>cm[k]||k),
    datasets:[{data:keys.map(k=>cats[k]),backgroundColor:keys.map((_,i)=>clrs[i%clrs.length]),borderColor:'#F8F6EC',borderWidth:2}]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{family:"'Lato',sans-serif",size:11},color:'#74685D',boxWidth:12}}}}});
}

// ─────────────────────────────────────────────────
//  REPORTS
// ─────────────────────────────────────────────────
let repData=[];
function renderReport(){
  const type=document.getElementById('rep-type')?.value||'sales';
  const from=document.getElementById('rep-from')?.value;
  const to=document.getElementById('rep-to')?.value;
  const titles2={sales:'Relatório de Vendas',production:'Relatório de Produção',stock:'Relatório de Estoque',gifts:'Relatório de Brindes',losses:'Relatório de Perdas',expenses:'Relatório de Despesas',movements:'Relatório de Movimentações'};
  document.getElementById('rep-title').textContent=titles2[type]||'Relatório';
  function inR(ds){
    if(!from&&!to)return true;
    if(from&&ds<from)return false;
    if(to&&ds>to)return false;
    return true;
  }
  let html='',data=[];
  if(type==='sales'){
    data=DB.get('sales').filter(s=>inR(s.date)).sort((a,b)=>b.date.localeCompare(a.date));
    html=data.length?`<div class="tw"><table><thead><tr><th>Código</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Status</th></tr></thead><tbody>${
      data.map(s=>`<tr><td><code>${s.code}</code></td><td>${fmtD(s.date)}</td><td>${s.clientName||'—'}</td><td>${s.items.length}</td><td>${money(s.totalRevenue)}</td><td>${money(s.totalCost)}</td><td style="color:var(--ok)">${money(s.totalRevenue-s.totalCost)}</td><td>${sbadge(s.status)}</td></tr>`).join('')
    }</tbody></table></div><div class="sum" style="margin-top:12px"><div class="sr"><span>Total Receita</span><span>${money(data.reduce((s,v)=>s+(v.totalRevenue||0),0))}</span></div><div class="sr tot"><span>Total Lucro Bruto</span><span>${money(data.reduce((s,v)=>s+(v.totalRevenue||0)-(v.totalCost||0),0))}</span></div></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }else if(type==='production'){
    data=DB.get('batches').filter(b=>inR(b.date)).sort((a,b)=>b.date.localeCompare(a.date));
    html=data.length?`<div class="tw"><table><thead><tr><th>Lote</th><th>Produto</th><th>Data</th><th>Qtd</th><th>Custo Total</th><th>Custo/Un.</th></tr></thead><tbody>${
      data.map(b=>`<tr><td><code>${b.code}</code></td><td>${b.productName}</td><td>${fmtD(b.date)}</td><td>${b.qty}</td><td>${money(b.totalCost)}</td><td>${money(b.unitCost)}</td></tr>`).join('')
    }</tbody></table></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }else if(type==='stock'){
    data=DB.get('products').filter(p=>p.status==='ativo');
    html=data.length?`<div class="tw"><table><thead><tr><th>Produto</th><th>Estoque</th><th>Custo Médio</th><th>Valor</th><th>Mínimo</th><th>Status</th></tr></thead><tbody>${
      data.map(p=>{const ac=avgCost(p.id);return`<tr><td>${p.name}${p.color?' – '+p.color:''}</td><td>${p.stock||0}</td><td>${money(ac)}</td><td>${money((p.stock||0)*ac)}</td><td>${p.minStock||5}</td><td>${(p.stock||0)===0?'<span class="badge berr">Zerado</span>':(p.stock||0)<=(p.minStock||5)?'<span class="badge bwarn">Baixo</span>':'<span class="badge bok">OK</span>'}</td></tr>`;}).join('')
    }</tbody></table></div>`:'<div class="empty"><p>Nenhum produto ativo.</p></div>';
  }else if(type==='gifts'){
    data=DB.get('gifts').filter(g=>inR(g.date)).sort((a,b)=>b.date.localeCompare(a.date));
    const rm={divulgacao:'Divulgação',presente_cliente:'Presente',acao_promocional:'Ação promo.',parceria:'Parceria',amostras:'Amostras',outro:'Outro'};
    html=data.length?`<div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Destinatário</th><th>Motivo</th><th>Custo</th></tr></thead><tbody>${
      data.map(g=>`<tr><td>${fmtD(g.date)}</td><td>${g.productName}</td><td>${g.qty}</td><td>${g.recipient||g.clientName||'—'}</td><td>${rm[g.reason]||g.reason}</td><td>${money(g.totalCost)}</td></tr>`).join('')
    }</tbody></table></div><div class="sum" style="margin-top:12px"><div class="sr tot"><span>Custo Total Brindes</span><span>${money(data.reduce((s,g)=>s+(g.totalCost||0),0))}</span></div></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }else if(type==='losses'){
    data=DB.get('losses').filter(l=>inR(l.date)).sort((a,b)=>b.date.localeCompare(a.date));
    html=data.length?`<div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Motivo</th><th>Custo</th></tr></thead><tbody>${
      data.map(l=>`<tr><td>${fmtD(l.date)}</td><td>${l.productName}</td><td>${l.qty}</td><td>${l.reason}</td><td>${money(l.totalCost)}</td></tr>`).join('')
    }</tbody></table></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }else if(type==='expenses'){
    data=DB.get('expenses').filter(e=>inR(e.date)).sort((a,b)=>b.date.localeCompare(a.date));
    html=data.length?`<div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead><tbody>${
      data.map(e=>`<tr><td>${fmtD(e.date)}</td><td>${e.description}</td><td>${e.category}</td><td>${money(e.value)}</td><td>${e.status==='pago'?'<span class="badge bok">Pago</span>':'<span class="badge bwarn">Pendente</span>'}</td></tr>`).join('')
    }</tbody></table></div><div class="sum" style="margin-top:12px"><div class="sr tot"><span>Total Despesas</span><span>${money(data.reduce((s,e)=>s+(e.value||0),0))}</span></div></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }else if(type==='movements'){
    data=DB.get('movements').filter(m=>inR(m.date)).sort((a,b)=>b.date.localeCompare(a.date));
    const tmap={entrada:'Entrada',venda:'Venda',brinde:'Brinde',perda:'Perda',ajuste:'Ajuste'};
    html=data.length?`<div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Custo</th><th>Ref.</th></tr></thead><tbody>${
      data.map(m=>`<tr><td>${fmtD(m.date)}</td><td>${m.productName}</td><td>${tmap[m.type]||m.type}</td><td>${m.qty}</td><td>${money(m.totalCost)}</td><td style="font-size:12px;color:var(--text2)">${m.ref||'—'}</td></tr>`).join('')
    }</tbody></table></div>`:'<div class="empty"><p>Nenhum dado no período.</p></div>';
  }
  document.getElementById('rep-body').innerHTML=html;
  repData=data;
}

function exportCSV(){
  if(!repData.length)return toast('Nenhum dado para exportar.','warn');
  const type=document.getElementById('rep-type').value;
  const rows=[];
  if(type==='sales'){
    rows.push(['Código','Data','Cliente','Receita','Custo','Lucro','Status']);
    repData.forEach(s=>rows.push([s.code,s.date,s.clientName||'',s.totalRevenue,s.totalCost,s.totalRevenue-s.totalCost,s.status]));
  }else if(type==='production'){
    rows.push(['Lote','Produto','Data','Qtd','Custo Total','Custo/Un.']);
    repData.forEach(b=>rows.push([b.code,b.productName,b.date,b.qty,b.totalCost,b.unitCost]));
  }else if(type==='stock'){
    rows.push(['Produto','Cor','Tamanho','Estoque','Custo Médio','Valor Total']);
    repData.forEach(p=>{const ac=avgCost(p.id);rows.push([p.name,p.color||'',p.size||'',p.stock||0,ac,(p.stock||0)*ac]);});
  }else if(type==='gifts'){
    rows.push(['Data','Produto','Qtd','Destinatário','Motivo','Custo']);
    repData.forEach(g=>rows.push([g.date,g.productName,g.qty,g.recipient||'',g.reason,g.totalCost]));
  }else if(type==='losses'){
    rows.push(['Data','Produto','Qtd','Motivo','Custo']);
    repData.forEach(l=>rows.push([l.date,l.productName,l.qty,l.reason,l.totalCost]));
  }else if(type==='expenses'){
    rows.push(['Data','Descrição','Categoria','Valor','Status']);
    repData.forEach(e=>rows.push([e.date,e.description,e.category,e.value,e.status]));
  }else{
    rows.push(['Data','Produto','Tipo','Qtd','Custo','Referência']);
    repData.forEach(m=>rows.push([m.date,m.productName,m.type,m.qty,m.totalCost,m.ref||'']));
  }
  const csv=rows.map(r=>r.map(v=>'"'+(String(v).replace(/"/g,'""'))+'"').join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`nati_cetim_${type}_${today()}.csv`;a.click();URL.revokeObjectURL(url);
  toast('CSV exportado!','ok');
}

function exportPDF(){window.print();toast('Use "Salvar como PDF" no diálogo de impressão.','');}

// ─────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────
function loadSettings(){
  const s=DB.obj('settings');
  if(s.brand)document.getElementById('cfg-brand').value=s.brand;
  if(s.owner)document.getElementById('cfg-owner').value=s.owner;
  if(s.phone)document.getElementById('cfg-phone').value=s.phone;
  if(s.email)document.getElementById('cfg-email').value=s.email;
  if(s.minStock)document.getElementById('cfg-min').value=s.minStock;
}

function renderSettings(){
  loadSettings();
  // Update Firebase status indicator
  const dot = document.getElementById('fb-dot');
  const msg = document.getElementById('fb-msg');
  if (dot && msg) {
    if (FSync.ready) {
      dot.style.background = 'var(--ok)';
      msg.textContent = '✅ Firebase conectado — dados sincronizando automaticamente';
      msg.style.color = 'var(--ok)';
    } else if (window.FIREBASE_ENABLED) {
      dot.style.background = 'var(--err)';
      msg.textContent = '❌ Firebase habilitado mas não conectou — verifique as credenciais';
      msg.style.color = 'var(--err)';
    } else {
      dot.style.background = 'var(--warn)';
      msg.textContent = '⚠️ Nuvem não configurada — dados salvos apenas neste navegador';
      msg.style.color = 'var(--warn)';
    }
  }
}

function saveSettings(){
  DB.sobj('settings',{brand:document.getElementById('cfg-brand').value,owner:document.getElementById('cfg-owner').value,phone:document.getElementById('cfg-phone').value,email:document.getElementById('cfg-email').value,minStock:document.getElementById('cfg-min').value});
  toast('Configurações salvas.','ok');
}

// ─────────────────────────────────────────────────
//  BACKUP
// ─────────────────────────────────────────────────
function exportBackup(){
  const data={products:DB.get('products'),materials:DB.get('materials'),batches:DB.get('batches'),movements:DB.get('movements'),sales:DB.get('sales'),clients:DB.get('clients'),gifts:DB.get('gifts'),losses:DB.get('losses'),expenses:DB.get('expenses'),settings:DB.obj('settings'),exportedAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`nati_cetim_backup_${today()}.json`;a.click();URL.revokeObjectURL(url);
  toast('Backup exportado!','ok');
}

function importBackup(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.products)DB.set('products',data.products);
      if(data.materials)DB.set('materials',data.materials);
      if(data.batches)DB.set('batches',data.batches);
      if(data.movements)DB.set('movements',data.movements);
      if(data.sales)DB.set('sales',data.sales);
      if(data.clients)DB.set('clients',data.clients);
      if(data.gifts)DB.set('gifts',data.gifts);
      if(data.losses)DB.set('losses',data.losses);
      if(data.expenses)DB.set('expenses',data.expenses);
      if(data.settings)DB.sobj('settings',data.settings);
      toast('Backup importado com sucesso!','ok');renderDash();
    }catch{toast('Arquivo inválido.','err');}
  };
  reader.readAsText(file);
  input.value='';
}

function confirmClearAll(){
  showConfirm('APAGAR TUDO','Todos os dados serão permanentemente excluídos. Esta ação é IRREVERSÍVEL.',()=>{
    ['products','materials','batches','movements','sales','clients','gifts','losses','expenses'].forEach(k=>DB.set(k,[]));
    DB.sobj('settings',{});
    toast('Todos os dados foram apagados.','warn');renderDash();
  });
}

// ─────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────
function btnEd(fn,id){return`<button class="btn btn-g btn-ic btn-sm" onclick="${fn}('${id}')" title="Editar">${svgI('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>')}</button>`;}
function btnDel(fn,id){return`<button class="btn btn-g btn-ic btn-sm" onclick="${fn}('${id}')" title="Excluir">${svgI('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>')}</button>`;}
