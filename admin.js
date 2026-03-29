import { supabase, TABLES, getUser, signOut } from './supabase-client.js';

// ── Auth guard ──────────────────────────────────────────────
(async function authGuard() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  document.getElementById('admin-email').textContent = user.usuario || 'Admin';
  init();
})();

// ── State ────────────────────────────────────────────────────
let editingId  = null;
let currentTab = 'productos';

// ── Init ─────────────────────────────────────────────────────
async function init() {
  setupTabs();
  await loadCatalogue();
  await loadInventory();
  await loadBanners();
  setupCatalogForm();
  setupConfigForm();

  document.getElementById('logout-btn')?.addEventListener('click', () => signOut());
  document.getElementById('add-product-btn')?.addEventListener('click', () => openModal());
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-close-2')?.addEventListener('click', closeModal);
  
  // Inventory Sync events
  document.getElementById('inv-reload-btn')?.addEventListener('click', () => loadInventory());
  document.getElementById('inv-search')?.addEventListener('input', debounce(() => loadInventory(), 300));
  
  // Catalog search
  document.getElementById('admin-search')?.addEventListener('input', debounce(() => loadCatalogue(), 300));
}

// ── Tabs ─────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tabBtn;
      currentTab = target;
      document.querySelectorAll('[data-tab-btn]').forEach(b => {
        b.classList.remove('tab-active', 'bg-white/15', 'text-white');
        b.classList.add('text-white/60');
      });
      btn.classList.add('tab-active', 'bg-white/15', 'text-white');
      btn.classList.remove('text-white/60');
      
      document.querySelectorAll('[data-tab-panel]').forEach(p => {
        p.classList.toggle('hidden', p.dataset.tabPanel !== target);
      });
    });
  });
}

