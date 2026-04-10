// App 2: Gestión de Repartos - Versión Corregida
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let editingId = null;
let currentUser = null;
let allRecords = [];
let filteredRecords = [];

// Municipios por provincia (Cuba)
const PROVINCIAS = ['Artemisa', 'Habana'];
const MUNICIPIOS = {
  Artemisa: ['Artemisa', 'Alquízar', 'Bahía Honda', 'Bauta', 'Candelaria', 'Caimito', 'Guanajay', 'Güira de Melena', 'La Palma', 'Los Palacios', 'Mariel', 'San Antonio de los Baños', 'San Cristóbal'],
  Habana: ['Arroyo Naranjo', 'Boyeros', 'Centro Habana', 'Cerro', 'Cotorro', 'Diez de Octubre', 'Guanabacoa', 'Habana del Este', 'Habana Vieja', 'La Lisa', 'Marianao', 'Playa', 'Plaza de la Revolución', 'Regla', 'San Miguel del Padrón']
};

// Variables DOM
let $summary, $list, $pagination, $modal, $form, $fields, $themeBtn, $addBtn, $loadingOverlay, $submitBtn;
let $searchInput, $filterProv, $filterMun, $sortBtn, $clearFilters;
let $userMenuBtn, $drawer, $closeDrawer, $drawerOverlay, $userEmailDisplay, $passForm, $passMsg, $logoutBtn;

// Estado temporal
let tempMunis = [];
let tempClients = [];
let selectedProvinces = new Set();
let sortDir = 'desc'; // ⬇️ DESC = Más recientes primero (por defecto)

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando App 2...');
  
  // Cargar referencias DOM
  $summary = document.getElementById('summary');
  $list = document.getElementById('list-container');
  $pagination = document.getElementById('pagination');
  $modal = document.getElementById('modal');
  $form = document.getElementById('record-form');
  $fields = document.getElementById('form-fields');
  $themeBtn = document.getElementById('theme-toggle');
  $addBtn = document.getElementById('add-btn');
  $loadingOverlay = document.getElementById('loading-overlay');
  $submitBtn = document.querySelector('#record-form button[type="submit"]');
  $searchInput = document.getElementById('search-input');
  $filterProv = document.getElementById('filter-province');
  $filterMun = document.getElementById('filter-municipality');
  $sortBtn = document.getElementById('sort-btn');
  $clearFilters = document.getElementById('clear-filters');
  $userMenuBtn = document.getElementById('user-menu-btn');
  $drawer = document.getElementById('user-drawer');
  $closeDrawer = document.getElementById('close-drawer');
  $drawerOverlay = document.querySelector('.drawer-overlay');
  $userEmailDisplay = document.getElementById('user-email-display');
  $passForm = document.getElementById('change-pass-form');
  $passMsg = document.getElementById('pass-msg');
  $logoutBtn = document.getElementById('logout-btn');

  loadTheme();
  await waitForDb();
  setupAuthListener();
  setupUserMenu();
  setupFilters();
  await checkAuth();
  setupMainEvents();
  
  console.log('✅ App 2 inicializada');
});

// ==================== UTILIDADES ====================
function waitForDb(timeout = 5000) {
  return new Promise(resolve => {
    if (window.db) return resolve();
    const start = Date.now();
    const check = () => window.db || Date.now() - start > timeout ? resolve() : setTimeout(check, 100);
    check();
  });
}

function showLoading() {
  if ($loadingOverlay) $loadingOverlay.classList.add('active');
  if ($submitBtn) { $submitBtn.disabled = true; $submitBtn.textContent = '⏳ Guardando...'; }
}
function hideLoading() {
  if ($loadingOverlay) $loadingOverlay.classList.remove('active');
  if ($submitBtn) { $submitBtn.disabled = false; $submitBtn.textContent = 'Guardar'; }
}

