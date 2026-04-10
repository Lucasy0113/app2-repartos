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

// DOM
let $summary, $list, $pagination, $modal, $form, $fields, $themeBtn, $addBtn, $loadingOverlay, $submitBtn;
let $searchInput, $filterProv, $filterMun, $sortBtn, $clearFilters;
let $userMenuBtn, $drawer, $closeDrawer, $drawerOverlay, $userEmailDisplay, $passForm, $passMsg, $logoutBtn;

// Estado temporal del modal
let tempMunis = [];
let tempClients = [];
let selectedProvinces = new Set();
let sortDir = 'desc'; // desc = reciente primero

document.addEventListener('DOMContentLoaded', async () => {
  loadDOM();
  loadTheme();
  await waitForDb();
  setupAuthListener();
  setupUserMenu();
  setupFilters();
  await checkAuth();
  setupEvents();
  populateFilterMunis();
});

function loadDOM() {
  $summary = document.getElementById('summary'); $list = document.getElementById('list-container');
  $pagination = document.getElementById('pagination'); $modal = document.getElementById('modal');
  $form = document.getElementById('record-form'); $fields = document.getElementById('form-fields');
  $themeBtn = document.getElementById('theme-toggle'); $addBtn = document.getElementById('add-btn');
  $loadingOverlay = document.getElementById('loading-overlay'); $submitBtn = $form?.querySelector('button[type="submit"]');
  $searchInput = document.getElementById('search-input'); $filterProv = document.getElementById('filter-province');
  $filterMun = document.getElementById('filter-municipality'); $sortBtn = document.getElementById('sort-btn');
  $clearFilters = document.getElementById('clear-filters');
  $userMenuBtn = document.getElementById('user-menu-btn'); $drawer = document.getElementById('user-drawer');
  $closeDrawer = document.getElementById('close-drawer'); $drawerOverlay = document.querySelector('.drawer-overlay');
  $userEmailDisplay = document.getElementById('user-email-display');
  $passForm = document.getElementById('change-pass-form'); $passMsg = document.getElementById('pass-msg');
  $logoutBtn = document.getElementById('logout-btn');
}

function showLoading() { if($loadingOverlay)$loadingOverlay.classList.add('active'); if($submitBtn){$submitBtn.disabled=true;$submitBtn.textContent='⏳ Guardando...';} }
function hideLoading() { if($loadingOverlay)$loadingOverlay.classList.remove('active'); if($submitBtn){$submitBtn.disabled=false;$submitBtn.textContent='Guardar';} }

function waitForDb(timeout=5000) {
  return new Promise(r=>{ if(window.db)return r(); const s=Date.now(); const c=()=>window.db||Date.now()-s>timeout?r():setTimeout(c,100); c(); });
}

async function checkAuth() {
  const saved = localStorage.getItem('app2_user');
  if(saved) { try { if(window.db) { const u = await Promise.race([window.db.getCurrentUser(), new Promise(r=>setTimeout(()=>r(null),3000))]); if(u){currentUser=u;if($addBtn)$addBtn.style.display='flex';await loadData();return;} } } catch(e){} }
  if($addBtn)$addBtn.style.display='none'; if($userMenuBtn)$userMenuBtn.style.display='none';
  showLoginModal(); renderList([]); renderSummary(); renderPagination(0);
}

function setupAuthListener() {
  if(!window.db||!window.db.supabase?.auth) return;
  window.db.supabase.auth.onAuthStateChange((evt, sess) => {
    if(evt==='SIGNED_IN'&&sess?.user) { currentUser=sess.user; localStorage.setItem('app2_user', JSON.stringify({id:currentUser.id,email:currentUser.email})); if($modal.open)$modal.close(); if($userMenuBtn)$userMenuBtn.style.display='flex'; if($addBtn)$addBtn.style.display='flex'; loadData().then(renderAll).catch(console.warn); }
    else if(evt==='SIGNED_OUT') { currentUser=null; localStorage.removeItem('app2_user'); allRecords=[]; filteredRecords=[]; if($userMenuBtn)$userMenuBtn.style.display='none'; if($addBtn)$addBtn.style.display='none'; renderAll(); showLoginModal(); }
  });
}

