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
  { key: 'pawbeefy',  emoji: '🐄', name: 'Pawbeefy',             price: 2.00 },
  { key: 'pawporkby', emoji: '🐷', name: 'Pawporkby',            price: 1.50 },
  { key: 'chickipaw', emoji: '🐔', name: 'Chickipaw',            price: 1.50 },
  { key: 'blueberry', emoji: '🫐', name: 'Blueberry Bliss',      price: 2.50 },
  { key: 'collagen',  emoji: '🍖', name: 'Collagen Broth',       price: 3.00 },
  { key: 'spawghetti',emoji: '🍝', name: 'Spawghetti Beefonara', price: 3.00 },
  { key: 'woofball',  emoji: '🥣', name: 'Woofball',             price: 3.00 },
];

const PACKAGE_PRICES = {
  'Starter Pack': 10.99,
  'Weekly Pawby Pack': 21.99
};

const PACKAGE_CONTENTS = {
    'Starter Pack': {
        pawbeefy: 2,
        chickipaw: 2,
        pawporkby: 3
    },
    'Weekly Pawby Pack': {
        pawbeefy: 5,
        chickipaw: 4,
        pawporkby: 5
    }
};

// ══════════════════════════════════════════
// HTML SANITIZER (prevent XSS)
// ══════════════════════════════════════════
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ══════════════════════════════════════════
// ORDER DATA NORMALIZER
// ══════════════════════════════════════════
// Sheets headers may contain emoji. This function
// normalizes any order object to use clean field names.
function normalizeOrder(o) {
  // If already normalized (has clean 'tgId' field from backend), skip
  if (o._normalized) return o;

  const n = Object.assign({}, o);

  // The backend now returns normalized fields (tgId, pawbeefy, etc.)
  // But for backward compat with old cached localStorage data that
  // might still have emoji headers, we do a fallback check:
  if (!n.tgId && !n.date) {
    // Try emoji header keys from old data
    n.date      = n.date      || findField(o, ['date']) || '';
    n.tgId      = n.tgId      || findField(o, ['telegram id', 'telegram']) || '';
    n.pawbeefy  = toInt(n.pawbeefy  || findField(o, ['pawbeefy']));
    n.pawporkby = toInt(n.pawporkby || findField(o, ['pawporkby']));
    n.chickipaw = toInt(n.chickipaw || findField(o, ['chickipaw']));
    n.blueberry = toInt(n.blueberry || findField(o, ['blueberry']));
    n.collagen  = toInt(n.collagen  || findField(o, ['collagen']));
    n.spawghetti= toInt(n.spawghetti|| findField(o, ['spawghetti']));
    n.woofball  = toInt(n.woofball  || findField(o, ['woofball']));
    n.package   = n.package   || findField(o, ['package']) || '';
    n.packageQty= toInt(n.packageQty|| findField(o, ['packageqty', 'package qty']));
    n.disc      = toFloat(n.disc    || findField(o, ['discount', 'disc']));
    n.total     = toFloat(n.total   || findField(o, ['total']));
    n.bill      = toFloat(n.bill    || findField(o, ['bill']));
    n.delivery  = n.delivery  || findField(o, ['delivery']) || '';
    n.payment   = n.payment   || findField(o, ['payment']) || '';
    n.time      = n.time      || findField(o, ['time']) || '';
    n.anabul    = n.anabul    || findField(o, ['anabul', 'furbaby']) || '';
    n.rowId     = n.rowId     || findField(o, ['rowid']) || '';
  }

  // Ensure date is a string in YYYY-MM-DD format
  if (n.date && typeof n.date === 'object' && n.date instanceof Date) {
    n.date = n.date.toISOString().slice(0, 10);
  } else if (n.date && String(n.date).match(/^\d{1,2}-\w{3}-\d{4}$/)) {
    // Handle "20-Mar-2026" format from Sheets
    const d = new Date(n.date);
    if (!isNaN(d)) n.date = d.toISOString().slice(0, 10);
  }

  n._normalized = true;
  return n;
}

// Find a field in an object by fuzzy key matching (handles emoji headers)
function findField(obj, keywords) {
  const keys = Object.keys(obj);
  for (let k = 0; k < keys.length; k++) {
    const clean = keys[k].toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    for (let w = 0; w < keywords.length; w++) {
      if (clean.indexOf(keywords[w]) !== -1) return obj[keys[k]];
    }
  }
  return null;
}

function toInt(v) { return parseInt(v) || 0; }
function toFloat(v) { return parseFloat(v) || 0; }


// ══════════════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════════════
let SUPABASE_URL = localStorage.getItem('pawby_supabase_url') || 'https://cqghlxtuuxqggiqxtjbl.supabase.co';
let SUPABASE_KEY = localStorage.getItem('pawby_supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxZ2hseHR1dXhxZ2dpcXh0amJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTU5NzAsImV4cCI6MjA5MTY3MTk3MH0.KHwuEpwUZwRBvj6lN4I_LVX7xWB5eMnZd1w2Bu_W9UU';

async function sbFetch(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=representation'
  };
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) { console.error('Supabase error:', res.status, await res.text()); return null; }
    const text = await res.text();
    return text ? JSON.parse(text) : true;
  } catch(e) { console.error('Supabase fetch failed:', e); return null; }
}

async function sbRpc(fnName, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) { console.error('Supabase RPC error:', await res.text()); return null; }
    return await res.json();
  } catch(e) { console.error('Supabase RPC failed:', e); return null; }
}

function isSupabaseConnected() { return !!(SUPABASE_URL && SUPABASE_KEY); }

