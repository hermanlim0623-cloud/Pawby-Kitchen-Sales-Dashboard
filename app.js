// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let orders = JSON.parse(localStorage.getItem('pawby_v2_orders') || '[]');
let SHEETS_URL = localStorage.getItem('pawby_sheets_url') || 'https://script.google.com/macros/s/AKfycbxLZbxkj-uyS6GW5fkXtX5-8lkPMyhHvnHS-KtOWY0MFTkOYoTuzDWaN4b8CaVMqU9VHA/exec';
let activeSheet = 'all';
const SESSION_KEY = 'pawby_session';
const SESSION_HOURS = 12;

const PRICES = {
  pawbeefy: 2.00,
  pawporkby: 1.50,
  chickipaw: 1.50,
  blueberry: 2.50,
  collagen: 3.00,
  spawghetti: 3.00,
  woofball: 3.00
};

const PRODUCT_META = [
  { key: 'pawbeefy',  emoji: '🐄', name: 'Pawbeefy',            price: 2.00 },
  { key: 'pawporkby', emoji: '🐷', name: 'Pawporkby',           price: 1.50 },
  { key: 'chickipaw', emoji: '🐔', name: 'Chickipaw',           price: 1.50 },
  { key: 'blueberry', emoji: '🫐', name: 'Blueberry Bliss',     price: 2.50 },
  { key: 'collagen',  emoji: '🍖', name: 'Collagen Broth',      price: 3.00 },
  { key: 'spawghetti',emoji: '🍝', name: 'Spawghetti Beefonara',price: 3.00 },
  { key: 'woofball',  emoji: '🥣', name: 'Woofball',            price: 3.00 },
];

const PACKAGE_PRICES = {
  'Starter Pack': 10.99,
  'Weekly Pawby Pack': 21.99
};

// ══════════════════════════════════════════
// LOGIN SYSTEM
// ══════════════════════════════════════════
function checkSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (s.token && s.expires > Date.now()) return s;
    localStorage.removeItem(SESSION_KEY);
    return false;
  } catch(e) { return false; }
}

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');
  if (!username || !password) { showLoginError('Username and password are required!'); return; }
  btn.textContent = 'Verifying...';
  btn.disabled = true;
  errEl.style.display = 'none';
  try {
    const res = await fetch(SHEETS_URL +
      '?action=login&username=' + encodeURIComponent(username) +
      '&password=' + encodeURIComponent(password) +
      '&t=' + Date.now());
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token:   data.token,
        name:    data.name,
        expires: Date.now() + (SESSION_HOURS * 60 * 60 * 1000)
      }));
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('loginInfo').textContent = '👤 ' + data.name;
      init();
    } else {
      showLoginError(data.error || 'Incorrect username or password');
    }
  } catch(e) {
    showLoginError('Connection failed. Check your internet.');
  }
  btn.textContent = 'Sign In →';
  btn.disabled = false;
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
}

function doLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// Cek session saat buka
(function() {
  const session = checkSession();
  if (session) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('loginInfo').textContent = '👤 ' + session.name;
    init();
  }
})();

// ══════════════════════════════════════════
// DATE RANGE PICKER
// ══════════════════════════════════════════
const _now = new Date();
const _todayStr = _now.toISOString().slice(0,10);
function _monthStart(y,m){ return `${y}-${String(m).padStart(2,'0')}-01`; }
function _monthEnd(y,m)  { return `${y}-${String(m).padStart(2,'0')}-31`; }
let rangeFrom = _monthStart(_now.getFullYear(), _now.getMonth()+1);
let rangeTo   = _monthEnd(_now.getFullYear(),   _now.getMonth()+1);
let pickStep=0, hoverDate=null;
let calViewLeft = new Date(_now.getFullYear(), _now.getMonth(), 1);

function getActiveMonthRange() {
  const f=rangeFrom, t=rangeTo;
  const df=new Date(f), dt=new Date(t);
  let label;
  const isMobile = window.innerWidth <= 480;
  if (f===t) {
    label = df.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  } else if (f.slice(0,7)===t.slice(0,7) && f.slice(8)==='01' && parseInt(t.slice(8))>=28) {
    label = new Date(f.slice(0,7)+'-02').toLocaleString('en-US',{month:'long',year:'numeric'});
  } else {
    const fmt = isMobile ? {day:'numeric',month:'short'} : {day:'numeric',month:'short',year:'numeric'};
    label = `${df.toLocaleDateString('en-US',{day:'numeric',month:'short'})} – ${dt.toLocaleDateString('en-US',fmt)}`;
  }
  return { from:f, to:t, label:`📅 ${label}` };
}