function setupUserMenu() {
  if(!$userMenuBtn) return;
  $userMenuBtn.onclick = () => { if(!currentUser)return; if($userEmailDisplay)$userEmailDisplay.textContent=currentUser.email; document.getElementById('current-pass').value=''; document.getElementById('new-pass').value=''; document.getElementById('confirm-pass').value=''; if($passMsg){$passMsg.textContent='';$passMsg.className='msg';} if($drawer)$drawer.classList.add('open'); };
  const close = () => $drawer?.classList.remove('open');
  $closeDrawer?.onclick = close; $drawerOverlay?.onclick = close;
  $passForm?.onsubmit = async (e) => { e.preventDefault(); const cp=document.getElementById('current-pass').value, np=document.getElementById('new-pass').value, cnp=document.getElementById('confirm-pass').value; if($passMsg){$passMsg.textContent='⏳ Verificando...';$passMsg.className='msg';} if(np!==cnp){$passMsg.textContent='❌ No coinciden';$passMsg.className='msg error';return;} if(cp===np){$passMsg.textContent='❌ Debe ser diferente';$passMsg.className='msg error';return;} showLoading(); try{ const {error:ae}=await window.db.supabase.auth.signInWithPassword({email:currentUser.email,password:cp}); if(ae)throw ae; const {error:ue}=await window.db.supabase.auth.updateUser({password:np}); if(ue)throw ue; $passMsg.textContent='✅ Actualizada';$passMsg.className='msg success'; document.getElementById('current-pass').value=''; document.getElementById('new-pass').value=''; document.getElementById('confirm-pass').value=''; } catch(err){$passMsg.textContent='❌ '+err.message;$passMsg.className='msg error';} finally{hideLoading();} };
  $logoutBtn?.onclick = async () => { if(confirm('¿Cerrar sesión?')){await window.db.signOut(); close();} };
}

function setupFilters() {
  $searchInput?.addEventListener('input', applyFilters);
  $filterProv?.addEventListener('change', () => { populateFilterMunis(); applyFilters(); });
  $filterMun?.addEventListener('change', applyFilters);
  $sortBtn?.addEventListener('click', () => { sortDir = sortDir==='desc'?'asc':'desc'; $sortBtn.textContent = sortDir==='desc'?'⬇️ Reciente':'⬆️ Antiguo'; applyFilters(); });
  $clearFilters?.addEventListener('click', () => { $searchInput.value=''; $filterProv.value=''; populateFilterMunis(); $filterMun.value=''; applyFilters(); });
}

function populateFilterMunis() {
  const prov = $filterProv?.value;
  $filterMun.innerHTML = '<option value="">Todos los Municipios</option>';
  let list = [];
  if(prov) list = MUNICIPIOS[prov] || [];
  else Object.values(MUNICIPIOS).forEach(v=>list.push(...v));
  [...new Set(list)].sort().forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=m; $filterMun.appendChild(o); });
}

function applyFilters() {
  const term = $searchInput.value.toLowerCase().trim();
  const provF = $filterProv.value;
  const munF = $filterMun.value;

  filteredRecords = allRecords.filter(r => {
    if(provF && !r.provinces.includes(provF)) return false;
    if(munF && !r.municipalities.includes(munF)) return false;
    if(term) {
      const str = JSON.stringify(r).toLowerCase();
      if(!str.includes(term) && !String(r.price).includes(term) && !String(r.tariff).includes(term)) return false;
    }
    return true;
  });

  // Ordenamiento
  filteredRecords.sort((a,b) => { const da=new Date(a.date||0), db=new Date(b.date||0); return sortDir==='desc'?db-da:da-db; });

  currentPage = 1;
  renderAll();
}

async function loadData() {
  if(!window.db) return;
  try { allRecords = await window.db.fetchRecords(); applyFilters(); }
  catch(e){console.error('Error cargando:',e); allRecords=[]; filteredRecords=[]; renderAll();}
}

function renderAll() { renderSummary(); renderList(filteredRecords); renderPagination(filteredRecords.length); }