// ==================== TEMA ====================
function loadTheme() {
  const saved = localStorage.getItem('app2_theme');
  document.body.className = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function toggleTheme() {
  const next = document.body.className === 'dark' ? 'light' : 'dark';
  document.body.className = next;
  localStorage.setItem('app2_theme', next);
}

// ==================== AUTENTICACIÓN ====================
async function checkAuth() {
  const saved = localStorage.getItem('app2_user');
  if (saved) {
    try {
      if (window.db) {
        const user = await Promise.race([window.db.getCurrentUser(), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (user) {
          currentUser = user;
          if ($addBtn) $addBtn.style.display = 'flex';
          if ($userMenuBtn) $userMenuBtn.style.display = 'flex';
          await loadData();
          return;
        }
      }
    } catch (e) { console.warn('Auth error:', e); }
  }
  if ($addBtn) $addBtn.style.display = 'none';
  if ($userMenuBtn) $userMenuBtn.style.display = 'none';
  showLoginModal();
  renderEmpty();
}

function setupAuthListener() {
  if (!window.db || !window.db.supabase?.auth) return;
  window.db.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      localStorage.setItem('app2_user', JSON.stringify({ id: currentUser.id, email: currentUser.email }));
      if ($modal?.open) $modal.close();
      if ($userMenuBtn) $userMenuBtn.style.display = 'flex';
      if ($addBtn) $addBtn.style.display = 'flex';
      loadData().then(renderAll);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      localStorage.removeItem('app2_user');
      allRecords = []; filteredRecords = [];
      if ($userMenuBtn) $userMenuBtn.style.display = 'none';
      if ($addBtn) $addBtn.style.display = 'none';
      renderAll(); showLoginModal();
    }
  });
}

// ==================== MENÚ USUARIO ====================
function setupUserMenu() {
  if (!$userMenuBtn) return;
  $userMenuBtn.addEventListener('click', () => {
    if (!currentUser) return showLoginModal();
    if ($userEmailDisplay) $userEmailDisplay.textContent = currentUser.email;
    ['current-pass','new-pass','confirm-pass'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
    if ($passMsg) { $passMsg.textContent=''; $passMsg.className='msg'; }
    $drawer?.classList.add('open');
  });
  
  const close = () => $drawer?.classList.remove('open');
  $closeDrawer?.addEventListener('click', close);
  $drawerOverlay?.addEventListener('click', close);
  
  $passForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cp = document.getElementById('current-pass')?.value;
    const np = document.getElementById('new-pass')?.value;
    const cnp = document.getElementById('confirm-pass')?.value;
    if ($passMsg) { $passMsg.textContent='⏳ Verificando...'; $passMsg.className='msg'; }
    if (np !== cnp) { if($passMsg){$passMsg.textContent='❌ No coinciden';$passMsg.className='msg error';} return; }
    if (cp === np) { if($passMsg){$passMsg.textContent='❌ Debe ser diferente';$passMsg.className='msg error';} return; }
    
    showLoading();
    try {
      const { error: ae } = await window.db.supabase.auth.signInWithPassword({ email: currentUser.email, password: cp });
      if (ae) throw ae;
      const { error: ue } = await window.db.supabase.auth.updateUser({ password: np });
      if (ue) throw ue;
      if ($passMsg) { $passMsg.textContent='✅ Actualizada'; $passMsg.className='msg success'; }
      ['current-pass','new-pass','confirm-pass'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
    } catch (err) {
      if ($passMsg) { $passMsg.textContent='❌ '+err.message; $passMsg.className='msg error'; }
    } finally { hideLoading(); }
  });
  
  $logoutBtn?.addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión?')) { await window.db.signOut(); close(); }
  });
}