function toggleRangePicker() {
  const dd = document.getElementById('calDropdown');
  if (dd.classList.contains('open')) { closePicker(); return; }
  renderCals(); attachCalHover(); dd.classList.add('open');
}

function closePicker() {
  document.getElementById('calDropdown').classList.remove('open');
  pickStep=0; hoverDate=null;
}

function goToday() {
  rangeFrom=_todayStr; rangeTo=_todayStr;
  calViewLeft=new Date(_now.getFullYear(),_now.getMonth(),1);
  pickStep=0; hoverDate=null;
  renderCals(); attachCalHover(); updateDayStyles(); updateRangeLabel();
}

function applyRange() {
  if (rangeTo<rangeFrom){const t=rangeFrom;rangeFrom=rangeTo;rangeTo=t;}
  closePicker(); renderStats();
}

function resetToCurrentMonth() {
  rangeFrom=_monthStart(_now.getFullYear(),_now.getMonth()+1);
  rangeTo=_monthEnd(_now.getFullYear(),_now.getMonth()+1);
  calViewLeft=new Date(_now.getFullYear(),_now.getMonth(),1);
  pickStep=0; hoverDate=null;
  renderCals(); attachCalHover(); applyRange();
}

function navCal(side,dir) {
  calViewLeft=new Date(calViewLeft.getFullYear(),calViewLeft.getMonth()+dir,1);
  renderCals(); attachCalHover();
}

function renderCals() {
  document.getElementById('calLeft').innerHTML=buildCal(calViewLeft,'left');
  updateDayStyles(); updateRangeLabel();
}