// ── Load Inventory (Central System) ──────────────────────────
async function loadInventory() {
  const tbody = document.getElementById('inv-table-body');
  const searchVal = document.getElementById('inv-search')?.value.trim() || '';
  
  // 1. Obtener IDs que ya están en el catálogo para no duplicar
  const { data: catData } = await supabase.from(TABLES.catalogo).select('origin_id');
  const importedIds = new Set((catData || []).map(item => item.origin_id).filter(Boolean));

  // 2. Cargar inventario central
  let query = supabase.from(TABLES.inventory).select('*').order('id', { ascending: false });
  if (searchVal) query = query.ilike('nombre', `%${searchVal}%`);

  const { data, error } = await query;
  if (error) { 
    showToast(error.message || 'Error de conexión', 'error'); 
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold border-2 border-dashed border-red-200 bg-red-50 rounded-lg">
      ⚠️ Error al cargar inventario: ${error.message}<br>
      <span class="text-[10px] font-normal italic opacity-60">Revisa la consola (F12) para más detalles.</span>
    </td></tr>`;
    return; 
  }

  // 3. Filtrar los que ya existen
  const filteredData = (data || []).filter(p => !importedIds.has(p.id));

  document.getElementById('inv-total').textContent = `${filteredData.length} productos disponibles`;
  
  if (!filteredData.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400">No hay productos nuevos para sincronizar</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredData.map(p => `
    <tr>
      <td>
        <div class="flex items-center gap-3">
          <img src="${p.imagen_url || ''}" class="w-10 h-10 object-contain rounded bg-gray-50 cursor-zoom-in" 
               onclick="window.adminActions.showImagePreview('${p.imagen_url || ''}')"
               onerror="this.style.display='none'">
          <span class="font-medium text-gray-700">${p.nombre}</span>
        </div>
      </td>
      <td class="text-xs text-gray-400">${p.codigo || '—'}</td>
      <td class="font-bold text-brand-blue">$${parseFloat(p.precio_cliente || 0).toFixed(2)}</td>
      <td class="font-bold text-orange-600">$${parseFloat(p.precio_mayor || 0).toFixed(2)}</td>
      <td class="font-bold text-green-600">$${parseFloat(p.precio_gmayor || 0).toFixed(2)}</td>
      <td class="font-medium text-slate-600">${p.stock || 0}</td>
      <td>
        <button onclick="window.adminActions.importProduct(${JSON.stringify(p).replace(/"/g, '&quot;')})" 
                class="btn-blue bg-green-600 hover:bg-green-700 py-1.5 px-3 text-xs">
          Añadir al catálogo
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Load Catalogue (Site 3) ──────────────────────────────────
async function loadCatalogue() {
  const tbody = document.getElementById('products-tbody');
  const searchVal = document.getElementById('admin-search')?.value.trim() || '';
  
  let query = supabase.from(TABLES.catalogo).select('*').order('id', { ascending: false });
  if (searchVal) query = query.ilike('nombre', `%${searchVal}%`);

  const { data, error } = await query;
  if (error) { 
    console.error("Supabase Error [andres_catalogo]:", error);
    showToast(error.message || 'Error al cargar catálogo', 'error'); 
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-600 bg-red-50 p-4 border rounded-xl">
       <div class="mb-2">⚠️ Error 500: Fallo en la comunicación con Supabase</div>
       <p class="text-xs font-normal mb-4">"${error.message}"</p>
       <button onclick="window.location.reload()" class="bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition">Intentar de nuevo</button>
       <p class="text-[10px] text-gray-500 mt-4 leading-normal italic text-center">Si el error persiste, es probable que la tabla <b>andres_catalogo</b> tenga columnas faltantes o políticas RLS incorrectas.</p>
    </td></tr>`;
    return; 
  }

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">Tu catálogo está vacío</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>
        <div class="flex items-center gap-3">
          <img src="${p.imagen_url || ''}" class="w-10 h-10 object-contain rounded bg-gray-50 cursor-zoom-in hover:scale-110 transition-transform" 
               onclick="window.adminActions.showImagePreview('${p.imagen_url || ''}')"
               onerror="this.style.display='none'">
          <span class="font-medium text-gray-700">${p.nombre}</span>
        </div>
      </td>
      <td class="hidden sm:table-cell text-xs">${p.categoria || '—'}</td>
      <td class="font-bold text-brand-blue">$${parseFloat(p.precio || 0).toFixed(2)}</td>
      <td class="text-gray-500">${p.stock || 0}</td>
      <td>
        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${p.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
          ${p.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <div class="flex gap-1.5">
          <button onclick="window.adminActions.editProduct(${p.id})" class="text-blue-600 font-medium hover:underline text-xs">Editar</button>
          <button onclick="window.adminActions.deleteProduct(${p.id})" class="text-red-500 font-medium hover:underline text-xs">Borrar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Catalog Management ───────────────────────────────────────

// ═══ LOCAL PYTHON SERVER for Background Removal ═══
// Server usually runs on http://localhost:5050 (start with tools/start_server.bat)
const BG_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5050' 
  : `http://${window.location.hostname}:5050`;

// Helper: Check if the Python BG removal server is running
async function checkBgServer() {
  try {
    const resp = await fetch(`${BG_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch { return false; }
}

// Helper: Remove background via local Python server (rembg / U2-Net)
async function removeBackgroundViaServer(imageUrl) {
  const resp = await fetch(`${BG_SERVER}/remove-bg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl })
  });
  
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || `Server returned ${resp.status}`);
  }
  
  const result = await resp.json();
  if (!result.success) throw new Error(result.error || 'Processing failed');
  return result.image_data; // data:image/png;base64,...
}

// Helper: Upload a Blob to Supabase Storage and return the public URL
async function uploadToStorage(blob, productName) {
  const safeName = productName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
  const fileName = `catalogo/${safeName}_${Date.now()}.png`;
  
  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(fileName, blob, { contentType: 'image/png', upsert: true });
  
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  
  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);
  
  return urlData.publicUrl;
}