// ==================== FILTROS Y ORDEN ====================
function setupFilters() {
  $searchInput?.addEventListener('input', applyFilters);
  $filterProv?.addEventListener('change', () => { populateFilterMunis(); applyFilters(); });
  $filterMun?.addEventListener('change', applyFilters);
  
  $sortBtn?.addEventListener('click', () => {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    $sortBtn.textContent = sortDir === 'desc' ? '⬇️ Reciente' : '⬆️ Antiguo';
    applyFilters();
  });
  
  $clearFilters?.addEventListener('click', () => {
    if ($searchInput) $searchInput.value = '';
    if ($filterProv) $filterProv.value = '';
    if ($filterMun) { populateFilterMunis(); $filterMun.value = ''; }
    applyFilters();
  });
  populateFilterMunis();
}

function populateFilterMunis() {
  const prov = $filterProv?.value;
  if (!$filterMun) return;
  $filterMun.innerHTML = '<option value="">Todos los Municipios</option>';
  let list = prov ? (MUNICIPIOS[prov] || []) : Object.values(MUNICIPIOS).flat();
  [...new Set(list)].sort().forEach(m => {
    const o = document.createElement('option'); o.value = m; o.textContent = m; $filterMun.appendChild(o);
  });
}

function applyFilters() {
  const term = ($searchInput?.value || '').toLowerCase().trim();
  const provF = $filterProv?.value || '';
  const munF = $filterMun?.value || '';

  filteredRecords = allRecords.filter(r => {
    if (provF && !r.provinces?.includes(provF)) return false;
    if (munF && !r.municipalities?.includes(munF)) return false;
    if (term) {
      const str = JSON.stringify(r).toLowerCase();
      if (!str.includes(term) && !String(r.price||'').includes(term) && !String(r.tariff||'').includes(term)) return false;
    }
    return true;
  });

  // ✅ Ordenamiento: Por defecto DESC (recientes primero)
  filteredRecords.sort((a, b) => {
    const da = new Date(a.date || 0);
    const db = new Date(b.date || 0);
    return sortDir === 'desc' ? db - da : da - db;
  });

  currentPage = 1;
  renderAll();
}

// ==================== DATOS ====================
async function loadData() {
  if (!window.db) { renderAll(); return; }
  try {
    allRecords = await window.db.fetchRecords();
    applyFilters(); // ✅ Aplica filtros Y orden por defecto al cargar
  } catch (e) {
    console.error('Error cargando:', e);
    allRecords = []; filteredRecords = []; renderAll();
  }
}

function renderAll() { renderSummary(); renderList(filteredRecords); renderPagination(filteredRecords.length); }
function renderEmpty() { renderSummary(); if($list) $list.innerHTML='<p style="text-align:center;padding:2rem;color:var(--text-sec);">Inicia sesión para ver tus registros</p>'; renderPagination(0); }

function renderSummary() {
  if (!$summary) return;
  let totalKM = 0, totalMoney = 0;
  allRecords.forEach(r => {
    totalKM += (parseFloat(r.odometer_end) || 0) - (parseFloat(r.odometer_start) || 0);
    totalMoney += parseFloat(r.price) || 0;
  });
  $summary.innerHTML = `
    <div class="summary-stat"><span>${totalKM.toFixed(2)}</span>KM Total Recorridos</div>
    <div class="summary-stat"><span>$${totalMoney.toFixed(2)}</span>Dinero Recaudado</div>
  `;
}