function buildCal(viewDate,side) {
  const y=viewDate.getFullYear(),mo=viewDate.getMonth();
  const monthName=viewDate.toLocaleString('en-US',{month:'long',year:'numeric'});
  const firstDay=new Date(y,mo,1).getDay();
  const daysInMonth=new Date(y,mo+1,0).getDate();
  const offset=(firstDay+6)%7;
  const dows=['Mo','Tu','We','Th','Fr','Sa','Su'];
  let html=`<div class="cal-nav">
    <button class="cal-nav-btn" onclick="navCal('${side}',-1)">&#8249;</button>
    <span class="cal-month-lbl">${monthName}</span>
    <button class="cal-nav-btn" onclick="navCal('${side}',1)">&#8250;</button>
  </div><div class="cal-grid">`;
  dows.forEach(d=>{html+=`<div class="cal-dow">${d}</div>`;});
  for(let i=0;i<offset;i++) html+=`<div class="cal-day cal-empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=ds===_todayStr;
    html+=`<button class="cal-day${isToday?' is-today':''}" data-date="${ds}" onclick="pickDay('${ds}')">${d}</button>`;
  }
  html+=`</div>`;
  return html;
}

function updateDayStyles(effFrom,effTo) {
  const f=effFrom||rangeFrom, t=effTo||rangeTo;
  document.querySelectorAll('.cal-day[data-date]').forEach(btn=>{
    const ds=btn.dataset.date;
    btn.classList.remove('range-start','range-end','in-range');
    if(ds===f&&ds===t){btn.classList.add('range-start','range-end');}
    else if(ds===f){btn.classList.add('range-start');}
    else if(ds===t){btn.classList.add('range-end');}
    else if(ds>f&&ds<t){btn.classList.add('in-range');}
  });
}

function attachCalHover() {
  const body=document.getElementById('calBody');
  body.onmouseover=function(e){
    if(pickStep!==1)return;
    const btn=e.target.closest('.cal-day[data-date]');
    if(!btn)return;
    const ds=btn.dataset.date;
    if(ds===hoverDate)return;
    hoverDate=ds;
    const eff_to=ds<rangeFrom?rangeFrom:ds;
    const eff_from=ds<rangeFrom?ds:rangeFrom;
    updateDayStyles(eff_from,eff_to);
  };
  body.onmouseleave=function(){
    if(pickStep!==1)return;
    hoverDate=null; updateDayStyles();
  };
}

function pickDay(ds) {
  if(pickStep===0){rangeFrom=ds;rangeTo=ds;pickStep=1;updateDayStyles();updateRangeLabel();}
  else{
    if(ds<rangeFrom){rangeTo=rangeFrom;rangeFrom=ds;}else rangeTo=ds;
    pickStep=0;hoverDate=null;updateDayStyles();updateRangeLabel();
  }
}

function updateRangeLabel() {
  const lbl=document.getElementById('rangeSelectedLabel');
  if(!lbl)return;
  if(pickStep===1){lbl.textContent='→ select end date';return;}
  lbl.textContent=rangeFrom===rangeTo?rangeFrom:`${rangeFrom}  →  ${rangeTo}`;
}

// ══════════════════════════════════════════
// CORE UTILITIES
// ══════════════════════════════════════════
const saveLocal = () => localStorage.setItem('pawby_v2_orders', JSON.stringify(orders));
const fmt$ = n => '$' + parseFloat(n||0).toFixed(2);
const ini  = s => (s||'?').replace('@','').slice(0,2).toUpperCase();

function setSync(state,txt) {
  const el=document.getElementById('syncChip');
  el.className='sync-chip '+state;
  document.getElementById('syncTxt').textContent=txt;
}

function connectSheets() {
  const url=document.getElementById('sheetsUrl').value.trim();
  if(!url.includes('script.google.com')){alert('Invalid URL!');return;}
  SHEETS_URL=url;
  localStorage.setItem('pawby_sheets_url',url);
  document.getElementById('setupBanner').classList.add('hidden');
  closeSetup(); doSync();
}

async function doSync() {
  if(!SHEETS_URL){openSetup();return;}
  setSync('loading','Fetching data...');
  try {
    const res=await fetch(SHEETS_URL+'?action=getOrders&t='+Date.now());
    const data=await res.json();
    if(data.success&&data.orders){
      orders=data.orders; saveLocal();
      const now=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('lastSyncInfo').textContent='Last sync: '+now;
      setSync('ok','Synced ✓');
      renderAll(); populateSheetSelect(orders);
    } else {
      setSync('err','Failed: '+(data.error||'unknown'));
    }
  } catch(e){setSync('err','Connection failed');console.error(e);}
}

async function postSheets(body) {
  if(!SHEETS_URL)return;
  try {
    await fetch(SHEETS_URL,{
      method:'POST',mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    setSync('ok','Saved ✓');
    setTimeout(()=>setSync('ok','Synced ✓'),3000);
  } catch(e){setSync('err','Send failed');}
}

function init() {
  document.getElementById('datePill').textContent =
    new Date().toLocaleDateString('en-US',{weekday:'short',day:'numeric',month:'long',year:'numeric'});
  const now=new Date();
  document.getElementById('fDate').valueAsDate=now;
  document.getElementById('fTime').value=now.toTimeString().slice(0,5);
  if(SHEETS_URL){
    document.getElementById('sheetsUrl').value=SHEETS_URL;
    document.getElementById('setupBanner').classList.add('hidden');
    setSync('ok','Connected to Sheets');
    setTimeout(()=>doSync(),800);
  } else {
    document.getElementById('setupBanner').classList.remove('hidden');
    renderAll();
  }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function switchView(name,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  btn.classList.add('active');
  const map={
    dashboard: ['Dashboard Overview','Welcome back, Pawby Admin 🐾'],
    orders:    ['All Orders','Manage orders from all months'],
    customers: ['Customers','Telegram customer data'],
    products:  ['Product Catalog','Statistics per product'],
    stock:     ['Stock Management','Monitor & update product stock 📦'],
  };
  document.getElementById('vTitle').textContent=map[name][0];
  document.getElementById('vSub').textContent=map[name][1];
  closeSidebar();
  if(name==='stock') renderStockView();
  else renderAll();
}

// ══════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════
function openOrder(){ populateSheetSelect(orders); document.getElementById('orderOverlay').classList.add('open'); closeSidebar(); }
function closeOrder(){ document.getElementById('orderOverlay').classList.remove('open'); }
function openSetup(){ document.getElementById('setupOverlay').classList.add('open'); closeSidebar(); }
function closeSetup(){ document.getElementById('setupOverlay').classList.remove('open'); }

document.getElementById('orderOverlay').addEventListener('click',function(e){if(e.target===this)closeOrder();});
document.getElementById('setupOverlay').addEventListener('click',function(e){if(e.target===this)closeSetup();});

function populateSheetSelect(data){
  const sheets=[...new Set((data||[]).map(o=>o.sheetName).filter(Boolean))];
  const sel=document.getElementById('fSheet');
  sel.innerHTML=sheets.length
    ?sheets.map(s=>`<option value="${s}">${s}</option>`).join('')
    :'<option value="Apr Pawby Sales">Apr Pawby Sales</option>';
}

// ══════════════════════════════════════════
// ORDER FORM — CALC TOTAL
// ══════════════════════════════════════════
function calcTotal(){
  let total=0;
  PRODUCT_META.forEach(p=>{
    total+=(parseInt(document.getElementById('f'+cap(p.key)).value)||0)*p.price;
  });
  const pkgSelect=document.getElementById('fPackage');
  const pkgQty=parseInt(document.getElementById('fPackageQty').value)||0;
  if(pkgSelect.value && pkgQty>0){
    const pkgPrice=parseFloat(pkgSelect.options[pkgSelect.selectedIndex].dataset.price)||0;
    total+=pkgPrice*pkgQty;
  }
  const disc=parseFloat(document.getElementById('fDisc').value)||0;
  const finalTotal=Math.max(0,total-disc);
  document.getElementById('fTotal').value=finalTotal>0?finalTotal.toFixed(2):'';
}

function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// ══════════════════════════════════════════
// STOCK ALERT MODAL — show before blocking
// ══════════════════════════════════════════
function showStockAlert(errors) {
  // remove old if any
  const old = document.getElementById('stockAlertModal');
  if (old) old.remove();

  const html = `
  <div id="stockAlertModal" class="stock-alert-overlay" onclick="if(event.target===this)closeStockAlert()">
    <div class="stock-alert-box">
      <div class="stock-alert-icon">📦</div>
      <h3 class="stock-alert-title">Insufficient Stock!</h3>
      <p class="stock-alert-sub">Order cannot be saved — the following items are out of stock:</p>
      <ul class="stock-alert-list">
        ${errors.map(e=>`<li>⚠️ ${e}</li>`).join('')}
      </ul>
      <div class="stock-alert-actions">
        <button class="stock-alert-close" onclick="closeStockAlert()">Tutup</button>
        <button class="stock-alert-go" onclick="closeStockAlert();switchView('stock',document.querySelector('.ni[onclick*=\\'stock\\']'))">Manage Stock →</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(() => {
    document.getElementById('stockAlertModal')?.classList.add('open');
  });
}