// Helper: Show a processing overlay with animated steps
function showProcessingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'ai-processing-overlay';
  overlay.className = 'fixed inset-0 z-[10002] bg-black/85 flex items-center justify-center backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center mx-4" style="animation: popIn .3s ease-out">
      <div class="mb-6">
        <div class="w-16 h-16 mx-auto border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h3 class="text-lg font-extrabold text-gray-800 mb-2">✨ Procesando Imagen con IA</h3>
      <p id="ai-step-text" class="text-sm text-gray-500 mb-4">Conectando con servidor local...</p>
      <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div id="ai-progress-bar" class="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500" style="width: 5%"></div>
      </div>
      <p class="text-[10px] text-gray-400 mt-4 italic">Procesamiento local con rembg (U2-Net AI) — 100% gratis</p>
    </div>
  `;
  document.body.appendChild(overlay);
  
  return {
    updateStep(text, percent) {
      const stepEl = document.getElementById('ai-step-text');
      const barEl = document.getElementById('ai-progress-bar');
      if (stepEl) stepEl.textContent = text;
      if (barEl) barEl.style.width = percent + '%';
    },
    remove() {
      overlay.remove();
    }
  };
}

async function importProduct(p) {
  // Check if BG server is running before showing the modal
  const serverAvailable = await checkBgServer();
  
  const statusBadge = serverAvailable 
    ? `<div class="p-3 bg-green-50 rounded-lg border border-green-200">
         <div class="flex items-center gap-2 mb-1">
           <span class="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
           <span class="text-xs font-bold text-green-800">SERVIDOR IA CONECTADO</span>
         </div>
         <p class="text-[10px] text-green-600">Al confirmar, la IA eliminará el fondo automáticamente (rembg / U2-Net)</p>
       </div>`
    : `<div class="p-3 bg-amber-50 rounded-lg border border-amber-200">
         <div class="flex items-center gap-2 mb-1">
           <span class="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
           <span class="text-xs font-bold text-amber-800">SERVIDOR IA NO DETECTADO</span>
         </div>
         <p class="text-[10px] text-amber-600">Ejecuta <b>tools/start_server.bat</b> para activar la limpieza de fondo automática</p>
       </div>`;
  
  const res = await Swal.fire({
    title: 'Añadir al catálogo',
    html: `
      <div class="text-left space-y-4 text-sm">
        <p class="font-bold text-center text-lg">${p.nombre}</p>
        
        <div class="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p class="text-[11px] text-blue-800 font-bold uppercase mb-2">Precios de Referencia:</p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-white p-1 rounded border shadow-sm"><p class="text-[9px] text-gray-400">Precio 1</p><p class="font-bold text-blue-600">$${parseFloat(p.precio_cliente || 0).toFixed(2)}</p></div>
            <div class="bg-white p-1 rounded border shadow-sm"><p class="text-[9px] text-gray-400">Precio 2</p><p class="font-bold text-orange-600">$${parseFloat(p.precio_mayor || 0).toFixed(2)}</p></div>
            <div class="bg-white p-1 rounded border shadow-sm"><p class="text-[9px] text-gray-400">Precio 3</p><p class="font-bold text-green-600">$${parseFloat(p.precio_gmayor || 0).toFixed(2)}</p></div>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block font-bold mb-1">Precio para tu tienda (USD) *</label>
            <input id="swal-price" type="number" step="0.01" class="swal2-input !m-0 !w-full" value="${p.precio_cliente || ''}" placeholder="Ej: 25.00">
          </div>
          ${statusBadge}
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: serverAvailable ? '✨ Importar y Limpiar Fondo' : '📦 Importar sin limpiar fondo',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: serverAvailable ? '#7c3aed' : '#3b82f6',
    preConfirm: () => {
      const precio = document.getElementById('swal-price').value;
      if (!precio) { Swal.showValidationMessage('El precio es obligatorio'); return false; }
      return { precio: parseFloat(precio) };
    }
  });

  if (!res.isConfirmed) return;
  
  const { precio } = res.value;
  const originalImageUrl = p.imagen_url || '';
  let finalImageUrl = originalImageUrl;
  
  // ── Auto background removal via local Python server ──
  if (originalImageUrl && serverAvailable) {
    const progress = showProcessingOverlay();
    try {
      // Step 1: Send to server
      progress.updateStep('Enviando imagen al servidor local...', 20);
      
      // Step 2-3: Server downloads + processes (all happens server-side)
      progress.updateStep('Eliminando fondo con IA (rembg)...', 50);
      const processedDataUrl = await removeBackgroundViaServer(originalImageUrl);
      
      progress.updateStep('¡Fondo eliminado con éxito!', 90);
      
      // Step 4: Try to upload to Supabase Storage
      try {
        const blob = await fetch(processedDataUrl).then(r => r.blob());
        finalImageUrl = await uploadToStorage(blob, p.nombre);
        progress.updateStep('✅ Imagen subida a Supabase Storage', 100);
      } catch (uploadErr) {
        console.warn('Storage upload failed, using data URL:', uploadErr);
        finalImageUrl = processedDataUrl; // Use data URL as fallback
        progress.updateStep('✅ Imagen procesada (data URL)', 100);
      }
      
      await new Promise(r => setTimeout(r, 600));
      progress.remove();
      
    } catch (serverError) {
      console.warn('Background removal server error:', serverError);
      progress.remove();
      
      const fallbackRes = await Swal.fire({
        icon: 'warning',
        title: 'Error del servidor',
        html: `<p class="text-sm">${serverError.message}<br>¿Deseas continuar con la imagen original?</p>`,
        showCancelButton: true,
        confirmButtonText: 'Sí, usar original',
        cancelButtonText: 'Cancelar',
      });
      
      if (!fallbackRes.isConfirmed) return;
      finalImageUrl = originalImageUrl;
    }
  }
  
  // ── Insert into catalog ──
  const { error } = await supabase.from(TABLES.catalogo).insert({
    origin_id: String(p.id),
    nombre:  p.nombre,
    codigo:  p.codigo || '',
    precio:  precio,
    stock:   p.stock || 0,
    categoria: p.departamento || p.categoria || 'Generales',
    imagen_url: finalImageUrl,
    activo: true
  });

  if (error) { showToast(error.message || 'Error al guardar', 'error'); return; }
  showToast('✨ Producto añadido con fondo limpio ✓');
  await loadCatalogue();
  await loadInventory(); // Refrescar lista de sincronización para quitar el producto añadido
}

