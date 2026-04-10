// 🔐 CONFIGURACIÓN SUPABASE - App 2: Gestión de Repartos
(function() {
  'use strict';
  const SUPABASE_URL = 'https://dgfdtwmvyalofmszbnab.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_AzdP6R-UiBe4oecm1emSjQ_AtPRXSkV';
  if (window._dbLoaded) return;
  window._dbLoaded = true;

  let supabaseClient = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); console.log('✅ Supabase listo'); }
    catch (e) { console.warn('⚠️ Error Supabase:', e.message); }
  }

  let isOnline = navigator.onLine;
  window.addEventListener('online', () => { isOnline = true; syncOfflineQueue(); });
  window.addEventListener('offline', () => { isOnline = false; });

  async function getUser() {
    if (!supabaseClient) return null;
    try { const { data } = await supabaseClient.auth.getUser(); return data?.user || null; }
    catch { return null; }
  }

  async function fetchRecords() {
    if (!supabaseClient) return [];
    const user = await getUser();
    if (!user) return [];
    try {
      const { data, error } = await supabaseClient
        .from('delivery_trips')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('Error fetch:', e); return []; }
  }

  async function saveRecord(rec) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    const payload = { ...rec, user_id: user.id };
    payload.odometer_start = parseFloat(rec.odometer_start) || 0;
    payload.odometer_end = parseFloat(rec.odometer_end) || 0;
    payload.price = parseFloat(rec.price) || 0;
    payload.tariff = parseFloat(rec.tariff) || 0;

    if (isOnline && supabaseClient) {
      if (rec.id && rec.id !== 'new') {
        const { error } = await supabaseClient.from('delivery_trips').update(payload).eq('id', rec.id);
        if (error) throw error;
      } else {
        payload.id = crypto.randomUUID();
        const { error } = await supabaseClient.from('delivery_trips').insert([payload]);
        if (error) throw error;
      }
    } else {
      const queue = JSON.parse(localStorage.getItem('app2_offline') || '[]');
      queue.push({ type: 'save', payload });
      localStorage.setItem('app2_offline', JSON.stringify(queue));
    }
  }

  async function deleteRecord(id) {
    const user = await getUser();
    if (!user) throw new Error('No autenticado');
    if (isOnline && supabaseClient) {
      const { error } = await supabaseClient.from('delivery_trips').delete().eq('id', id);
      if (error) throw error;
    } else {
      const queue = JSON.parse(localStorage.getItem('app2_offline') || '[]');
      queue.push({ type: 'delete', id });
      localStorage.setItem('app2_offline', JSON.stringify(queue));
    }
  }

  async function syncOfflineQueue() {
    if (!supabaseClient) return;
    const queue = JSON.parse(localStorage.getItem('app2_offline') || '[]');
    if (!queue.length) return;
    const temp = [...queue]; localStorage.setItem('app2_offline', JSON.stringify([]));
    for (const item of temp) {
      try { item.type === 'save' ? await saveRecord(item.payload) : await deleteRecord(item.id); }
      catch { console.warn('Sync fail'); const q = JSON.parse(localStorage.getItem('app2_offline') || '[]'); q.push(item); localStorage.setItem('app2_offline', JSON.stringify(q)); }
    }
  }

  window.db = {
    supabase: supabaseClient,
    signUp: (e,p) => supabaseClient?.auth.signUp({email:e,password:p}),
    signIn: (e,p) => supabaseClient?.auth.signInWithPassword({email:e,password:p}),
    signOut: () => supabaseClient?.auth.signOut(),
    getCurrentUser: getUser,
    fetchRecords, saveRecord, deleteRecord, syncOfflineQueue, isOnline: () => isOnline
  };
  console.log('✅ db.js App 2 cargado');
})();