function connectSupabase() {
  const url = document.getElementById('supabaseUrl').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('supabaseKey').value.trim();
  if (!url || !key) { alert('URL and Key are required!'); return; }
  SUPABASE_URL = url;
  SUPABASE_KEY = key;
  localStorage.setItem('pawby_supabase_url', url);
  localStorage.setItem('pawby_supabase_key', key);
  document.getElementById('supabaseStatus').innerHTML = '<span style="color:#10b981;">✅ Connected</span>';
  syncStocks();
  setupRealtime();
}

// ══════════════════════════════════════════
// SUPABASE REALTIME
// ══════════════════════════════════════════
let realtimeWs = null;
let realtimeHbInterval = null;

function setupRealtime() {
  if (!isSupabaseConnected()) return;
  if (realtimeWs) { try { realtimeWs.close(); } catch(e){} }
  if (realtimeHbInterval) clearInterval(realtimeHbInterval);

  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
    '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';
  
  try {
    realtimeWs = new WebSocket(wsUrl);
    realtimeWs.onopen = () => {
      realtimeWs.send(JSON.stringify({
        topic: 'realtime:public:stocks',
        event: 'phx_join',
        payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'stocks' }]}},
        ref: '1'
      }));
      realtimeWs.send(JSON.stringify({
        topic: 'realtime:public:stock_alerts',
        event: 'phx_join',
        payload: { config: { postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'stock_alerts' }]}},
        ref: '2'
      }));
      realtimeHbInterval = setInterval(() => {
        if (realtimeWs && realtimeWs.readyState === 1)
          realtimeWs.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'hb'}));
      }, 30000);
    };
    realtimeWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'postgres_changes') {
          if (msg.payload.table === 'stocks') syncStocks();
          if (msg.payload.table === 'stock_alerts' && msg.payload.eventType === 'INSERT')
            showStockAlert(msg.payload.record);
        }
      } catch(err) {}
    };
    realtimeWs.onclose = () => { setTimeout(setupRealtime, 5000); };
  } catch(e) { console.error('Realtime setup failed:', e); }
}

function showStockAlert(alert) {
  if (!alert) return;
  const type = alert.alert_type === 'out_of_stock' ? '🚨' : '⚠️';
  showToast(type + ' ' + alert.message, alert.alert_type === 'out_of_stock' ? 'error' : 'warning');
  const badge = document.getElementById('alertBadge');
  if (badge) {
    const count = parseInt(badge.textContent || '0') + 1;
    badge.textContent = count;
    badge.style.display = 'flex';
  }
}

function showToast(msg, type) {
  const toast = document.createElement('div');
  toast.className = 'stock-toast stock-toast-' + (type || 'info');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ══════════════════════════════════════════
// STOCK SYSTEM (Supabase)
// ══════════════════════════════════════════
let stocks = {};

function getStockStatus(productKey) {
  if (!stocks[productKey]) return null;
  const s = stocks[productKey];
  const qty = s.quantity || 0;
  const min = s.minStock || 5;
  if (qty === 0) return 'out';
  if (qty <= min) return 'low';
  if (qty > min * 2) return 'high';
  return 'normal';
}

async function syncStocks() {
  if (!isSupabaseConnected()) return false;
  try {
    const data = await sbFetch('stocks?order=id.asc');
    if (data && Array.isArray(data)) {
      stocks = {};
      data.forEach(s => {
        stocks[s.id] = {
          key: s.id, name: s.name, emoji: s.emoji,
          quantity: s.quantity || 0, minStock: s.min_stock || 5,
          price: parseFloat(s.price) || 0, lastUpdated: s.last_updated
        };
      });
      if (document.getElementById('view-stock').classList.contains('active')) renderStockView();
      loadUnreadAlerts();
      return true;
    }
  } catch(e) { console.error('Stock sync failed:', e); }
  return false;
}

function getSessionName() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').name || 'admin'; }
  catch(e) { return 'admin'; }
}

async function updateStock(productKey, newQty, notes) {
  newQty = Math.max(0, parseInt(newQty) || 0);
  const result = await sbRpc('update_stock_with_log', {
    p_product_id: productKey, p_new_quantity: newQty,
    p_action: 'set', p_notes: notes || '', p_created_by: getSessionName()
  });
  if (result && result.success) {
    if (stocks[productKey]) { stocks[productKey].quantity = newQty; stocks[productKey].lastUpdated = new Date().toISOString(); }
    return true;
  }
  return false;
}

async function addStock(productKey, quantity, notes) {
  if (!stocks[productKey]) return false;
  quantity = parseInt(quantity) || 0;
  const newQty = (stocks[productKey].quantity || 0) + quantity;
  const result = await sbRpc('update_stock_with_log', {
    p_product_id: productKey, p_new_quantity: newQty,
    p_action: 'add', p_notes: 'Add ' + quantity + (notes ? ' - ' + notes : ''), p_created_by: getSessionName()
  });
  if (result && result.success) {
    stocks[productKey].quantity = newQty; stocks[productKey].lastUpdated = new Date().toISOString();
    return true;
  }
  return false;
}

async function reduceStock(productKey, quantity, notes) {
  if (!stocks[productKey]) return false;
  quantity = parseInt(quantity) || 0;
  if (stocks[productKey].quantity < quantity) return false;
  const newQty = stocks[productKey].quantity - quantity;
  const result = await sbRpc('update_stock_with_log', {
    p_product_id: productKey, p_new_quantity: newQty,
    p_action: 'reduce', p_notes: 'Reduce ' + quantity + (notes ? ' - ' + notes : ''), p_created_by: getSessionName()
  });
  if (result && result.success) {
    stocks[productKey].quantity = newQty; stocks[productKey].lastUpdated = new Date().toISOString();
    return true;
  }
  return false;
}

// ══════════════════════════════════════════
// STOCK ALERTS (Supabase)
// ══════════════════════════════════════════
let unreadAlerts = [];