function closeStockAlert() {
  const el = document.getElementById('stockAlertModal');
  if (el) { el.classList.remove('open'); setTimeout(()=>el.remove(), 250); }
}

// ══════════════════════════════════════════
// SAVE ORDER  ← stock validation injected
// ══════════════════════════════════════════
async function saveOrder(){
  let tgId=document.getElementById('fTg').value.trim();
  if(tgId&&!tgId.startsWith('@')) tgId='@'+tgId;
  const pkgSelect=document.getElementById('fPackage');
  const disc=parseFloat(document.getElementById('fDisc').value)||0;
  const order={
    tgId,
    anabul:    document.getElementById('fAnabul').value.trim(),
    pawbeefy:  parseInt(document.getElementById('fPawbeefy').value)||0,
    pawporkby: parseInt(document.getElementById('fPawporkby').value)||0,
    chickipaw: parseInt(document.getElementById('fChickipaw').value)||0,
    blueberry: parseInt(document.getElementById('fBlueberry').value)||0,
    collagen:  parseInt(document.getElementById('fCollagen').value)||0,
    spawghetti:parseInt(document.getElementById('fSpawghetti').value)||0,
    woofball:  parseInt(document.getElementById('fWoofball').value)||0,
    special:   0,
    package:   pkgSelect.value,
    packageQty:parseInt(document.getElementById('fPackageQty').value)||0,
    disc,
    total:     parseFloat(document.getElementById('fTotal').value)||0,
    delivery:  document.getElementById('fDelivery').value,
    payment:   document.getElementById('fPayment').value,
    date:      document.getElementById('fDate').value,
    time:      document.getElementById('fTime').value,
    sheetName: document.getElementById('fSheet').value,
  };
  order.bill = order.total;
  order.rowId = Date.now();

  // ── STOCK VALIDATION ──────────────────────
  const validation = stockValidate(order);
  if (!validation.ok) {
    showStockAlert(validation.errors);
    return; // block save
  }

  // ── SAVE ─────────────────────────────────
  orders.unshift(order);
  saveLocal();

  // ── DEDUCT STOCK ─────────────────────────
  stockDeduct(order);

  closeOrder();
  renderAll();
  showReceipt(order);
  await postSheets({action:'addOrder',order,sheetName:order.sheetName});

  // Reset form
  ['fTg','fAnabul','fTotal'].forEach(id=>document.getElementById(id).value='');
  ['fPawbeefy','fPawporkby','fChickipaw','fBlueberry','fCollagen','fSpawghetti','fWoofball','fPackageQty','fDisc']
    .forEach(id=>document.getElementById(id).value=0);
  document.getElementById('fPackage').value='';
}