function renderList(records) {
  if (!$list) return;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const page = records.slice(start, start + ITEMS_PER_PAGE);
  $list.innerHTML = '';
  if (!page.length) { $list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-sec);">No hay registros. Toca + para agregar.</p>'; return; }

  page.forEach(r => {
    const km = ((parseFloat(r.odometer_end) || 0) - (parseFloat(r.odometer_start) || 0)).toFixed(2);
    const munHtml = (r.municipalities || []).map((m, i) => `<span class="label" style="background:var(--border);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.8rem;">${i+1}. ${m}</span>`).join('');
    const clientHtml = (r.clients_packages || []).map((c, i) => `<div class="record-row"><span class="label">📦 Cliente ${i+1}:</span><span class="value">${c.packages} bultos</span></div>`).join('');

    $list.insertAdjacentHTML('beforeend', `
      <article class="record-card" data-id="${r.id}">
        <div class="record-row"><span class="label"><span class="icon">📅</span>Fecha:</span><span class="value">${formatDate(r.date)}</span></div>
        <div class="record-row"><span class="label"><span class="icon">🛣️</span>Recorrido:</span><span class="value">${r.route_name || ''}</span></div>
        <div class="record-row"><span class="label"><span class="icon">🛣️</span>Odómetro:</span><span class="value">${r.odometer_start || 0} → ${r.odometer_end || 0} km</span></div>
        <div class="record-row"><span class="label"><span class="icon">🔧</span>KM Recorridos:</span><span class="value">${km} km</span></div>
        <div class="record-row"><span class="label"><span class="icon">📍</span>Provincias:</span><span class="value">${(r.provinces || []).join(', ')}</span></div>
        <div style="margin:0.4rem 0;"><span style="font-weight:500;color:var(--text-sec);">🏙️ Municipios (orden):</span><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.3rem;">${munHtml}</div></div>
        ${clientHtml}
        <div class="record-row"><span class="label"><span class="icon">💲</span>Precio:</span><span class="value">$${r.price || 0}</span></div>
        <div class="record-row"><span class="label"><span class="icon">📊</span>Tarifa:</span><span class="value">$${r.tariff || 0}</span></div>
        <div class="record-actions"><button class="edit">Editar</button><button class="delete">Eliminar</button></div>
      </article>`);
  });

  $list.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', e => { const c=e.target.closest('.record-card'); if(c&&currentUser) openModal(c.dataset.id); }));
  $list.querySelectorAll('.delete').forEach(btn => btn.addEventListener('click', e => { const c=e.target.closest('.record-card'); if(c&&currentUser) deleteRecord(c.dataset.id); }));
}

function renderPagination(total) {
  if (!$pagination) return;
  const pages = Math.ceil(total / ITEMS_PER_PAGE); $pagination.innerHTML = '';
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.textContent = i; b.style.fontWeight = i === currentPage ? 'bold' : 'normal';
    b.addEventListener('click', () => { currentPage = i; renderList(filteredRecords); });
    $pagination.appendChild(b);
  }
}

// ==================== EVENTOS PRINCIPALES ====================
function setupMainEvents() {
  $addBtn?.addEventListener('click', () => currentUser ? openModal() : showLoginModal());
  document.getElementById('cancel-btn')?.addEventListener('click', () => { $modal?.close(); editingId=null; if($form)$form.reset(); resetModalTemp(); });
  $modal?.addEventListener('close', () => { editingId=null; if($form)$form.reset(); resetModalTemp(); });
  $form?.addEventListener('submit', e => { e.preventDefault(); saveRecord(); });
  $themeBtn?.addEventListener('click', toggleTheme);
}

function resetModalTemp() { tempMunis=[]; tempClients=[{packages:1}]; selectedProvinces.clear(); }