async function loadUnreadAlerts() {
  if (!isSupabaseConnected()) return;
  const data = await sbFetch('stock_alerts?is_read=eq.false&order=created_at.desc&limit=20');
  if (data && Array.isArray(data)) {
    unreadAlerts = data;
    const badge = document.getElementById('alertBadge');
    if (badge) {
      if (data.length > 0) { badge.textContent = data.length; badge.style.display = 'flex'; }
      else { badge.style.display = 'none'; }
    }
  }
}

async function markAllAlertsRead() {
  await sbFetch('stock_alerts?is_read=eq.false', { method: 'PATCH', body: { is_read: true } });
  unreadAlerts = [];
  const badge = document.getElementById('alertBadge');
  if (badge) badge.style.display = 'none';
}

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
  btn.textContent = 'Memverifikasi...';
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
  if (!confirm('Yakin mau logout?')) return;
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// Check session on load
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
function _monthStart(y,m){ return y + '-' + String(m).padStart(2,'0') + '-01'; }
function _monthEnd(y,m)  { return y + '-' + String(m).padStart(2,'0') + '-31'; }
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
    label = df.toLocaleDateString('en-US',{day:'numeric',month:'short'}) + ' – ' + dt.toLocaleDateString('en-US',fmt);
  }
  return { from:f, to:t, label:'📅 ' + label };
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
  let html='<div class="cal-nav">' +
    '<button class="cal-nav-btn" onclick="navCal(\'' + side + '\',-1)">&#8249;</button>' +
    '<span class="cal-month-lbl">' + monthName + '</span>' +
    '<button class="cal-nav-btn" onclick="navCal(\'' + side + '\',1)">&#8250;</button>' +
    '</div><div class="cal-grid">';
  dows.forEach(d => { html += '<div class="cal-dow">' + d + '</div>'; });
  for(let i=0;i<offset;i++) html+='<div class="cal-day cal-empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds = y + '-' + String(mo+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const isToday = ds === _todayStr;
    html += '<button class="cal-day' + (isToday?' is-today':'') + '" data-date="' + ds + '" onclick="pickDay(\'' + ds + '\')">' + d + '</button>';
  }
  html+='</div>';
  return html;
}