// ══════════════════════════════════════════
// RECEIPT
// ══════════════════════════════════════════
function showReceipt(order){
  document.getElementById('rcTg').textContent      = order.tgId    || '—';
  document.getElementById('rcAnabul').textContent  = order.anabul  || '—';
  document.getElementById('rcDate').textContent    = order.date    || '—';
  document.getElementById('rcTime').textContent    = order.time    || '—';
  document.getElementById('rcDelivery').textContent= order.delivery|| '—';
  document.getElementById('rcPayment').textContent = order.payment  || '—';
  document.getElementById('rcOrderId').textContent = 'Order #' + order.rowId;

  let prodHTML = '';
  let subtotal = 0;

  PRODUCT_META.forEach(p => {
    const qty = parseInt(order[p.key]) || 0;
    if (!qty) return;
    const lineTotal = qty * p.price;
    subtotal += lineTotal;
    prodHTML += `
      <div class="rc-prod-row">
        <div class="rc-prod-left">
          <span class="rc-prod-emoji">${p.emoji}</span>
          <div>
            <div class="rc-prod-name">${p.name}</div>
            <div class="rc-prod-qty">x${qty} @ $${p.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="rc-prod-price">$${lineTotal.toFixed(2)}</div>
      </div>`;
  });

  if (order.package && order.packageQty > 0) {
    const pkgPrice = PACKAGE_PRICES[order.package] || 0;
    const pkgTotal = pkgPrice * order.packageQty;
    subtotal += pkgTotal;
    prodHTML += `
      <div class="rc-prod-row">
        <div class="rc-prod-left">
          <span class="rc-prod-emoji">📦</span>
          <div>
            <div class="rc-prod-name">${order.package}</div>
            <div class="rc-prod-qty">x${order.packageQty} @ $${pkgPrice.toFixed(2)}</div>
          </div>
        </div>
        <div class="rc-prod-price">$${pkgTotal.toFixed(2)}</div>
      </div>`;
  }

  document.getElementById('rcProducts').innerHTML =
    prodHTML || '<div style="font-size:.75rem;color:#5a7a99;">—</div>';

  const disc = order.disc || 0;
  let tHTML = `<div class="rc-subtotal-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>`;
  if (disc > 0) {
    tHTML += `<div class="rc-discount-row"><span>Discount</span><span>-$${disc.toFixed(2)}</span></div>`;
  }
  tHTML += `
    <div class="rc-total-row">
      <span class="rc-total-label">TOTAL</span>
      <span class="rc-total-amount">$${(order.total||0).toFixed(2)}</span>
    </div>`;
  document.getElementById('rcTotals').innerHTML = tHTML;
  document.getElementById('receiptOverlay').classList.add('open');
}

function closeReceipt(){
  document.getElementById('receiptOverlay').classList.remove('open');
}

async function downloadReceipt(){
  const el=document.getElementById('receiptContent');
  if(typeof html2canvas !== 'undefined'){
    const canvas=await html2canvas(el,{scale:3,backgroundColor:'#ffffff',useCORS:true});
    const link=document.createElement('a');
    link.download='pawby-receipt-'+Date.now()+'.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  } else {
    const w=window.open('','_blank');
    w.document.write('<html><head><title>Pawby Receipt</title></head><body style="margin:0;padding:20px;">'+el.outerHTML+'</body></html>');
    w.document.close(); w.print();
  }
}

// ══════════════════════════════════════════
// DELETE ORDER
// ══════════════════════════════════════════
async function deleteOrder(rowId,sheetName){
  if(!confirm('Delete this order?')) return;
  orders=orders.filter(o=>String(o.rowId)!==String(rowId));
  saveLocal(); renderAll();
  await postSheets({action:'deleteOrder',rowId,sheetName});
}

// ══════════════════════════════════════════
// RENDER — STATS
// ══════════════════════════════════════════
function getFilteredOrders(){
  return orders.filter(o=>{if(!o.date)return false;return o.date>=rangeFrom&&o.date<=rangeTo;});
}