// ==================== MODAL REGISTRO ====================
function openModal(id = null) {
  if (!currentUser) return showLoginModal();
  editingId = id;
  const r = id ? allRecords.find(x => x.id === id) : null;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = id ? 'Editar Registro' : 'Nuevo Registro';
  
  const now = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  if ($fields) $fields.innerHTML = '';

  if (r) { tempMunis=[...(r.municipalities||[])]; selectedProvinces=new Set(r.provinces||[]); tempClients=r.clients_packages||[{packages:1}]; }
  else { resetModalTemp(); }

  if ($fields) {
    $fields.innerHTML = `
      <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Fecha y hora</label><input type="datetime-local" id="f-date" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.date?.slice(0,16)||now}"></div>
      <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Nombre del recorrido</label><input type="text" id="f-route" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.route_name||''}"></div>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;"><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Od. Salida</label><input type="number" id="f-od-start" required step="0.1" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.odometer_start||''}"></div><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Od. Llegada</label><input type="number" id="f-od-end" required step="0.1" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.odometer_end||''}"></div></div>
      
      <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Provincias</label>
        <div style="display:flex;gap:1rem;margin:0.3rem 0;">
          <label style="display:flex;align-items:center;gap:0.3rem;"><input type="checkbox" id="p-Artemisa" ${selectedProvinces.has('Artemisa')?'checked':''} onchange="window.toggleProv('Artemisa')"> Artemisa</label>
          <label style="display:flex;align-items:center;gap:0.3rem;"><input type="checkbox" id="p-Habana" ${selectedProvinces.has('Habana')?'checked':''} onchange="window.toggleProv('Habana')"> Habana</label>
        </div>
      </div>

      <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Municipios (Orden de visita)</label>
        <div style="display:flex;gap:0.4rem;align-items:center;margin:0.4rem 0;">
          <select id="sel-mun" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);"><option value="">Seleccionar...</option>${getMunOptions()}</select>
          <button type="button" onclick="window.addMun()" style="background:var(--primary);color:white;border:none;border-radius:4px;padding:0.5rem;cursor:pointer;">+ Agregar</button>
        </div>
        <ul id="mun-list" style="list-style:none;padding:0;margin:0.3rem 0;">${renderMunList()}</ul>
      </div>

      <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Clientes y Bultos</label>
        <div id="clients-container"></div>
        <button type="button" onclick="window.addClient()" style="margin-top:0.3rem;background:var(--primary);color:white;border:none;border-radius:4px;padding:0.5rem;cursor:pointer;">+ Agregar Cliente</button>
      </div>

      <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;"><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Precio ($)</label><input type="number" id="f-price" required step="0.01" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.price||''}"></div><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Tarifa ($)</label><input type="number" id="f-tariff" required step="0.01" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.tariff||''}"></div></div>
    `;
    
    renderClients();
    window.toggleProv = (p) => { selectedProvinces.has(p)?selectedProvinces.delete(p):selectedProvinces.add(p); const s=document.getElementById('sel-mun'); if(s)s.innerHTML='<option value="">Seleccionar...</option>'+getMunOptions(); };
    window.addMun = () => { const v=document.getElementById('sel-mun')?.value; if(v&&!tempMunis.includes(v)){tempMunis.push(v);document.getElementById('mun-list').innerHTML=renderMunList();} };
    window.addClient = () => { tempClients.push({packages:1}); renderClients(); };
  }
  $modal?.showModal();
}

function getMunOptions() {
  return (selectedProvinces.size?Array.from(selectedProvinces):PROVINCIAS).flatMap(p=>(MUNICIPIOS[p]||[]).map(m=>`<option value="${m}">${p} - ${m}</option>`)).join('');
}
function renderMunList() { return tempMunis.map((m,i)=>`<li style="display:flex;justify-content:space-between;align-items:center;background:var(--border);padding:0.4rem 0.6rem;border-radius:4px;margin-bottom:0.3rem;font-size:0.9rem;">${i+1}. ${m}<button type="button" onclick="window.removeMun(${i})" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;">✕</button></li>`).join(''); }
window.removeMun = (i) => { tempMunis.splice(i,1); document.getElementById('mun-list').innerHTML=renderMunList(); };

function renderClients() {
  const cont = document.getElementById('clients-container'); if (!cont) return;
  cont.innerHTML = tempClients.map((c, i) => `
    <div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.3rem;">
      <span style="min-width:70px;">Cliente ${i+1}:</span>
      <input type="number" min="0" class="client-pkg-input" data-index="${i}" value="${c.packages}" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);">
      <button type="button" class="remove-client-btn" data-index="${i}" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:0.5rem;cursor:pointer;">🗑️</button>
    </div>
  `).join('');

  // ✅ Event listeners robustos para paquetes
  cont.querySelectorAll('.client-pkg-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      tempClients[idx].packages = parseFloat(e.target.value) || 0;
    });
  });
  cont.querySelectorAll('.remove-client-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (tempClients.length > 1) { tempClients.splice(idx, 1); renderClients(); }
    });
  });
}
window.addClient = () => { tempClients.push({packages:1}); renderClients(); };
window.removeClient = (i) => { if(tempClients.length>1){tempClients.splice(i,1);renderClients();} };