function updateDayStyles(effFrom,effTo) {
  const f=effFrom||rangeFrom, t=effTo||rangeTo;
  document.querySelectorAll('.cal-day[data-date]').forEach(btn => {
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
  if(pickStep===1){lbl.textContent='→ pilih akhir';return;}
  lbl.textContent=rangeFrom===rangeTo?rangeFrom:(rangeFrom + '  →  ' + rangeTo);
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
    if(data.success && data.orders){
      // Normalize all orders from backend
      orders = data.orders.map(normalizeOrder);
      saveLocal();
      const now=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('lastSyncInfo').textContent='Last sync: '+now;
      setSync('ok','Synced ✓');
      renderAll();
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
   
   // Supabase status
   if (isSupabaseConnected()) {
     document.getElementById('supabaseUrl').value = SUPABASE_URL;
     document.getElementById('supabaseKey').value = SUPABASE_KEY;
     document.getElementById('supabaseStatus').innerHTML = '<span style="color:#10b981;">✅ Connected</span>';
     syncStocks();
     setupRealtime();
   }
   
   if(SHEETS_URL){
     document.getElementById('sheetsUrl').value=SHEETS_URL;
     document.getElementById('setupBanner').classList.add('hidden');
     setSync('ok','Connected to Sheets');
     setTimeout(()=>{
       doSync();
     },800);
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
     dashboard:['Dashboard Overview','Welcome back, Pawby Admin 🐾'],
     orders:['All Orders','Manage orders from all months'],
     customers:['Customers','Telegram customer data'],
     products:['Product Catalog','Statistics per product'],
     stock:['📦 Stock Management','Track inventory for all products'],
   };
   document.getElementById('vTitle').textContent=map[name][0];
   document.getElementById('vSub').textContent=map[name][1];
   closeSidebar();
   if(name === 'stock') renderStockView();
   else renderAll();
}

// ══════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════
function openOrder(){ document.getElementById('orderOverlay').classList.add('open'); closeSidebar(); }
function closeOrder(){ document.getElementById('orderOverlay').classList.remove('open'); }
function openSetup(){ document.getElementById('setupOverlay').classList.add('open'); closeSidebar(); }
function closeSetup(){ document.getElementById('setupOverlay').classList.remove('open'); }

document.getElementById('orderOverlay').addEventListener('click',function(e){if(e.target===this)closeOrder();});
document.getElementById('setupOverlay').addEventListener('click',function(e){if(e.target===this)closeSetup();});
document.getElementById('editStockOverlay').addEventListener('click',function(e){if(e.target===this)closeStockEdit();});
document.getElementById('stockHistoryOverlay').addEventListener('click',function(e){if(e.target===this)closeStockHistory();});

// ══════════════════════════════════════════
// ORDER FORM - CALC TOTAL
// ══════════════════════════════════════════
function calcTotal(){
  let total=0;
  PRODUCT_META.forEach(p=>{
    total+=(parseInt(document.getElementById('f'+cap(p.key)).value)||0)*p.price;
  });
  // Package
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
// SAVE ORDER
// ══════════════════════════════════════════
async function saveOrder(){
    let tgId=document.getElementById('fTg').value.trim();
    if(tgId&&!tgId.startsWith('@')) tgId='@'+tgId;
    const disc=parseFloat(document.getElementById('fDisc').value)||0;
    const orderDate = document.getElementById('fDate').value;
    const sheetName = getSheetNameForDate(orderDate);
    
    const order={
        tgId, anabul:document.getElementById('fAnabul').value.trim(),
        pawbeefy:parseInt(document.getElementById('fPawbeefy').value)||0,
        pawporkby:parseInt(document.getElementById('fPawporkby').value)||0,
        chickipaw:parseInt(document.getElementById('fChickipaw').value)||0,
        blueberry:parseInt(document.getElementById('fBlueberry').value)||0,
        collagen:parseInt(document.getElementById('fCollagen').value)||0,
        spawghetti:parseInt(document.getElementById('fSpawghetti').value)||0,
        woofball:parseInt(document.getElementById('fWoofball').value)||0,
        special:0, package:document.getElementById('fPackage').value,
        packageQty:parseInt(document.getElementById('fPackageQty').value)||0,
        disc, total:parseFloat(document.getElementById('fTotal').value)||0,
        delivery:document.getElementById('fDelivery').value,
        payment:document.getElementById('fPayment').value,
        date:orderDate, time:document.getElementById('fTime').value,
        sheetName: sheetName,
    };
    order.bill=order.total;
    order.rowId=Date.now();
    order._normalized = true;

    // 🔍 1️⃣ VALIDASI STOK (Produk + Paket)
    if (isSupabaseConnected()) {
        const insufficient = [];
        
        // Validasi produk individual
        PRODUCT_META.forEach(p => {
            const qty = order[p.key] || 0;
            if (qty > 0) {
                const available = stocks[p.key]?.quantity || 0;
                if (available < qty) {
                    insufficient.push(`${p.emoji} ${p.name} (Butuh: ${qty} | Ada: ${available})`);
                }
            }
        });
        
        // Validasi komponen paket
        if (order.package && order.packageQty > 0 && PACKAGE_CONTENTS[order.package]) {
            const components = PACKAGE_CONTENTS[order.package];
            Object.entries(components).forEach(([prodKey, qtyPerPack]) => {
                const totalNeeded = qtyPerPack * order.packageQty;
                const available = stocks[prodKey]?.quantity || 0;
                const productMeta = PRODUCT_META.find(p => p.key === prodKey);
                const emoji = productMeta ? productMeta.emoji : '📦';
                const name = productMeta ? productMeta.name : prodKey;
                
                if (available < totalNeeded) {
                    insufficient.push(`${emoji} ${name} untuk paket (Butuh: ${totalNeeded} | Ada: ${available})`);
                }
            });
        }

        if (insufficient.length > 0) {
            showToast('❌ Stok tidak cukup:\n' + insufficient.join('\n'), 'error');
            return; // BLOKIR ORDER
        }
    }

    // ✅ 2️⃣ STOK CUKUP → LANJUTKAN SAVE
    orders.unshift(order);
    saveLocal();
    closeOrder();
    renderAll();
    showReceipt(order);
    await postSheets({action:'addOrder',order,sheetName:order.sheetName});

    // 📦 3️⃣ AUTO DEDUCT STOCK (Produk + Paket)
    if (isSupabaseConnected()) {
        const stockTasks = [];
        
        // Deduct produk individual
        PRODUCT_META.forEach(p => {
            const qty = order[p.key] || 0;
            if (qty > 0) {
                stockTasks.push(reduceStock(p.key, qty, `Order #${order.rowId} | ${order.tgId}`));
            }
        });
        
        // Deduct komponen paket
        if (order.package && order.packageQty > 0 && PACKAGE_CONTENTS[order.package]) {
            const components = PACKAGE_CONTENTS[order.package];
            Object.entries(components).forEach(([prodKey, qtyPerPack]) => {
                const totalQty = qtyPerPack * order.packageQty;
                stockTasks.push(reduceStock(
                    prodKey, 
                    totalQty, 
                    `Paket ${order.package} (${order.packageQty}x) | Order #${order.rowId}`
                ));
            });
        }

        if (stockTasks.length > 0) {
            showToast('📦 Memproses pengurangan stok...', 'info');
            const results = await Promise.all(stockTasks);
            const failed = results.filter(r => r === false);
            
            if (failed.length > 0) {
                showToast('⚠️ Order tersimpan, tapi gagal kurangi sebagian stok', 'warning');
            } else {
                showToast('✅ Order berhasil & stok otomatis terpotong', 'success');
            }
            if (document.getElementById('view-stock').classList.contains('active')) renderStockView();
        }
    }

    // 🔄 4️⃣ RESET FORM
    ['fTg','fAnabul','fTotal'].forEach(id=>document.getElementById(id).value='');
    ['fPawbeefy','fPawporkby','fChickipaw','fBlueberry','fCollagen','fSpawghetti','fWoofball','fPackageQty','fDisc']
        .forEach(id=>document.getElementById(id).value=0);
    document.getElementById('fPackage').value='';
}

// Generate sheet name from date: "Mar Pawby Sales", "Apr Pawby Sales"
function getSheetNameForDate(dateStr) {
  if (!dateStr) return 'Pawby Sales';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'Pawby Sales';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Try to match existing sheet names from orders
  const monthStr = months[d.getMonth()];
  // Check known patterns: "March Pawby Sales", "Apr Pawby Sales", "Pawby Sales"
  const knownSheets = [...new Set(orders.map(o => o.sheetName).filter(Boolean))];
  // Try full month name first
  const fullMonth = d.toLocaleString('en-US', {month:'long'});
  const matchFull = knownSheets.find(s => s.toLowerCase().includes(fullMonth.toLowerCase()));
  if (matchFull) return matchFull;
  // Try abbreviated
  const matchAbbr = knownSheets.find(s => s.toLowerCase().includes(monthStr.toLowerCase()));
  if (matchAbbr) return matchAbbr;
  // Default: use abbreviated month
  return monthStr + ' Pawby Sales';
}

// ══════════════════════════════════════════
// RECEIPT
// ══════════════════════════════════════════
function showReceipt(order){
  document.getElementById('rcTg').textContent     = order.tgId   || '—';
  document.getElementById('rcAnabul').textContent  = order.anabul || '—';
  document.getElementById('rcDate').textContent    = order.date   || '—';
  document.getElementById('rcTime').textContent    = order.time   || '—';
  document.getElementById('rcDelivery').textContent= order.delivery|| '—';
  document.getElementById('rcPayment').textContent = order.payment || '—';
  document.getElementById('rcOrderId').textContent = 'Order #' + order.rowId;

  let prodHTML = '';
  let subtotal = 0;

  PRODUCT_META.forEach(p => {
    const qty = parseInt(order[p.key]) || 0;
    if (!qty) return;
    const lineTotal = qty * p.price;
    subtotal += lineTotal;
    prodHTML += '<div class="rc-prod-row">' +
      '<div class="rc-prod-left">' +
        '<span class="rc-prod-emoji">' + p.emoji + '</span>' +
        '<div>' +
          '<div class="rc-prod-name">' + esc(p.name) + '</div>' +
          '<div class="rc-prod-qty">x' + qty + ' @ $' + p.price.toFixed(2) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rc-prod-price">$' + lineTotal.toFixed(2) + '</div>' +
    '</div>';
  });

  // Package
  if (order.package && order.packageQty > 0) {
    const pkgPrice = PACKAGE_PRICES[order.package] || 0;
    const pkgTotal = pkgPrice * order.packageQty;
    subtotal += pkgTotal;
    prodHTML += '<div class="rc-prod-row">' +
      '<div class="rc-prod-left">' +
        '<span class="rc-prod-emoji">📦</span>' +
        '<div>' +
          '<div class="rc-prod-name">' + esc(order.package) + '</div>' +
          '<div class="rc-prod-qty">x' + order.packageQty + ' @ $' + pkgPrice.toFixed(2) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rc-prod-price">$' + pkgTotal.toFixed(2) + '</div>' +
    '</div>';
  }

  document.getElementById('rcProducts').innerHTML =
    prodHTML || '<div style="font-size:.75rem;color:#5a7a99;">—</div>';

  const disc = order.disc || 0;
  let tHTML = '<div class="rc-subtotal-row"><span>Subtotal</span><span>$' + subtotal.toFixed(2) + '</span></div>';
  if (disc > 0) {
    tHTML += '<div class="rc-discount-row"><span>Discount</span><span>-$' + disc.toFixed(2) + '</span></div>';
  }
  tHTML += '<div class="rc-total-row">' +
    '<span class="rc-total-label">TOTAL</span>' +
    '<span class="rc-total-amount">$' + (order.total||0).toFixed(2) + '</span>' +
  '</div>';
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
  if(!confirm('Hapus order ini?')) return;
  orders=orders.filter(o=>String(o.rowId)!==String(rowId));
  saveLocal(); renderAll();
  await postSheets({action:'deleteOrder',rowId,sheetName});
}

// ══════════════════════════════════════════
// RENDER - STATS
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
  if(lbl) lbl.innerHTML=label + ' <span style="font-size:.65rem;opacity:.5">▼</span>';
  document.getElementById('sRev').textContent=fmt$(rev);
  document.getElementById('sOrders').textContent=src.length;
  document.getElementById('sProd').textContent=qty;
  document.getElementById('sCust').textContent=custs;
  const isSingleMonth=rangeFrom.slice(0,7)===rangeTo.slice(0,7)&&rangeFrom.slice(8)==='01'&&parseInt(rangeTo.slice(8))>=28;
  const periodSub=isSingleMonth?'this month':'this period';
  document.getElementById("sRevSub").textContent='from ' + src.length + ' orders';
  document.getElementById('sOrderSub').textContent=periodSub;
  document.getElementById('sProdSub').textContent=periodSub;
  document.getElementById('sCustSub').textContent=custs + ' unique on Telegram';
  ['sRevPeriod','sOrderPeriod','sProdPeriod','sCustPeriod'].forEach(id=>{document.getElementById(id).textContent='';});
}

// ══════════════════════════════════════════
// RENDER - ORDER TABLE
// ══════════════════════════════════════════
function renderOrderTable(elId,list,maxRows){
  const el=document.getElementById(elId);
  const rows=maxRows?list.slice(0,maxRows):list;
  if(!rows.length){el.innerHTML='<div class="empty"><div class="e-ico">📭</div><p>No orders yet</p></div>';return;}
  
  const delClass=d=>{if(!d)return'';const u=(d+'').toUpperCase();if(u.includes('DELIVERY'))return'delivery';if(u.includes('PICK'))return'pickup';if(u.includes('COD'))return'cod';return'';};
  
  let html = '<div class="tbl-wrap"><table class="tbl">' +
    '<thead><tr><th>Customer</th><th>Products</th><th>Total</th><th class="hide-sm">Delivery</th><th class="hide-sm">Date</th><th></th></tr></thead><tbody>';
  
  rows.forEach(o => {
    // All orders are now normalized - use clean field names directly
    const tgId = o.tgId || '?';
    const anabul = o.anabul || '';
    const pawbeefy = parseInt(o.pawbeefy) || 0;
    const pawporkby = parseInt(o.pawporkby) || 0;
    const chickipaw = parseInt(o.chickipaw) || 0;
    const blueberry = parseInt(o.blueberry) || 0;
    const collagen = parseInt(o.collagen) || 0;
    const spawghetti = parseInt(o.spawghetti) || 0;
    const woofball = parseInt(o.woofball) || 0;
    const package_ = o.package || '';
    const packageQty = parseInt(o.packageQty) || 0;
    const total = parseFloat(o.bill || o.total || 0);
    const delivery = o.delivery || '—';
    const date_ = o.date || '—';
    const rowId = o.rowId || '';
    const sheetName = o.sheetName || '';
    
    const items=[];
    if(pawbeefy) items.push('🐄×'+pawbeefy);
    if(pawporkby) items.push('🐷×'+pawporkby);
    if(chickipaw) items.push('🐔×'+chickipaw);
    if(blueberry) items.push('🫐×'+blueberry);
    if(collagen) items.push('🍖×'+collagen);
    if(spawghetti) items.push('🍝×'+spawghetti);
    if(woofball) items.push('🥣×'+woofball);
    if(package_){const qty=packageQty>1?'×'+packageQty:'';items.push('📦'+esc(package_)+qty);}
    
    const prod=items.length?items.join(' '):'—';
    const del=delivery&&isNaN(parseFloat(delivery))?delivery:'—';
    const dc=delClass(del);
    
    html += '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:8px">' +
        '<div class="av">' + ini(tgId) + '</div>' +
        '<div><div class="cname">' + esc(tgId) + '</div>' +
        '<div class="cphone">' + (anabul?'🐾 '+esc(anabul):'') + '</div></div>' +
      '</div></td>' +
      '<td style="font-size:.75rem">' + prod + '</td>' +
      '<td><span class="price">' + fmt$(total) + '</span></td>' +
      '<td class="hide-sm"><span class="del-badge ' + dc + '">' + esc(del) + '</span></td>' +
      '<td class="hide-sm" style="font-size:.72rem;color:var(--muted);font-family:var(--mono)">' + esc(date_) + '</td>' +
      '<td><div class="action-btns">' +
        '<button class="edit-btn" onclick="openEdit(\'' + esc(rowId) + '\',\'' + esc(sheetName) + '\')" title="Edit">✏️</button>' +
        '<button class="del-btn" onclick="deleteOrder(\'' + esc(rowId) + '\',\'' + esc(sheetName) + '\')" title="Hapus">🗑</button>' +
      '</div></td>' +
    '</tr>';
  });
  
  html += '</tbody></table></div>';
  el.innerHTML = html;
  
  if(elId==='recentTbl'&&document.getElementById('recentCnt'))
    document.getElementById('recentCnt').textContent=rows.length<list.length?(rows.length+' of '+list.length):(list.length+' orders');
  if(elId==='allTbl'&&document.getElementById('allCnt'))
    document.getElementById('allCnt').textContent=list.length+' order';
}

// ══════════════════════════════════════════
// RENDER - MONTH TABS (from actual data)
// ══════════════════════════════════════════
function getMonthsFromOrders(data){
  const months=new Set();
  data.forEach(o=>{
    if(o.date){
      const parts = o.date.split('-');
      if (parts.length >= 2) months.add(parts[0]+'-'+parts[1]);
    }
  });
  return Array.from(months).sort().reverse();
}

function renderMonthTabs(){
  const el=document.getElementById('sheetTabs');
  const months=getMonthsFromOrders(orders);
  let html = '<button class="stab ' + (activeSheet==='all'?'active':'') + '" onclick="filterSheet(\'all\')">📋 Semua</button>';
  months.forEach(m => {
    const[y,mo]=m.split('-');
    const name=new Date(y,mo-1).toLocaleString('en-US',{month:'long'});
    html += '<button class="stab ' + (activeSheet===m?'active':'') + '" onclick="filterSheet(\'' + m + '\')">' + name + '</button>';
  });
  el.innerHTML = html;
}

function filterSheet(month){ activeSheet=month; renderAll(); }

// ══════════════════════════════════════════
// RENDER - TOP PRODUCTS
// ══════════════════════════════════════════
function renderTopProducts(){
  const el=document.getElementById('topProds');
  const map={};
  const add=(name,qty,price)=>{if(!qty||qty<=0)return;if(!map[name])map[name]={qty:0,rev:0};map[name].qty+=qty;map[name].rev+=qty*price;};
  orders.forEach(o=>{
    PRODUCT_META.forEach(p=>add(p.name,parseInt(o[p.key])||0,p.price));
    if(o.package&&String(o.package).trim()){
      const price=PACKAGE_PRICES[String(o.package).trim()]||10.99;
      add(String(o.package).trim(),parseInt(o.packageQty)||1,price);
    }
  });
  const sorted=Object.entries(map).sort((a,b)=>b[1].qty-a[1].qty).slice(0,6);
  if(!sorted.length){el.innerHTML='<div class="empty"><div class="e-ico">📊</div><p>No data yet</p></div>';return;}
  const maxQ=sorted[0][1].qty;
  const rc=['g','s','b','','',''];
  el.innerHTML=sorted.map(([name,d],i)=>
    '<div class="prod-item">' +
      '<div class="rank ' + rc[i] + '">' + (i+1) + '</div>' +
      '<div class="prod-info"><div class="prod-name">' + esc(name) + '</div><div class="prod-sold">' + d.qty + ' sold</div></div>' +
      '<div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:' + Math.round(d.qty/maxQ*100) + '%"></div></div></div>' +
      '<div class="prod-rev">' + fmt$(d.rev) + '</div>' +
    '</div>'
  ).join('');
}

// ══════════════════════════════════════════
// RENDER - CUSTOMERS
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
  document.getElementById('custCnt').textContent=list.length+' customers';
  if(!list.length){el.innerHTML='<div class="empty"><div class="e-ico">👥</div><p>No data yet</p></div>';return;}
  el.innerHTML=list.map(c=>
    '<div class="cust-item">' +
      '<div class="cust-av">' + ini(c.tgId) + '</div>' +
      '<div><div class="cust-name">' + esc(c.tgId) + '</div><div class="cust-sub">' + (c.anabul?'🐾 '+esc(c.anabul)+' · ':'') + c.orders + ' order</div></div>' +
      '<div class="cust-total">' + fmt$(c.total) + '</div>' +
    '</div>'
  ).join('');
}

// ══════════════════════════════════════════
// RENDER - PRODUCTS CATALOG
// ══════════════════════════════════════════
function renderProducts(){
  const map={};
  orders.forEach(o=>{
    PRODUCT_META.forEach(p=>{
      const qty=parseInt(o[p.key])||0;
      if(!qty)return;
      if(!map[p.name])map[p.name]={qty:0,rev:0};
      map[p.name].qty+=qty; map[p.name].rev+=qty*p.price;
    });
    if(o.package&&String(o.package).trim()){
      const pkgName = String(o.package).trim();
      const price=PACKAGE_PRICES[pkgName]||10.99;
      const pkgQty=parseInt(o.packageQty)||1;
      if(!map[pkgName])map[pkgName]={qty:0,rev:0};
      map[pkgName].qty+=pkgQty; map[pkgName].rev+=price*pkgQty;
    }
  });
  const items=[
    ...PRODUCT_META.map(p=>({name:p.name,emoji:p.emoji,price:'$'+p.price.toFixed(2)})),
    {name:'Starter Pack',      emoji:'🍱',price:'$10.99'},
    {name:'Weekly Pawby Pack', emoji:'🥩',price:'$21.99'},
  ];
  document.getElementById('prodGrid').innerHTML=items.map(p=>
    '<div class="p-card">' +
      '<div class="p-emoji">' + p.emoji + '</div>' +
      '<h4>' + esc(p.name) + '</h4>' +
      '<div class="p-price">' + p.price + '</div>' +
      '<div class="p-stat"><span>🛒 ' + (map[p.name]?.qty||0) + ' sold</span><span>💰 ' + fmt$(map[p.name]?.rev||0) + '</span></div>' +
    '</div>'
  ).join('');
}

// ══════════════════════════════════════════
// RENDER ALL
// ══════════════════════════════════════════
function renderAll(){
  renderStats();
  const filtered=activeSheet==='all'
    ?orders
    :orders.filter(o=>{
      if(!o.date)return false;
      const parts=o.date.split('-');
      if(parts.length<2) return false;
      return parts[0]+'-'+parts[1]===activeSheet;
    });
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
  document.getElementById('editInfo').innerHTML='<strong>' + esc(o.tgId) + '</strong> · ' + esc(o.date) + ' · ' + esc(o.sheetName);
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
    total:   parseFloat(document.getElementById('eTotal').value)||editingOrder.total,
    bill:    parseFloat(document.getElementById('eBill').value)||editingOrder.bill,
    delivery:document.getElementById('eDelivery').value,
    payment: document.getElementById('ePayment').value,
    time:    document.getElementById('eTime').value,
    anabul:  document.getElementById('eAnabul').value,
  };
  const idx=orders.findIndex(x=>String(x.rowId)===String(editingOrder.rowId)&&x.sheetName===editingOrder.sheetName);
  if(idx!==-1){orders[idx]=Object.assign({},orders[idx],updates);saveLocal();}
  closeEdit(); renderAll();
  setSync('loading','Updating Sheets...');
  const fields=['total','bill','delivery','payment','time','anabul'];
  for(const field of fields){
    await postSheets({action:'updateOrder',rowId:editingOrder.rowId,sheetName:editingOrder.sheetName,field,value:updates[field]});
  }
  setSync('ok','Sheets updated ✓');
  setTimeout(()=>setSync('ok','Synced ✓'),3000);
}

// ══════════════════════════════════════════
// RENDER - STOCK MANAGEMENT
// ══════════════════════════════════════════
let editingStockKey = null;

function renderStockView() {
  const select = document.getElementById('stockProduct');
  select.innerHTML = '<option value="">Select product...</option>' +
    PRODUCT_META.map(p => '<option value="' + p.key + '">' + p.emoji + ' ' + esc(p.name) + '</option>').join('');

  const table = document.getElementById('stockTable');
  
  if (!isSupabaseConnected()) {
    table.innerHTML = '<div class="empty"><div class="e-ico">🔌</div><p>Supabase not connected. Go to Setup to connect.</p></div>';
    return;
  }
  
  const items = PRODUCT_META.map(p => {
    const stock = stocks[p.key] || {};
    const qty = stock.quantity || 0;
    const minQty = stock.minStock || 5;
    const status = getStockStatus(p.key);
    const statusColor = status === 'out' ? '#dc2626' : status === 'low' ? '#ef4444' : status === 'high' ? '#10b981' : '#f59e0b';
    const statusEmoji = status === 'out' ? '🚨' : status === 'low' ? '⚠️' : status === 'high' ? '✅' : '📦';
    const statusLabel = status === 'out' ? 'OUT!' : status;
    
    const lastUpdate = stock.lastUpdated ? new Date(stock.lastUpdated).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';
    
    return '<div class="stock-row' + (status === 'out' || status === 'low' ? ' stock-row-warn' : '') + '">' +
      '<div style="display:flex;align-items:center;gap:12px;flex:1;">' +
        '<span style="font-size:1.5rem;">' + p.emoji + '</span>' +
        '<div style="flex:1">' +
          '<div style="font-weight:600;color:var(--navy);">' + esc(p.name) + '</div>' +
          '<div style="font-size:.72rem;color:var(--muted);">Last: ' + lastUpdate + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:16px;">' +
        '<div style="text-align:right;">' +
          '<div style="display:flex;align-items:baseline;gap:6px;">' +
            '<div style="font-size:1.4rem;font-weight:700;color:' + statusColor + ';">' + qty + '</div>' +
            '<div style="font-size:.75rem;color:var(--muted);">/ ' + minQty + '</div>' +
          '</div>' +
          '<div style="font-size:.68rem;color:var(--muted);">' + statusEmoji + ' ' + statusLabel + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button onclick="openStockEdit(\'' + p.key + '\')" style="padding:6px 12px;background:var(--blue);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:600;">Edit</button>' +
          '<button onclick="openStockHistory(\'' + p.key + '\')" style="padding:6px 12px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:600;">History</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  table.innerHTML = items || '<div class="empty"><div class="e-ico">📭</div><p>No stock data</p></div>';
}

async function handleQuickAddStock() {
  const productKey = document.getElementById('stockProduct').value;
  const quantity = parseInt(document.getElementById('stockQty').value) || 0;
  const notes = document.getElementById('stockNotes').value;

  if (!productKey || quantity <= 0) {
    alert('⚠️ Please select product and enter quantity');
    return;
  }

  // Disable button while saving
  const btn = document.querySelector('#view-stock .card button[onclick*="handleQuickAddStock"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

  const ok = await addStock(productKey, quantity, notes);
  
  if (ok) {
    document.getElementById('stockQty').value = '';
    document.getElementById('stockNotes').value = '';
    document.getElementById('stockProduct').value = '';
    renderStockView();
    showToast('✅ Added ' + quantity + ' to ' + (stocks[productKey]?.name || productKey), 'success');
  } else {
    showToast('❌ Failed to add stock', 'error');
  }
  
  if (btn) { btn.disabled = false; btn.textContent = '➕ Add Stock Now'; }
}

function openStockEdit(productKey) {
  editingStockKey = productKey;
  const stock = stocks[productKey];
  if (!stock) return;
  document.getElementById('editStockProduct').textContent = stock.emoji + ' ' + stock.name;
  document.getElementById('editStockQty').value = stock.quantity;
  document.getElementById('editStockMin').value = stock.minStock;
  document.getElementById('editStockNotes').value = '';
  document.getElementById('editStockOverlay').classList.add('open');
}

function closeStockEdit() {
  document.getElementById('editStockOverlay').classList.remove('open');
  editingStockKey = null;
}

async function saveStockEdit() {
  if (!editingStockKey) return;
  const qty = parseInt(document.getElementById('editStockQty').value);
  const notes = document.getElementById('editStockNotes').value;
  
  if (qty < 0) { alert('⚠️ Quantity cannot be negative'); return; }
  
  const ok = await updateStock(editingStockKey, qty, notes);
  closeStockEdit();
  if (ok) {
    renderStockView();
    showToast('✅ Stock updated', 'success');
  } else {
    showToast('❌ Failed to update stock', 'error');
  }
}

async function openStockHistory(productKey) {
  const stock = stocks[productKey];
  if (!stock) return;
  
  const modal = document.getElementById('stockHistoryOverlay');
  document.getElementById('historyProductName').textContent = stock.emoji + ' ' + stock.name + ' — History';
  document.getElementById('historyList').innerHTML = '<div class="empty" style="padding:20px;"><p>Loading...</p></div>';
  modal.classList.add('open');
  
  const history = await loadStockHistory(productKey);
  
  if (!history || !history.length) {
    document.getElementById('historyList').innerHTML = '<div class="empty"><div class="e-ico">📋</div><p>No history yet</p></div>';
    return;
  }
  
  document.getElementById('historyList').innerHTML = history.map(h => {
    const date = new Date(h.created_at).toLocaleString('en-US', {
      month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
    });
    const isPositive = h.change_amount > 0;
    const changeColor = isPositive ? '#10b981' : h.change_amount < 0 ? '#ef4444' : 'var(--muted)';
    const changeSign = isPositive ? '+' : '';
    const actionIcon = h.action === 'add' ? '📥' : h.action === 'reduce' ? '📤' : h.action === 'order_deduct' ? '🛒' : '✏️';
    
    return '<div class="history-row">' +
      '<div style="display:flex;align-items:center;gap:10px;flex:1;">' +
        '<span style="font-size:1rem;">' + actionIcon + '</span>' +
        '<div>' +
          '<div style="font-size:.8rem;font-weight:600;color:var(--navy);">' + (h.action || 'update') + '</div>' +
          '<div style="font-size:.68rem;color:var(--muted);">' + date + ' · ' + esc(h.created_by || 'admin') + '</div>' +
          (h.notes ? '<div style="font-size:.68rem;color:var(--muted);margin-top:2px;">📝 ' + esc(h.notes) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="font-size:.9rem;font-weight:700;color:' + changeColor + ';">' + changeSign + h.change_amount + '</div>' +
        '<div style="font-size:.68rem;color:var(--muted);">' + h.quantity_before + ' → ' + h.quantity_after + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadStockHistory(productKey) {
  if (!isSupabaseConnected()) return [];
  return await sbFetch('stock_history?product_id=eq.' + productKey + '&order=created_at.desc&limit=50') || [];
}

function closeStockHistory() {
  document.getElementById('stockHistoryOverlay').classList.remove('open');
}

// Alert panel
function toggleAlertPanel() {
  const panel = document.getElementById('alertPanel');
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    return;
  }
  panel.classList.add('open');
  // Render alerts
  if (!unreadAlerts.length) {
    document.getElementById('alertList').innerHTML = '<div class="empty" style="padding:16px"><p style="font-size:.8rem;">No alerts</p></div>';
    return;
  }
  document.getElementById('alertList').innerHTML = unreadAlerts.map(a => {
    const icon = a.alert_type === 'out_of_stock' ? '🚨' : '⚠️';
    const time = new Date(a.created_at).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:.78rem;">' +
      '<div>' + icon + ' ' + esc(a.message) + '</div>' +
      '<div style="font-size:.65rem;color:var(--muted);margin-top:3px;">' + time + '</div>' +
    '</div>';
  }).join('');
}

function closeAlertPanel() {
  document.getElementById('alertPanel').classList.remove('open');
}

// ══ AUTO REFRESH every 5 minutes ══
setInterval(()=>{ if(SHEETS_URL&&checkSession()) doSync(); }, 5*60*1000);