function renderStats(){
  const src=getFilteredOrders();
  const{label}=getActiveMonthRange();
  const rev=src.reduce((s,o)=>{const v=parseFloat(o.bill||o.total||0);return s+(isNaN(v)?0:v);},0);
  const qty=src.reduce((s,o)=>
    s+(parseInt(o.pawbeefy)||0)+(parseInt(o.pawporkby)||0)+(parseInt(o.chickipaw)||0)
    +(parseInt(o.blueberry)||0)+(parseInt(o.collagen)||0)+(parseInt(o.spawghetti)||0)
    +(parseInt(o.woofball)||0)+(parseInt(o.packageQty)||0),0);
  const custs=[...new Set(src.map(o=>o.tgId).filter(Boolean))].length;
  const lbl=document.getElementById('activePeriodLabel');
  if(lbl) lbl.innerHTML=`${label} <span style="font-size:.65rem;opacity:.5">▼</span>`;
  document.getElementById('sRev').textContent=fmt$(rev);
  document.getElementById('sOrders').textContent=src.length;
  document.getElementById('sProd').textContent=qty;
  document.getElementById('sCust').textContent=custs;
  const isSingleMonth=rangeFrom.slice(0,7)===rangeTo.slice(0,7)&&rangeFrom.slice(8)==='01'&&parseInt(rangeTo.slice(8))>=28;
  const periodSub=isSingleMonth?'this month':'this period';
  document.getElementById("sRevSub").textContent=`from ${src.length} orders`;
  document.getElementById('sOrderSub').textContent=periodSub;
  document.getElementById('sProdSub').textContent=periodSub;
  document.getElementById('sCustSub').textContent=`${custs} unique on Telegram`;
  ['sRevPeriod','sOrderPeriod','sProdPeriod','sCustPeriod'].forEach(id=>{document.getElementById(id).textContent='';});
}