function renderSummary() {
  let totalKM=0, totalMoney=0;
  allRecords.forEach(r => { totalKM += (parseFloat(r.odometer_end)||0) - (parseFloat(r.odometer_start)||0); totalMoney += parseFloat(r.price)||0; });
  if($summary) $summary.innerHTML = `<div class="summary-stat"><span>${totalKM.toFixed(2)}</span>KM Total Recorridos</div><div class="summary-stat"><span>$${totalMoney.toFixed(2)}</span>Dinero Recaudado</div>`;
}

function renderList(records) {
  if(!$list) return;
  const start = (currentPage-1)*ITEMS_PER_PAGE;
  const page = records.slice(start, start+ITEMS_PER_PAGE);
  $list.innerHTML = '';
  if(!page.length){ $list.innerHTML='<p style="text-align:center;padding:2rem;color:var(--text-sec);">No hay registros. Toca + para agregar.</p>'; return; }

  page.forEach(r => {
    const km = ((parseFloat(r.odometer_end)||0)-(parseFloat(r.odometer_start)||0)).toFixed(2);
    const munHtml = r.municipalities.map((m,i)=>`<span class="label" style="background:var(--border);padding:0.2rem 0.5rem;border-radius:4px;font-size:0.8rem;">${i+1}. ${m}</span>`).join('');
    const clientHtml = (r.clients_packages||[]).map((c,i)=>`<div class="record-row"><span class="label">📦 Cliente ${i+1}:</span><span class="value">${c.packages} bultos</span></div>`).join('');

    $list.insertAdjacentHTML('beforeend', `
      <article class="record-card" data-id="${r.id}">
        <div class="record-row"><span class="label"><span class="icon">📅</span>Fecha:</span><span class="value">${formatDate(r.date)}</span></div>
        <div class="record-row"><span class="label"><span class="icon">🛣️</span>Recorrido:</span><span class="value">${r.route_name}</span></div>
        <div class="record-row"><span class="label"><span class="icon">🛣️</span>Odómetro:</span><span class="value">${r.odometer_start} → ${r.odometer_end} km</span></div>
        <div class="record-row"><span class="label"><span class="icon">🔧</span>KM Recorridos:</span><span class="value">${km} km</span></div>
        <div class="record-row"><span class="label"><span class="icon">📍</span>Provincias:</span><span class="value">${r.provinces.join(', ')}</span></div>
        <div style="margin:0.4rem 0;"><span style="font-weight:500;color:var(--text-sec);">🏙️ Municipios (orden):</span><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.3rem;">${munHtml}</div></div>
        ${clientHtml}
        <div class="record-row"><span class="label"><span class="icon">💲</span>Precio:</span><span class="value">$${r.price}</span></div>
        <div class="record-row"><span class="label"><span class="icon">📊</span>Tarifa:</span><span class="value">$${r.tariff}</span></div>
        <div class="record-actions"><button class="edit">Editar</button><button class="delete" style="background:#ef4444;color:white;">Eliminar</button></div>
      </article>`);
  });
}

function renderPagination(total) {
  if(!$pagination) return;
  const pages = Math.ceil(total/ITEMS_PER_PAGE); $pagination.innerHTML='';
  if(pages<=1) return;
  for(let i=1;i<=pages;i++){ const b=document.createElement('button'); b.textContent=i; b.style.fontWeight=i===currentPage?'bold':'normal'; b.onclick=()=>{currentPage=i;renderList(filteredRecords);}; $pagination.appendChild(b); }
}

function setupEvents() {
  $addBtn?.onclick = () => currentUser ? openModal() : showLoginModal();
  document.getElementById('cancel-btn')?.onclick = () => { $modal?.close(); editingId=null; $form?.reset(); resetModalTemp(); };
  $modal?.onclose = () => { editingId=null; $form?.reset(); resetModalTemp(); };
  $form?.onsubmit = saveRecord;

  $list?.onclick = (e) => {
    const card = e.target.closest('[data-id]'); if(!card) return;
    const id = card.dataset.id;
    if(e.target.classList.contains('edit')) currentUser ? openModal(id) : showLoginModal();
    if(e.target.classList.contains('delete')) currentUser ? deleteRecord(id) : showLoginModal();
  };
  $themeBtn?.onclick = toggleTheme;
}