async function editProduct(id) {
  const { data } = await supabase.from(TABLES.catalogo).select('*').eq('id', id).single();
  if (data) openModal(data);
}

async function deleteProduct(id) {
  const res = await Swal.fire({
    title: '¿Eliminar?',
    text: "Esta acción quitará el producto del catálogo de la tienda",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Sí, eliminar'
  });

  if (res.isConfirmed) {
    const { error } = await supabase.from(TABLES.catalogo).delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Producto eliminado');
    loadCatalogue();
  }
}

// ── Modal / Form ─────────────────────────────────────────────
function openModal(item = null) {
  editingId = item ? item.id : null;
  const form = document.getElementById('product-form');
  const title = document.getElementById('modal-title');

  if (item) {
    title.textContent = 'Editar Producto';
    form.nombre.value     = item.nombre || '';
    form.precio.value     = item.precio || 0;
    form.stock.value      = item.stock || 0;
    form.categoria.value  = item.categoria || '';
    form.imagen_url.value = item.imagen_url || '';
    form.activo.checked   = item.activo ?? true;
    updateImgPreview(item.imagen_url);
  } else {
    title.textContent = 'Agregar Producto Manual';
    form.reset();
    updateImgPreview('');
  }
  
  // Add AI button to manual modal if not present
  if (!document.getElementById('manual-ai-btn')) {
    const imgInput = form.imagen_url;
    const btn = document.createElement('button');
    btn.id = 'manual-ai-btn';
    btn.type = 'button';
    btn.className = 'mt-2 w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2';
    btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> ✨ Limpiar fondo con IA`;
    btn.onclick = () => window.adminActions.processAiBackground(imgInput);
    imgInput.parentNode.appendChild(btn);
  }

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

function setupCatalogForm() {
  const form = document.getElementById('product-form');
  form?.querySelector('[name="imagen_url"]')?.addEventListener('input', e => updateImgPreview(e.target.value));
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      nombre:      form.nombre.value.trim(),
      precio:      parseFloat(form.precio.value || 0),
      stock:       parseInt(form.stock.value || 0),
      categoria:   form.categoria.value,
      imagen_url:  form.imagen_url.value.trim(),
      activo:      form.activo.checked
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from(TABLES.catalogo).update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from(TABLES.catalogo).insert(payload));
    }

    if (error) { showToast(error.message, 'error'); return; }
    showToast('Catalog actualizado ✓');
    closeModal();
    loadCatalogue();
  });
}



// ── Banners & Config ─────────────────────────────────────────
async function loadBanners() {
  const container = document.getElementById('config-container');
  if (!container) return;
  const { data, error } = await supabase.from(TABLES.banners).select('*').order('id', { ascending: true });
  if (error) { container.innerHTML = 'Error al cargar configs: ' + error.message; return; }

  // Auto-initialize if empty
  if (!data || data.length === 0) {
    if (window._triedInitBanners) {
       container.innerHTML = '<p class="col-span-full text-center py-4 text-red-500 font-bold">⚠️ La tabla "andres_banners" está vacía y no pudo ser inicializada (Revisa los permisos de inserción en Supabase).</p>';
       return;
    }
    window._triedInitBanners = true;

    const defaultBanners = [
      { id: 1, titulo: 'Las mejores ofertas <br><span class="text-white opacity-90">en tecnología</span>', subtitulo: 'Banner Principal', imagen_url: 'https://i.ibb.co/vzR0yvRW/tech-banner.png' },
      { id: 2, titulo: 'Envío Gratis y Rápido', subtitulo: 'Banner Lateral', imagen_url: 'https://placehold.co/240x400/e60000/ffffff?text=Delivery+Express' }
    ];
    
    const { error: insertErr } = await supabase.from(TABLES.banners).insert(defaultBanners);
    if (insertErr) {
      console.error('Error insertando banners por defecto:', insertErr);
      showToast('No se pudieron crear los banners por defecto de forma automática.', 'error');
    }
    
    // Reload after attempt
    return loadBanners();
  }

  container.innerHTML = data.map(b => `
    <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm transition hover:shadow-md">
      <label class="form-label font-extrabold text-gray-800 text-lg border-b pb-2 mb-3 block">${b.subtitulo || 'Banner ' + b.id}</label>
      <div class="space-y-3">
        <div>
          <label class="text-xs font-bold text-gray-600 mb-1 block">URL de la Imagen</label>
          <input class="form-input banner-url w-full text-sm" data-id="${b.id}" value="${b.imagen_url || ''}" placeholder="https://...">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-600 mb-1 block">Título Principal (Soporta HTML)</label>
          <textarea class="form-input text-sm banner-title w-full h-16 resize-none" data-id="${b.id}" placeholder="Título central">${b.titulo || ''}</textarea>
        </div>
        <div class="hidden">
          <input class="banner-sub" data-id="${b.id}" value="${b.subtitulo || ''}">
        </div>
      </div>
      <div class="mt-3 overflow-hidden rounded-lg border border-gray-300">
         <img src="${b.imagen_url || 'https://placehold.co/600x200/eee/999?text=Sin+Imagen'}" class="w-full h-24 object-cover" onerror="this.src='https://placehold.co/600x200/eee/999?text=Error'">
      </div>
    </div>
  `).join('');
}

function setupConfigForm() {
  document.getElementById('save-config-btn')?.addEventListener('click', async () => {
    const payloads = [];
    document.querySelectorAll('.banner-url').forEach(inp => {
      const id = inp.dataset.id;
      payloads.push({
        id: id,
        imagen_url: inp.value,
        titulo: document.querySelector(`.banner-title[data-id="${id}"]`).value,
        subtitulo: document.querySelector(`.banner-sub[data-id="${id}"]`).value
      });
    });

    for (const p of payloads) {
      await supabase.from(TABLES.banners).update(p).eq('id', p.id);
    }
    showToast('Configuración guardada ✓');
  });
}

// ── Shared Helpers ───────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  const displayMsg = typeof msg === 'object' ? (msg.message || JSON.stringify(msg)) : msg;
  toast.textContent = displayMsg;
  toast.className = `fixed bottom-6 right-6 px-6 py-3 rounded-2xl text-white font-bold z-[10001] shadow-2xl transition-all transform duration-300 translate-y-0 opacity-100 ${type === 'error' ? 'bg-red-600' : 'bg-green-600'}`;
  
  setTimeout(() => {
    toast.className = toast.className.replace('translate-y-0 opacity-100', 'translate-y-10 opacity-0');
  }, 3000);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

async function processAiBackground(inputOrId) {
  const input = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  const url = input.value.trim();
  if (!url) { showToast('Ingresa una URL de imagen primero', 'error'); return; }

  // Create manual overlay (to avoid closing parent Swal)
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-800">Estudio de Limpieza ✨</h3>
        <button id="close-eraser" class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      
      <div class="relative bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-2 mb-4 group overflow-hidden">
        <canvas id="eraser-canvas" class="w-full h-auto cursor-crosshair shadow-sm rounded-lg bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')]"></canvas>
        <div id="eraser-loader" class="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div class="flex flex-col items-center">
            <div class="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs mt-3 font-bold text-gray-600">Procesando imagen...</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <button id="btn-manual-eraser" class="py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
           🪄 Varita Mágica
        </button>
        <button id="btn-ai-auto" class="py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2">
           ✨ IA Automática
        </button>
      </div>

      <div class="flex gap-2">
        <button id="btn-reset-img" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all">
           🔄 Reiniciar
        </button>
        <button id="btn-confirm-eraser" class="flex-[2] py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 shadow-md transition-all">
           Listo, Usar esta imagen
        </button>
      </div>
      
      <p class="text-[10px] text-gray-450 mt-4 text-center italic">
        💡 Toca el fondo para borrarlo con la varita mágica.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
  setupEraserUI(url, overlay, input);
}

// ── Interactive Eraser Setup ──────
function setupEraserUI(originalUrl, overlay, input) {
  const canvas = document.getElementById('eraser-canvas');
  const ctx = canvas.getContext('2d');
  const loader = document.getElementById('eraser-loader');
  let img = new Image();
  img.crossOrigin = 'anonymous';

  const loadImg = (src) => {
    loader.classList.remove('hidden');
    img.onload = () => {
      // Calculate responsive size while preserving aspect ratio
      const maxW = 800;
      const ratio = img.width / img.height;
      canvas.width = Math.min(img.width, maxW);
      canvas.height = canvas.width / ratio;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      loader.classList.add('hidden');
    };
    img.onerror = () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`;
      if (img.src !== proxyUrl) img.src = proxyUrl;
      else {
        loader.classList.add('hidden');
        showToast('No se pudo cargar la imagen', 'error');
      }
    };
    img.src = src;
  };

  loadImg(originalUrl);

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    applyFloodFill(canvas, ctx, x, y);
  };

  document.getElementById('btn-reset-img').onclick = () => loadImg(originalUrl);
  document.getElementById('close-eraser').onclick = () => overlay.remove();
  
  document.getElementById('btn-confirm-eraser').onclick = () => {
    const processedImg = canvas.toDataURL('image/png');
    input.value = processedImg;
    updateImgPreview(processedImg);
    overlay.remove();
    showToast('¡Imagen actualizada! ✨');
  };

  document.getElementById('btn-ai-auto').onclick = async () => {
    loader.classList.remove('hidden');
    try {
      if (!window.imglyBackgroundRemoval) {
         const { removeBackground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@latest/dist/index.js/+esm');
         window.imglyBackgroundRemoval = { removeBackground };
      }
      const config = { model: 'medium', publicPath: 'https://static.img.ly/packages/@imgly/background-removal/1.4.5/dist/' };
      const blob = await window.imglyBackgroundRemoval.removeBackground(canvas.toDataURL(), config);
      loadImg(URL.createObjectURL(blob));
    } catch (err) {
      applyThreshold(canvas, ctx);
    } finally {
      loader.classList.add('hidden');
    }
  };
}