// ==================== GUARDAR / ELIMINAR ====================
async function saveRecord() {
  if (!currentUser) return showLoginModal();
  
  // ✅ Lectura directa del DOM para garantizar valores exactos
  const clientPkgs = Array.from(document.querySelectorAll('.client-pkg-input')).map(inp => ({
    packages: parseFloat(inp.value) || 0
  }));

  const data = {
    id: editingId || 'new',
    date: document.getElementById('f-date')?.value,
    route_name: document.getElementById('f-route')?.value,
    odometer_start: document.getElementById('f-od-start')?.value,
    odometer_end: document.getElementById('f-od-end')?.value,
    provinces: Array.from(selectedProvinces),
    municipalities: [...tempMunis],
    clients_packages: clientPkgs, // ✅ Garantiza que se guarda lo que ves
    price: document.getElementById('f-price')?.value,
    tariff: document.getElementById('f-tariff')?.value
  };

  if (data.date) data.date = new Date(data.date).toISOString();

  showLoading();
  try {
    await window.db.saveRecord(data);
    await loadData();
    $modal?.close();
  } catch (err) { alert('Error: ' + err.message); console.error(err); }
  finally { hideLoading(); }
}

async function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  showLoading();
  try { await window.db.deleteRecord(id); await loadData(); }
  catch (err) { alert('Error: ' + err.message); }
  finally { hideLoading(); }
}

// ==================== LOGIN ====================
function showLoginModal() {
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = 'Iniciar Sesión';
  if ($fields) {
    $fields.innerHTML = `
      <div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Email</label><input type="email" id="auth-email" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
      <div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Contraseña</label><input type="password" id="auth-pass" minlength="6" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" id="auth-login" style="flex:1;padding:0.6rem;background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Entrar</button>
        <button type="button" id="auth-signup" style="flex:1;padding:0.6rem;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Registrarse</button>
      </div>
      <p id="auth-error" style="color:#ef4444;font-size:0.85rem;margin-top:0.5rem;display:none;"></p>`;
  }
  $modal?.showModal();
  
  const $err = document.getElementById('auth-error');
  document.getElementById('auth-login')?.addEventListener('click', async () => {
    const e=document.getElementById('auth-email')?.value, p=document.getElementById('auth-pass')?.value;
    if(!e||!p){$err.textContent='Ingresa email y contraseña';$err.style.display='block';return;}
    try {
      const r=await window.db.signIn(e,p);
      if(r?.data?.user){currentUser=r.data.user;localStorage.setItem('app2_user',JSON.stringify({id:currentUser.id,email:currentUser.email}));$modal?.close();loadData().then(renderAll);}
      else{$err.textContent='Error: '+(r?.error?.message||'');$err.style.display='block';}
    } catch(err){$err.textContent='Error: '+err.message;$err.style.display='block';}
  });
  
  document.getElementById('auth-signup')?.addEventListener('click', async () => {
    const e=document.getElementById('auth-email')?.value, p=document.getElementById('auth-pass')?.value;
    if(!e||!p||p.length<6){$err.textContent='Mínimo 6 caracteres';$err.style.display='block';return;}
    try {
      const r=await window.db.signUp(e,p);
      if(r?.data?.user){currentUser=r.data.user;localStorage.setItem('app2_user',JSON.stringify({id:currentUser.id,email:currentUser.email}));$modal?.close();loadData().then(renderAll);}
      else{$err.textContent='Error: '+(r?.error?.message||'');$err.style.display='block';}
    } catch(err){$err.textContent='Error: '+err.message;$err.style.display='block';}
  });
}

function formatDate(iso) { if (!iso) return ''; return new Date(iso).toLocaleString('es-CU', { timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',',' -'); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));