function resetModalTemp() { tempMunis=[]; tempClients=[{packages:1}]; selectedProvinces.clear(); }

function openModal(id=null) {
  if(!currentUser) return showLoginModal();
  editingId=id;
  const r = id ? allRecords.find(x=>x.id===id) : null;
  document.getElementById('modal-title').textContent = id?'Editar Registro':'Nuevo Registro';
  const now = new Date(new Date().getTime()-(new Date().getTimezoneOffset()*60000)).toISOString().slice(0,16);
  if($fields) $fields.innerHTML='';

  if(r) { tempMunis=[...r.municipalities]; selectedProvinces=new Set(r.provinces); tempClients=r.clients_packages||[{packages:1}]; }
  else { resetModalTemp(); }

  $fields.innerHTML = `
    <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Fecha y hora</label><input type="datetime-local" id="f-date" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.date?.slice(0,16)||now}"></div>
    <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Nombre del recorrido</label><input type="text" id="f-route" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.route_name||''}"></div>
    <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;"><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Od. Salida</label><input type="number" id="f-od-start" required step="0.1" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.odometer_start||''}"></div><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Od. Llegada</label><input type="number" id="f-od-end" required step="0.1" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.odometer_end||''}"></div></div>
    
    <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Provincias</label>
      <div style="display:flex;gap:1rem;margin:0.3rem 0;">
        <label style="display:flex;align-items:center;gap:0.3rem;"><input type="checkbox" id="p-Artemisa" ${selectedProvinces.has('Artemisa')?'checked':''} onchange="toggleProv('Artemisa')"> Artemisa</label>
        <label style="display:flex;align-items:center;gap:0.3rem;"><input type="checkbox" id="p-Habana" ${selectedProvinces.has('Habana')?'checked':''} onchange="toggleProv('Habana')"> Habana</label>
      </div>
    </div>

    <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Municipios (Orden de visita)</label>
      <div class="add-row"><select id="sel-mun" style="flex:1;"><option value="">Seleccionar...</option>${getMunOptions()}</select><button type="button" class="add-btn-sm" onclick="addMun()">+ Agregar</button></div>
      <ul id="mun-list" class="dynamic-list">${renderMunList()}</ul>
    </div>

    <div style="margin-bottom:0.8rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Clientes y Bultos</label>
      <div id="clients-container"></div>
      <button type="button" class="add-btn-sm" style="margin-top:0.3rem;" onclick="addClient()">+ Agregar Cliente</button>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;"><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Precio ($)</label><input type="number" id="f-price" required step="0.01" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.price||''}"></div><div style="flex:1;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Tarifa ($)</label><input type="number" id="f-tariff" required step="0.01" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${r?.tariff||''}"></div></div>
  `;

  renderClients();
  window.toggleProv = (p) => selectedProvinces.has(p)?selectedProvinces.delete(p):selectedProvinces.add(p);
  window.addMun = () => { const v=document.getElementById('sel-mun').value; if(v&&!tempMunis.includes(v)) { tempMunis.push(v); document.getElementById('mun-list').innerHTML=renderMunList(); } };
  window.removeMun = (i) => { tempMunis.splice(i,1); document.getElementById('mun-list').innerHTML=renderMunList(); };
  window.addClient = () => { tempClients.push({packages:1}); renderClients(); };
  window.removeClient = (i) => { if(tempClients.length>1){tempClients.splice(i,1);renderClients();} };
  $modal?.showModal();
}

function getMunOptions() {
  const provs = selectedProvinces.size?Array.from(selectedProvinces):PROVINCIAS;
  let opts=''; provs.forEach(p=>MUNICIPIOS[p]?.forEach(m=>opts+=`<option value="${m}">${p} - ${m}</option>`));
  return opts;
}
function renderMunList() { return tempMunis.map((m,i)=>`<li>${i+1}. ${m} <button type="button" onclick="removeMun(${i})">✕</button></li>`).join(''); }
function renderClients() {
  const cont=document.getElementById('clients-container'); if(!cont)return;
  cont.innerHTML=tempClients.map((c,i)=>`<div class="add-row" style="margin-bottom:0.3rem;"><span style="min-width:70px;">Cliente ${i+1}:</span><input type="number" min="0" value="${c.packages}" onchange="tempClients[${i}].packages=parseFloat(this.value)||0" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);"><button type="button" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:0.5rem;cursor:pointer;" onclick="removeClient(${i})">🗑️</button></div>`).join('');
}