function applyFloodFill(canvas, ctx, startX, startY) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const targetIdx = (startY * canvas.width + startX) * 4;
  const targetR = data[targetIdx], targetG = data[targetIdx + 1], targetB = data[targetIdx + 2], targetA = data[targetIdx + 3];

  if (targetA === 0) return; // Already transparent

  const tolerance = 40; // Adjust for complex backgrounds
  const stack = [[startX, startY]];
  const visited = new Uint8Array(canvas.width * canvas.height);

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const idx = (y * canvas.width + x) * 4;

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height || visited[y * canvas.width + x]) continue;
    visited[y * canvas.width + x] = 1;

    const dr = Math.abs(data[idx] - targetR);
    const dg = Math.abs(data[idx+1] - targetG);
    const db = Math.abs(data[idx+2] - targetB);

    if (dr < tolerance && dg < tolerance && db < tolerance) {
      data[idx+3] = 0; // Transparent
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyThreshold(canvas, ctx) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 230 && data[i+1] > 230 && data[i+2] > 230) data[i+3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

function updateImgPreview(url) {
  const img = document.getElementById('modal-img-preview');
  if (!img) return;
  img.src = url || '';
  img.style.display = url ? 'block' : 'none';
  img.className = 'mt-2 w-32 h-24 object-contain rounded border border-gray-200 bg-gray-50 cursor-zoom-in';
  img.onclick = () => showImagePreview(url);
}

function showImagePreview(url) {
  if (!url) return;
  Swal.fire({
    imageUrl: url,
    imageAlt: 'Vista previa',
    showConfirmButton: false,
    showCloseButton: true,
    background: 'transparent',
    backdrop: 'rgba(0,0,0,0.9)',
    width: 'auto',
    padding: '0',
    customClass: {
      image: 'max-h-[85vh] w-auto rounded-lg shadow-2xl border-4 border-white/10'
    }
  });
}

window.adminActions = { importProduct, editProduct, deleteProduct, processAiBackground, showImagePreview };
