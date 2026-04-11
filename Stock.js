// ══════════════════════════════════════════
// PAWBY KITCHEN — STOCK ENGINE
// stock.js  •  localStorage + Google Sheets sync
// ══════════════════════════════════════════

const STOCK_KEY   = 'pawby_stock';
const HISTORY_KEY = 'pawby_stock_history';

const PACK_RECIPE = {
  'Starter Pack':      { pawbeefy: 2, chickipaw: 2, pawporkby: 3 },
  'Weekly Pawby Pack': { pawbeefy: 5, chickipaw: 4, pawporkby: 5 },
};

const DEFAULT_STOCK = {
  pawbeefy:  0,
  pawporkby: 0,
  chickipaw: 0,
  blueberry: 0,
  collagen:  0,
  spawghetti:0,
  woofball:  0,
};

// helper: get SHEETS_URL safely (defined in app.js)
function getSheetsUrl() {
  return (typeof SHEETS_URL !== 'undefined' && SHEETS_URL) ? SHEETS_URL : null;
}

// ══════════════════════════════════════════
// LOCAL STORAGE
// ══════════════════════════════════════════
function stockLoad() {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (!raw) return { ...DEFAULT_STOCK };
    return { ...DEFAULT_STOCK, ...JSON.parse(raw) };
  } catch(e) { return { ...DEFAULT_STOCK }; }
}

function stockSave(stock) {
  localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
}

function historyLoad() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch(e) { return []; }
}

function historySave(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 500)));
}

function historyAdd(entries) {
  const history = historyLoad();
  const ts      = new Date();
  const dateStr = ts.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = ts.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  entries.forEach(e => {
    history.unshift({
      id:     ts.getTime() + Math.random(),
      key:    e.key,
      name:   e.name,
      before: e.before,
      after:  e.after,
      delta:  e.delta,
      note:   e.note || '',
      date:   dateStr,
      time:   timeStr,
    });
  });
  historySave(history);
}

// ══════════════════════════════════════════
// GOOGLE SHEETS SYNC
// ══════════════════════════════════════════

// Pull from Sheets → overwrite localStorage
async function stockSyncFromSheets() {
  const url = getSheetsUrl();
  if (!url) return;
  try {
    const res  = await fetch(url + '?action=getStock&t=' + Date.now());
    const data = await res.json();
    if (!data.success) return;
    if (data.stock && Object.keys(data.stock).length > 0) {
      stockSave({ ...DEFAULT_STOCK, ...data.stock });
    }
    if (Array.isArray(data.history) && data.history.length > 0) {
      const normalized = data.history.map(h => ({
        ...h,
        before: parseInt(h.before) || 0,
        after:  parseInt(h.after)  || 0,
        delta:  parseInt(h.delta)  || 0,
      }));
      historySave(normalized);
    }
  } catch(e) {
    console.warn('Stock sync from Sheets failed:', e);
  }
}

// Push stock to Sheets (fire & forget)
async function stockPushToSheets(stock) {
  const url = getSheetsUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveStock', stock }),
    });
  } catch(e) { console.warn('Stock push failed:', e); }
}

// Push history entries to Sheets (fire & forget)
async function historyPushToSheets(entries) {
  const url = getSheetsUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveStockHistory', entries }),
    });
  } catch(e) { console.warn('History push failed:', e); }
}

// Called when Stock view is opened
async function stockInitFromSheets() {
  const url = getSheetsUrl();
  if (!url) { renderStockView(); return; }
  setStockSyncStatus('loading');
  await stockSyncFromSheets();
  setStockSyncStatus('ok');
  renderStockView();
}

function setStockSyncStatus(state) {
  const el = document.getElementById('skSyncBadge');
  if (!el) return;
  const map = {
    loading: { cls:'loading', txt:'Syncing...' },
    ok:      { cls:'ok',      txt:'Synced ✓'  },
    err:     { cls:'err',     txt:'Sync failed'},
    warn:    { cls:'warn',    txt:'Offline mode'},
  };
  const s = map[state] || map.ok;
  el.className = `sync-chip ${s.cls}`;
  el.querySelector('span').textContent = s.txt;
}

async function stockSyncNow() {
  setStockSyncStatus('loading');
  await stockSyncFromSheets();
  setStockSyncStatus('ok');
  renderStockView();
  showToast('🔄 Stock synced from Google Sheets', 'info');
}