async function saveRecord(e) {
  e.preventDefault(); if(!currentUser) return showLoginModal();
  const data = {
    id: editingId||'new', date: document.getElementById('f-date').value,
    route_name: document.getElementById('f-route').value,
    odometer_start: document.getElementById('f-od-start').value,
    odometer_end: document.getElementById('f-od-end').value,
    provinces: Array.from(selectedProvinces),
    municipalities: [...tempMunis],
    clients_packages: tempClients,
    price: document.getElementById('f-price').value,
    tariff: document.getElementById('f-tariff').value
  };

  // ✅ Conversión TZ: Local -> UTC
  if(data.date) data.date = new Date(data.date).toISOString();

  showLoading();
  try {
    await window.db.saveRecord(data);
    await loadData();
    $modal?.close();
  } catch(err) { alert('Error: '+err.message); console.error(err); }
  finally { hideLoading(); }
}

async function deleteRecord(id) {
  if(!confirm('¿Eliminar este registro?')) return; if(!currentUser) return showLoginModal();
  showLoading(); try { await window.db.deleteRecord(id); await loadData(); } catch(err){alert('Error: '+err.message);} finally{hideLoading();}
}

function showLoginModal() {
  document.getElementById('modal-title').textContent='Iniciar Sesión'; if($fields)$fields.innerHTML=`<div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Email</label><input type="email" id="auth-email" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div><div style="margin-bottom:1rem;"><label style="display:block;font-weight:500;margin-bottom:0.3rem;">Contraseña</label><input type="password" id="auth-pass" minlength="6" required style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div><div style="display:flex;gap:0.5rem;"><button type="button" id="auth-login" style="flex:1;padding:0.6rem;background:#dbeafe;color:#1d4ed8;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Entrar</button><button type="button" id="auth-signup" style="flex:1;padding:0.6rem;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Registrarse</button></div><p id="auth-error" style="color:#ef4444;font-size:0.85rem;margin-top:0.5rem;display:none;"></p>`; $modal?.showModal(); const $err=document.getElementById('auth-error'),$log=document.getElementById('auth-login'),$reg=document.getElementById('auth-signup'); $log.onclick=async()=>{const e=document.getElementById('auth-email').value,p=document.getElementById('auth-pass').value;if(!e||!p)return;try{const r=await window.db.signIn(e,p);if(r?.data?.user){currentUser=r.data.user;localStorage.setItem('app2_user',JSON.stringify({id:currentUser.id,email:currentUser.email}));$modal?.close();loadData().then(renderAll);}else{$err.textContent='Error: '+(r?.error?.message||'');$err.style.display='block';}}catch(e){$err.textContent='Error: '+e.message;$err.style.display='block';}}; $reg.onclick=async()=>{const e=document.getElementById('auth-email').value,p=document.getElementById('auth-pass').value;if(!e||!p||p.length<6)return;try{const r=await window.db.signUp(e,p);if(r?.data?.user){currentUser=r.data.user;localStorage.setItem('app2_user',JSON.stringify({id:currentUser.id,email:currentUser.email}));$modal?.close();loadData().then(renderAll);}else{$err.textContent='Error: '+(r?.error?.message||'');$err.style.display='block';}}catch(e){$err.textContent='Error: '+e.message;$err.style.display='block';}}; }

function formatDate(iso){ if(!iso)return ''; return new Date(iso).toLocaleString('es-CU',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',',' -'); }
function loadTheme(){document.body.className=localStorage.getItem('app2_theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
function toggleTheme(){document.body.className=document.body.className==='dark'?'light':'dark';localStorage.setItem('app2_theme',document.body.className);}

if('serviceWorker'in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));