// ══════════════════════════════════════════
// RENDER — ORDER TABLE
// ══════════════════════════════════════════
function renderOrderTable(elId,list,maxRows){
  const el=document.getElementById(elId);
  const rows=maxRows?list.slice(0,maxRows):list;
  if(!rows.length){el.innerHTML=`<div class="empty"><div class="e-ico">📭</div><p>No orders yet</p></div>`;return;}
  const delClass=d=>{if(!d)return'';const u=d.toUpperCase();if(u.includes('DELIVERY'))return'delivery';if(u.includes('PICK'))return'pickup';if(u.includes('COD'))return'cod';return'';};
  el.innerHTML=`<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Customer</th><th>Products</th><th>Total</th><th class="hide-sm">Delivery</th><th class="hide-sm">Date</th><th></th></tr></thead>
    <tbody>${rows.map(o=>{
      const items=[];
      if(parseInt(o.pawbeefy))  items.push(`🐄×${o.pawbeefy}`);
      if(parseInt(o.pawporkby)) items.push(`🐷×${o.pawporkby}`);
      if(parseInt(o.chickipaw)) items.push(`🐔×${o.chickipaw}`);
      if(parseInt(o.blueberry)) items.push(`🫐×${o.blueberry}`);
      if(parseInt(o.collagen))  items.push(`🍖×${o.collagen}`);
      if(parseInt(o.spawghetti))items.push(`🍝×${o.spawghetti}`);
      if(parseInt(o.woofball))  items.push(`🥣×${o.woofball}`);
      if(o.package){const qty=o.packageQty>1?`×${o.packageQty}`:'';items.push(`📦${o.package}${qty}`);}
      const prod=items.length?items.join(' '):'—';
      const del=o.delivery&&isNaN(parseFloat(o.delivery))?o.delivery:'—';
      const dc=delClass(del);
      const total=parseFloat(o.bill||o.total||0);
      return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="av">${ini(o.tgId)}</div>
          <div><div class="cname">${o.tgId||'—'}</div>
          <div class="cphone">${o.anabul?'🐾 '+o.anabul:''}</div></div>
        </div></td>
        <td style="font-size:.75rem">${prod}</td>
        <td><span class="price">${fmt$(total)}</span></td>
        <td class="hide-sm"><span class="del-badge ${dc}">${del}</span></td>
        <td class="hide-sm" style="font-size:.72rem;color:var(--muted);font-family:var(--mono)">${o.date||'—'}</td>
        <td><div class="action-btns">
          <button class="edit-btn" onclick="openEdit('${o.rowId}','${o.sheetName||''}')" title="Edit">✏️</button>
          <button class="del-btn" onclick="deleteOrder('${o.rowId}','${o.sheetName||''}')" title="Delete">🗑</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  if(elId==='recentTbl'&&document.getElementById('recentCnt'))
    document.getElementById('recentCnt').textContent=rows.length<list.length?`${rows.length} of ${list.length}`:`${list.length} orders`;
  if(elId==='allTbl'&&document.getElementById('allCnt'))
    document.getElementById('allCnt').textContent=`${list.length} order`;
}

// ══════════════════════════════════════════
// RENDER — MONTH TABS
// ══════════════════════════════════════════
function getMonthsFromOrders(data){
  const months=new Set();
  data.forEach(o=>{if(o.date){const[year,month]=o.date.split('-');months.add(year+'-'+month);}});
  return Array.from(months).sort().reverse();
}

function renderMonthTabs(){
  const el=document.getElementById('sheetTabs');
  const months=getMonthsFromOrders(orders);
  el.innerHTML=`<button class="stab ${activeSheet==='all'?'active':''}" onclick="filterSheet('all')">📋 All</button>`
    +months.map(m=>{
      const[y,mo]=m.split('-');
      const name=new Date(y,mo-1).toLocaleString('en-US',{month:'long'});
      return`<button class="stab ${activeSheet===m?'active':''}" onclick="filterSheet('${m}')">${name}</button>`;
    }).join('');
}

function filterSheet(month){ activeSheet=month; renderAll(); }

// ══════════════════════════════════════════
// RENDER — TOP PRODUCTS
// ══════════════════════════════════════════
function renderTopProducts(){
  const el=document.getElementById('topProds');
  const map={};
  const add=(name,qty,price)=>{if(!qty||qty<=0)return;if(!map[name])map[name]={qty:0,rev:0};map[name].qty+=qty;map[name].rev+=qty*price;};
  orders.forEach(o=>{
    PRODUCT_META.forEach(p=>add(p.name,parseInt(o[p.key])||0,p.price));
    if(o.package&&o.package.trim()){
      const price=PACKAGE_PRICES[o.package.trim()]||10.99;
      add(o.package.trim(),parseInt(o.packageQty)||1,price);
    }
  });
  const sorted=Object.entries(map).sort((a,b)=>b[1].qty-a[1].qty).slice(0,6);
  if(!sorted.length){el.innerHTML=`<div class="empty"><div class="e-ico">📊</div><p>No data yet</p></div>`;return;}
  const maxQ=sorted[0][1].qty;
  const rc=['g','s','b','','',''];
  el.innerHTML=sorted.map(([name,d],i)=>`
    <div class="prod-item">
      <div class="rank ${rc[i]}">${i+1}</div>
      <div class="prod-info"><div class="prod-name">${name}</div><div class="prod-sold">${d.qty} sold</div></div>
      <div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${Math.round(d.qty/maxQ*100)}%"></div></div></div>
      <div class="prod-rev">${fmt$(d.rev)}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════
// RENDER — CUSTOMERS
// ══════════════════════════════════════════
function renderCustomers(){
  const el=document.getElementById('custList');
  const map={};
  orders.forEach(o=>{
    const key=o.tgId||'?';
    if(!map[key])map[key]={tgId:o.tgId||'',anabul:o.anabul||'',orders:0,total:0};
    map[key].orders++;
    map[key].total+=parseFloat(o.bill||o.total||0)||0;
  });
  const list=Object.values(map).sort((a,b)=>b.total-a.total);
  document.getElementById('custCnt').textContent=`${list.length} customers`;
  if(!list.length){el.innerHTML=`<div class="empty"><div class="e-ico">👥</div><p>No data yet</p></div>`;return;}
  el.innerHTML=list.map(c=>`
    <div class="cust-item">
      <div class="cust-av">${ini(c.tgId)}</div>
      <div><div class="cust-name">${c.tgId}</div><div class="cust-sub">${c.anabul?'🐾 '+c.anabul+' · ':''}${c.orders} order</div></div>
      <div class="cust-total">${fmt$(c.total)}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════
// RENDER — PRODUCTS CATALOG
// ══════════════════════════════════════════
function renderProducts(){
  const stock = stockLoad();
  const map={};
  orders.forEach(o=>{
    PRODUCT_META.forEach(p=>{
      const qty=parseInt(o[p.key])||0;
      if(!qty)return;
      if(!map[p.name])map[p.name]={qty:0,rev:0};
      map[p.name].qty+=qty; map[p.name].rev+=qty*p.price;
    });
    if(o.package&&o.package.trim()){
      const price=PACKAGE_PRICES[o.package.trim()]||10.99;
      const pkgQty=parseInt(o.packageQty)||1;
      if(!map[o.package])map[o.package]={qty:0,rev:0};
      map[o.package].qty+=pkgQty; map[o.package].rev+=price*pkgQty;
    }
  });

  const items=[
    ...PRODUCT_META.map(p=>({name:p.name,emoji:p.emoji,price:`$${p.price.toFixed(2)}`,stockKey:p.key})),
    {name:'Starter Pack',      emoji:'🍱',price:'$10.99',stockKey:null},
    {name:'Weekly Pawby Pack', emoji:'🥩',price:'$21.99',stockKey:null},
  ];

  document.getElementById('prodGrid').innerHTML=items.map(p=>{
    // stock badge
    let stockBadge = '';
    if (p.stockKey) {
      const qty = stock[p.stockKey] || 0;
      const cls = qty === 0 ? 'sl-empty' : qty <= 5 ? 'sl-low' : 'sl-ok';
      stockBadge = `<div class="p-stock-badge ${cls}">📦 ${qty} cups</div>`;
    } else {
      // pack — show how many can be made
      const recipe = PACK_RECIPE[p.name];
      if (recipe) {
        const canMake = Math.min(...Object.entries(recipe).map(([k,qty])=>Math.floor((stock[k]||0)/qty)));
        const cls = canMake === 0 ? 'sl-empty' : canMake <= 2 ? 'sl-low' : 'sl-ok';
        stockBadge = `<div class="p-stock-badge ${cls}">📦 ${canMake} packs available</div>`;
      }
    }
    return `
    <div class="p-card">
      <div class="p-emoji">${p.emoji}</div>
      <h4>${p.name}</h4>
      <div class="p-price">${p.price}</div>
      ${stockBadge}
      <div class="p-stat"><span>🛒 ${map[p.name]?.qty||0} sold</span><span>💰 ${fmt$(map[p.name]?.rev||0)}</span></div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// RENDER ALL
// ══════════════════════════════════════════
function renderAll(){
  renderStats();
  const filtered=activeSheet==='all'
    ?orders
    :orders.filter(o=>{if(!o.date)return false;const[year,month]=o.date.split('-');return year+'-'+month===activeSheet;});
  renderOrderTable('recentTbl',filtered,8);
  renderOrderTable('allTbl',filtered,null);
  renderMonthTabs();
  renderTopProducts();
  renderCustomers();
  renderProducts();
}

// ══════════════════════════════════════════
// EDIT ORDER
// ══════════════════════════════════════════
let editingOrder = null;

function openEdit(rowId,sheetName){
  const o=orders.find(x=>String(x.rowId)===String(rowId)&&x.sheetName===sheetName);
  if(!o) return;
  editingOrder=o;
  document.getElementById('editInfo').innerHTML=`<strong>${o.tgId}</strong> · ${o.date} · ${o.sheetName}`;
  document.getElementById('eTotal').value=o.total||'';
  document.getElementById('eBill').value=o.bill||'';
  document.getElementById('eDelivery').value=o.delivery||'DELIVERY by PD';
  document.getElementById('ePayment').value=o.payment||'ABA';
  document.getElementById('eTime').value=o.time||'';
  document.getElementById('eAnabul').value=o.anabul||'';
  document.getElementById('editOverlay').classList.add('open');
}

function closeEdit(){ document.getElementById('editOverlay').classList.remove('open'); editingOrder=null; }
document.getElementById('editOverlay').addEventListener('click',function(e){if(e.target===this)closeEdit();});

async function saveEdit(){
  if(!editingOrder) return;
  const updates={
    total:    parseFloat(document.getElementById('eTotal').value)||editingOrder.total,
    bill:     parseFloat(document.getElementById('eBill').value)||editingOrder.bill,
    delivery: document.getElementById('eDelivery').value,
    payment:  document.getElementById('ePayment').value,
    time:     document.getElementById('eTime').value,
    anabul:   document.getElementById('eAnabul').value,
  };
  const idx=orders.findIndex(x=>String(x.rowId)===String(editingOrder.rowId)&&x.sheetName===editingOrder.sheetName);
  if(idx!==-1){orders[idx]={...orders[idx],...updates};saveLocal();}
  closeEdit(); renderAll();
  setSync('loading','Updating Sheets...');
  const fields=['total','bill','delivery','payment','time','anabul'];
  for(const field of fields){
    await postSheets({action:'updateOrder',rowId:editingOrder.rowId,sheetName:editingOrder.sheetName,field,value:updates[field]});
  }
  setSync('ok','Sheets updated ✓');
  setTimeout(()=>setSync('ok','Synced ✓'),3000);
}

// ══ AUTO REFRESH every 5 minutes ══
setInterval(()=>{ if(SHEETS_URL&&checkSession()) doSync(); }, 5*60*1000);