// ══════════════════════════════════════════
// TOAST NOTIFICATION
// ══════════════════════════════════════════
function showToast(msg, type = 'ok') {
  document.getElementById('skToast')?.remove();
  const colors = {
    ok:   'background:#D4F0E8;color:#0E7045;border-color:#6EE0A8;',
    err:  'background:#FCE8F0;color:#9A1E30;border-color:#F0B8C2;',
    info: 'background:#E0F5F5;color:#35A0A0;border-color:#C2EDED;',
  };
  const el = document.createElement('div');
  el.id = 'skToast';
  el.style.cssText = `
    position:fixed;bottom:28px;right:24px;z-index:9000;
    padding:11px 18px;border-radius:12px;border:1.5px solid;
    font-family:var(--font);font-size:.82rem;font-weight:600;
    box-shadow:0 6px 24px rgba(11,18,30,.15);
    display:flex;align-items:center;gap:8px;
    animation:toastIn .25s ease;max-width:320px;
    ${colors[type] || colors.ok}
  `;
  el.innerHTML = msg;
  document.body.appendChild(el);
  if (!document.getElementById('toastStyle')) {
    const s = document.createElement('style');
    s.id = 'toastStyle';
    s.textContent = `
      @keyframes toastIn  {from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      @keyframes toastOut {from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(12px)}}
    `;
    document.head.appendChild(s);
  }
  setTimeout(() => {
    el.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

// ══════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════
function stockValidate(order) {
  const stock  = stockLoad();
  const errors = [];
  function checkItem(key, label, qty) {
    if (!qty || qty <= 0) return;
    if ((stock[key] || 0) < qty)
      errors.push(`${label}: need ${qty}, only ${stock[key] || 0} left`);
  }
  PRODUCT_META.forEach(p => checkItem(p.key, p.name, parseInt(order[p.key]) || 0));
  if (order.package && order.packageQty > 0) {
    const recipe = PACK_RECIPE[order.package];
    if (recipe) {
      const qty = parseInt(order.packageQty) || 0;
      Object.entries(recipe).forEach(([key, perPack]) => {
        const needed = perPack * qty;
        const meta   = PRODUCT_META.find(p => p.key === key);
        if ((stock[key] || 0) < needed)
          errors.push(`${meta ? meta.name : key} (for ${order.package} ×${qty}): need ${needed}, only ${stock[key] || 0} left`);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

// ══════════════════════════════════════════
// DEDUCT — called after order saved
// ══════════════════════════════════════════
function stockDeduct(order) {
  const stock    = stockLoad();
  const logItems = [];
  function deduct(key, qty) {
    if (!qty || qty <= 0) return;
    const meta   = PRODUCT_META.find(p => p.key === key);
    const before = stock[key] || 0;
    stock[key]   = Math.max(0, before - qty);
    logItems.push({ key, name: meta ? meta.name : key, before, after: stock[key], delta: -qty, note: 'Order' });
  }
  PRODUCT_META.forEach(p => deduct(p.key, parseInt(order[p.key]) || 0));
  if (order.package && order.packageQty > 0) {
    const recipe = PACK_RECIPE[order.package];
    if (recipe) {
      const qty = parseInt(order.packageQty) || 0;
      Object.entries(recipe).forEach(([key, perPack]) => deduct(key, perPack * qty));
    }
  }
  if (logItems.length) {
    stockSave(stock);
    historyAdd(logItems);
    stockPushToSheets(stock);
    historyPushToSheets(logItems);
  }
}

// ══════════════════════════════════════════
// MANUAL UPDATE
// ══════════════════════════════════════════
function stockManualUpdate(key, newQty, note) {
  const stock  = stockLoad();
  const before = stock[key] || 0;
  const after  = Math.max(0, parseInt(newQty) || 0);
  const delta  = after - before;
  stock[key]   = after;
  stockSave(stock);
  const meta  = PRODUCT_META.find(p => p.key === key);
  const entry = { key, name: meta ? meta.name : key, before, after, delta, note: note || 'Manual update' };
  historyAdd([entry]);
  stockPushToSheets(stock);
  historyPushToSheets([entry]);
  renderStockView();
  showToast(`✅ ${meta ? meta.name : key} updated → <strong>${after}</strong> cups`);
}

// ══════════════════════════════════════════
// EDIT HISTORY ENTRY
// ══════════════════════════════════════════
function stockHistoryEdit(id) {
  const history = historyLoad();
  const idx     = history.findIndex(h => String(h.id) === String(id));
  if (idx === -1) return;
  const entry   = history[idx];
  document.getElementById('skEditModal')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'skEditModal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(11,18,30,.5);
    backdrop-filter:blur(6px);z-index:2000;
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:400px;
      box-shadow:0 16px 48px rgba(11,18,30,.2);border:1.5px solid var(--border);
      animation:mIn .22s ease;overflow:hidden;">
      <div style="padding:18px 22px 14px;border-bottom:1.5px solid var(--border);
        display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:.95rem;font-weight:800;color:var(--navy);">✏️ Edit History Entry</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px;">${entry.name} · ${entry.date} ${entry.time}</div>
        </div>
        <button onclick="document.getElementById('skEditModal').remove()"
          style="width:28px;height:28px;border-radius:50%;border:none;background:var(--bg);
          color:var(--muted);cursor:pointer;font-size:.95rem;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="padding:20px 22px;">
        <div style="background:var(--bg);border-radius:10px;padding:10px 14px;margin-bottom:16px;
          font-size:.78rem;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap;">
          <span>Before: <strong style="color:var(--navy)">${entry.before}</strong></span>
          <span>Previous after: <strong style="color:var(--navy)">${entry.after}</strong></span>
          <span>Delta: <strong style="color:${entry.delta >= 0 ? '#0E7045' : '#9A1E30'}">${entry.delta >= 0 ? '+' : ''}${entry.delta}</strong></span>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:.72rem;font-weight:700;color:var(--navy);margin-bottom:6px;">
            Correct Stock Value (After)
          </label>
          <input type="number" id="skEditAfter" min="0" value="${entry.after}"
            style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;
            font-family:var(--font);font-size:.9rem;font-weight:700;color:var(--navy);
            background:var(--bg);outline:none;box-sizing:border-box;"
            onfocus="this.style.borderColor='var(--teal)';this.style.boxShadow='0 0 0 3px rgba(74,191,191,.12)'"
            onblur="this.style.borderColor='var(--border)';this.style.boxShadow='none'">
          <div style="font-size:.68rem;color:var(--muted);margin-top:5px;">
            💡 Stock for <strong>${entry.name}</strong> will be immediately updated to this value.
          </div>
        </div>
        <div>
          <label style="display:block;font-size:.72rem;font-weight:700;color:var(--navy);margin-bottom:6px;">Note</label>
          <input type="text" id="skEditNote" value="${entry.note || ''}" placeholder="Reason for correction..."
            style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;
            font-family:var(--font);font-size:.83rem;color:var(--text);
            background:var(--bg);outline:none;box-sizing:border-box;"
            onfocus="this.style.borderColor='var(--teal)';this.style.boxShadow='0 0 0 3px rgba(74,191,191,.12)'"
            onblur="this.style.borderColor='var(--border)';this.style.boxShadow='none'"
            onkeydown="if(event.key==='Enter')stockHistoryEditSave('${id}')">
        </div>
      </div>
      <div style="padding:12px 22px 18px;display:flex;gap:8px;justify-content:flex-end;border-top:1.5px solid var(--border);">
        <button onclick="document.getElementById('skEditModal').remove()"
          style="padding:8px 18px;border:1.5px solid var(--border2);border-radius:99px;background:none;
          font-family:var(--font);font-size:.8rem;font-weight:600;color:var(--muted);cursor:pointer;">
          Cancel
        </button>
        <button onclick="stockHistoryEditSave('${id}')"
          style="padding:8px 22px;background:linear-gradient(135deg,var(--teal-dark),var(--teal));
          border:none;border-radius:99px;color:#fff;font-family:var(--font);
          font-size:.8rem;font-weight:700;cursor:pointer;box-shadow:var(--sh-teal);">
          💾 Save Correction
        </button>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('skEditAfter')?.focus(), 50);
}

function stockHistoryEditSave(id) {
  const history  = historyLoad();
  const idx      = history.findIndex(h => String(h.id) === String(id));
  if (idx === -1) return;
  const newAfter = parseInt(document.getElementById('skEditAfter')?.value);
  const newNote  = document.getElementById('skEditNote')?.value?.trim() || history[idx].note;
  if (isNaN(newAfter) || newAfter < 0) {
    const inp = document.getElementById('skEditAfter');
    if (inp) { inp.style.borderColor='var(--red)'; inp.style.boxShadow='0 0 0 3px rgba(232,68,90,.12)'; inp.focus(); }
    return;
  }
  const entry    = history[idx];
  const oldAfter = entry.after;
  history[idx]   = { ...entry, after: newAfter, delta: newAfter - entry.before, note: newNote };
  historySave(history);
  const stock = stockLoad();
  stock[entry.key] = newAfter;
  stockSave(stock);
  stockPushToSheets(stock);
  document.getElementById('skEditModal')?.remove();
  renderStockView();
  showToast(`✏️ ${entry.name} corrected: ${oldAfter} → <strong>${newAfter}</strong> cups`);
}

// ══════════════════════════════════════════
// DELETE HISTORY ENTRY
// ══════════════════════════════════════════
function stockHistoryDelete(id) {
  const history = historyLoad();
  const entry   = history.find(h => String(h.id) === String(id));
  if (!entry) return;
  if (!confirm(`Delete this history entry?\n\n${entry.name} · ${entry.date} ${entry.time}\nStock: ${entry.before} → ${entry.after}\n\nProduct stock will not change.`)) return;
  historySave(history.filter(h => String(h.id) !== String(id)));
  renderStockView();
  showToast('🗑️ History entry deleted — stock unchanged', 'info');
}

// ══════════════════════════════════════════
// RENDER — STOCK VIEW
// ══════════════════════════════════════════
function renderStockView() {
  const el = document.getElementById('stockContent');
  if (!el) return;
  const stock    = stockLoad();
  const lowCount = PRODUCT_META.filter(p => (stock[p.key] || 0) <= 5).length;
  const url      = getSheetsUrl();

  const items = PRODUCT_META.map(p => {
    const qty        = stock[p.key] || 0;
    const level      = qty === 0 ? 'empty' : qty <= 5 ? 'low' : qty <= 15 ? 'mid' : 'ok';
    const levelLabel = { empty:'❌ Out of stock', low:'⚠️ Running low', mid:'🔵 Sufficient', ok:'✅ In stock' };
    const levelClass = { empty:'sl-empty', low:'sl-low', mid:'sl-mid', ok:'sl-ok' };
    const packInfo   = Object.entries(PACK_RECIPE).map(([packName, recipe]) => {
      if (!recipe[p.key]) return null;
      const canMake = Math.floor(qty / recipe[p.key]);
      return `${packName.replace(' Pawby Pack','')}: ${canMake} packs`;
    }).filter(Boolean).join(' · ');

    return `
    <div class="sk-card" id="skcard-${p.key}">
      <div class="sk-top">
        <div class="sk-emoji">${p.emoji}</div>
        <div class="sk-info">
          <div class="sk-name">${p.name}</div>
          <div class="sk-price">$${p.price.toFixed(2)} / cup</div>
          ${packInfo ? `<div class="sk-pack-hint">📦 ${packInfo}</div>` : ''}
        </div>
        <div class="sk-right">
          <div class="sk-qty" id="skqty-${p.key}">${qty}</div>
          <div class="sk-unit">cups</div>
          <span class="sk-level ${levelClass[level]}">${levelLabel[level]}</span>
        </div>
      </div>
      <div class="sk-bar-wrap">
        <div class="sk-bar-bg">
          <div class="sk-bar-fill ${levelClass[level]}" style="width:${Math.min(100,qty/30*100).toFixed(1)}%"></div>
        </div>
      </div>
      <div class="sk-input-row">
        <input type="number" min="0" id="skinput-${p.key}" placeholder="Set new qty..." class="sk-input"
          onkeydown="if(event.key==='Enter')stockApplyInput('${p.key}')">
        <input type="text" id="sknote-${p.key}" placeholder="Note (optional)" class="sk-note-input">
        <button class="sk-btn" onclick="stockApplyInput('${p.key}')">Update</button>
        <button class="sk-btn-add" onclick="stockQuickAdd('${p.key}', 10)" title="Quick +10">+10</button>
      </div>
    </div>`;
  }).join('');

  const packRows = Object.entries(PACK_RECIPE).map(([packName, recipe]) => {
    const canMake   = Math.min(...Object.entries(recipe).map(([k,qty]) => Math.floor((stock[k]||0)/qty)));
    const emoji     = packName === 'Starter Pack' ? '🍱' : '🥩';
    const recipeStr = Object.entries(recipe).map(([k,qty]) => {
      const meta = PRODUCT_META.find(p => p.key === k);
      return `${meta ? meta.name : k} ×${qty}`;
    }).join(', ');
    const cls = canMake === 0 ? 'sl-empty' : canMake <= 2 ? 'sl-low' : 'sl-ok';
    return `
    <div class="sk-pack-row">
      <div class="sk-pack-left">
        <span class="sk-pack-emoji">${emoji}</span>
        <div>
          <div class="sk-pack-name">${packName}</div>
          <div class="sk-pack-recipe">${recipeStr}</div>
        </div>
      </div>
      <div class="sk-pack-right">
        <div class="sk-pack-can">Can make: <strong>${canMake}</strong></div>
        <span class="sk-level ${cls}">${canMake===0?'❌ Out of stock':canMake<=2?'⚠️ Low':'✅ OK'}</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
  ${lowCount > 0
    ? `<div class="sk-alert">⚠️ <strong>${lowCount} product${lowCount>1?'s':''}</strong> running low or out of stock. Please restock!</div>`
    : `<div class="sk-alert ok">✅ All stock levels are healthy.</div>`
  }

  <div class="sk-section">
    <div class="sk-section-hdr">
      <h3>📦 Pack Availability</h3>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="sk-section-sub">Based on current ingredient stock</span>
        ${url
          ? `<button id="skSyncBadge" class="sync-chip ok" onclick="stockSyncNow()" style="cursor:pointer;font-size:.68rem;padding:4px 10px;">
               <div class="sync-dot"></div><span>Synced ✓</span>
             </button>`
          : `<span class="sk-section-sub" style="color:var(--orange);">⚠️ Sheets not connected — local only</span>`
        }
      </div>
    </div>
    <div class="sk-pack-list">${packRows}</div>
  </div>

  <div class="sk-section">
    <div class="sk-section-hdr">
      <h3>🥩 Product Stock</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span class="sk-section-sub">Click Update to save changes</span>
        <button class="sk-export-btn" onclick="stockExportCSV()">⬇️ Export CSV</button>
      </div>
    </div>
    <div class="sk-grid">${items}</div>
  </div>

  <div class="sk-section">
    <div class="sk-section-hdr">
      <h3>📋 Stock History</h3>
      <button class="sk-export-btn" onclick="stockExportHistory()">⬇️ Export History</button>
    </div>
    ${renderStockHistory()}
  </div>`;
}

// ══════════════════════════════════════════
// RENDER — HISTORY TABLE
// ══════════════════════════════════════════
function renderStockHistory() {
  const history = historyLoad();
  if (!history.length) {
    return `<div class="empty"><div class="e-ico">📋</div><p>No stock history yet.</p></div>`;
  }
  const filterHtml = `
  <div class="sk-hist-filter">
    <input type="text" id="skHistSearch" placeholder="🔍 Search product..." class="sk-hist-search" oninput="filterStockHistory()">
    <select id="skHistType" class="sk-hist-sel" onchange="filterStockHistory()">
      <option value="">All types</option>
      <option value="order">Order (deduct)</option>
      <option value="manual">Manual update</option>
      <option value="correction">Correction</option>
    </select>
  </div>`;

  const rows = history.slice(0, 100).map(h => {
    const deltaClass   = h.delta > 0 ? 'hist-pos' : h.delta < 0 ? 'hist-neg' : '';
    const deltaStr     = h.delta > 0 ? `+${h.delta}` : `${h.delta}`;
    const isCorrection = (h.note||'').toLowerCase().includes('correction') || (h.note||'').toLowerCase().includes('edit');
    const badgeStyle   = isCorrection ? 'background:var(--pastel-amber);color:#8A5E00;border-color:#F5C842;' : '';
    return `
    <tr data-name="${h.name.toLowerCase()}" data-note="${(h.note||'').toLowerCase()}" id="histrow-${h.id}">
      <td><strong>${h.name}</strong></td>
      <td><span class="hist-delta ${deltaClass}">${deltaStr}</span></td>
      <td class="hist-nums">${h.before} → ${h.after}</td>
      <td class="hide-sm"><span class="sk-note-badge" style="${badgeStyle}">${h.note || '—'}</span></td>
      <td class="hist-date hide-sm">${h.date}</td>
      <td class="hist-date">${h.time}</td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end;">
          <button class="sk-hist-edit-btn" onclick="stockHistoryEdit('${h.id}')" title="Edit this entry">✏️</button>
          <button class="sk-hist-del-btn"  onclick="stockHistoryDelete('${h.id}')" title="Delete this entry">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  ${filterHtml}
  <div class="tbl-wrap sk-hist-wrap">
    <table class="tbl sk-hist-tbl" id="skHistTable">
      <thead><tr>
        <th>Product</th><th>Delta</th><th>Stock</th>
        <th class="hide-sm">Note</th>
        <th class="hide-sm">Date</th><th>Time</th>
        <th style="width:72px"></th>
      </tr></thead>
      <tbody id="skHistBody">${rows}</tbody>
    </table>
  </div>
  ${history.length > 100
    ? `<div style="text-align:center;padding:10px;font-size:.73rem;color:var(--muted)">Showing 100 of ${history.length} records. Export CSV for full history.</div>`
    : ''}`;
}

// ══════════════════════════════════════════
// FILTER HISTORY
// ══════════════════════════════════════════
function filterStockHistory() {
  const search = (document.getElementById('skHistSearch')?.value || '').toLowerCase();
  const type   = (document.getElementById('skHistType')?.value   || '').toLowerCase();
  document.querySelectorAll('#skHistBody tr').forEach(tr => {
    const nameMatch = !search || tr.dataset.name.includes(search);
    const typeMatch = !type   || tr.dataset.note.includes(type);
    tr.style.display = (nameMatch && typeMatch) ? '' : 'none';
  });
}

// ══════════════════════════════════════════
// QUICK ACTIONS
// ══════════════════════════════════════════
function stockApplyInput(key) {
  const inp  = document.getElementById(`skinput-${key}`);
  const note = document.getElementById(`sknote-${key}`);
  const val  = inp?.value?.trim();
  if (val === '' || val === null || isNaN(parseInt(val))) {
    inp?.classList.add('sk-input-err');
    setTimeout(() => inp?.classList.remove('sk-input-err'), 1500);
    return;
  }
  stockManualUpdate(key, parseInt(val), note?.value?.trim() || 'Manual update');
  if (inp)  inp.value  = '';
  if (note) note.value = '';
}

function stockQuickAdd(key, amount) {
  const stock  = stockLoad();
  const before = stock[key] || 0;
  const after  = before + amount;
  stock[key]   = after;
  stockSave(stock);
  const meta  = PRODUCT_META.find(p => p.key === key);
  const entry = { key, name: meta ? meta.name : key, before, after, delta: +amount, note: `Quick +${amount}` };
  historyAdd([entry]);
  stockPushToSheets(stock);
  historyPushToSheets([entry]);
  renderStockView();
  showToast(`✅ ${meta ? meta.name : key} +${amount} → <strong>${after}</strong> cups`);
}

// ══════════════════════════════════════════
// EXPORT CSV
// ══════════════════════════════════════════
function stockExportCSV() {
  const stock = stockLoad();
  const ts    = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  let csv     = 'Product,Key,Stock (cups),Exported At\n';
  PRODUCT_META.forEach(p => {
    csv += `"${p.name}","${p.key}",${stock[p.key]||0},"${ts}"\n`;
  });
  csv += '\n"Pack","Recipe","Can Make"\n';
  Object.entries(PACK_RECIPE).forEach(([packName, recipe]) => {
    const canMake   = Math.min(...Object.entries(recipe).map(([k,qty]) => Math.floor((stock[k]||0)/qty)));
    const recipeStr = Object.entries(recipe).map(([k,qty]) => {
      const m = PRODUCT_META.find(p => p.key === k);
      return `${m ? m.name : k}×${qty}`;
    }).join(' + ');
    csv += `"${packName}","${recipeStr}",${canMake}\n`;
  });
  downloadCSV(csv, `pawby-stock-${Date.now()}.csv`);
}

function stockExportHistory() {
  const history = historyLoad();
  if (!history.length) { alert('No stock history yet.'); return; }
  let csv = 'Product,Delta,Stock Before,Stock After,Note,Date,Time\n';
  history.forEach(h => {
    csv += `"${h.name}",${h.delta},${h.before},${h.after},"${h.note||''}","${h.date}","${h.time}"\n`;
  });
  downloadCSV(csv, `pawby-stock-history-${Date.now()}.csv`);
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
