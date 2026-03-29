// ============================================================
//  CONECTADOS EXPRESS — Public Store Logic
// ============================================================
import { supabase, TABLES } from './supabase-client.js';
import { getCart, addToCart, updateBadge, renderCartItems, openCart, closeCart } from './cart.js';

// ── Globals ─────────────────────────────────────────────────
const PAGE_SIZE  = 20;
let   currentPage      = 0;
let   currentCategory  = '';
let   currentSearch    = '';
let   isLoading        = false;
let   hasMore          = true;
const CACHE_KEY        = 'store_cache_products';
const CACHE_CONFIG_KEY = 'store_cache_config';
const CACHE_TTL        = 1000 * 60 * 30; // 30 minutes

// ── DOM refs ─────────────────────────────────────────────────
const grid       = document.getElementById('product-grid');
const sentinel   = document.getElementById('load-sentinel');
const searchInput= document.getElementById('search-input');
const searchBtn  = document.getElementById('search-btn');
const catNav     = document.getElementById('cat-nav');

// ── Init ─────────────────────────────────────────────────────
(async function init() {
  loadFromCache(); // Try to show something instantly
  await loadConfig();
  await loadCategories();
  setupSearch();
  setupCart();
  setupInfiniteScroll();
  await fetchProducts(true);
  updateBadge();
  renderCartItems();
})();

function loadFromCache() {
  try {
    const config = JSON.parse(localStorage.getItem(CACHE_CONFIG_KEY));
    if (config) {
      applyConfig(config.banners);
      // applyCategories(config.categories); // Wait for loadCategories to do this cleanly
    }
    const products = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (products && Array.isArray(products)) {
      renderProducts(products, true); // true = append
    }
  } catch (e) {
    console.warn("Cache load failed", e);
  }
}

function saveToCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Cache save failed", e);
  }
}

// ── Config (hero + sidebar) ────────────────────────────────
async function loadConfig() {
  const { data } = await supabase.from(TABLES.banners).select('*');
  if (!data || data.length === 0) return;
  saveToCache(CACHE_CONFIG_KEY, { banners: data, timestamp: Date.now() });
  applyConfig(data);
}

function applyConfig(data) {
  if (!data || !data.length) return;
  // Asumiendo que el ID 1 es el Hero y el ID 2 es el Sidebar (ajustar según sea necesario)
  const heroData = data[0];
  const sideData = data[1] || data[0];

  const heroImg  = document.getElementById('hero-img');
  const heroTxt  = document.getElementById('hero-titulo');
  const sideImg  = document.getElementById('sidebar-img');
  const sideTxt  = document.getElementById('sidebar-titulo');

  if (heroImg && heroData) { 
    heroImg.src = heroData.imagen_url || 'https://i.ibb.co/vzR0yvRW/tech-banner.png'; // Fallback to a high-quality tech banner
    heroImg.alt = heroData.titulo || ''; 
  }
  if (heroTxt && heroData) heroTxt.innerHTML = heroData.titulo;
  if (sideImg && sideData) sideImg.src = sideData.imagen_url;
}

// ── Categories ─────────────────────────────────────────────
async function loadCategories() {
  if (!catNav) return;

  // Cargar categorías únicas desde la base de datos
  const { data, error } = await supabase
    .from(TABLES.catalogo)
    .select('categoria')
    .eq('activo', true);

  let categories = ['Todos'];
  
  if (!error && data) {
    const uniqueCats = [...new Set(data.map(item => item.categoria).filter(Boolean))];
    uniqueCats.sort(); // Ordenar alfabéticamente
    categories = ['Todos', ...uniqueCats];
  }

  catNav.innerHTML = categories.map((c, i) => `
    <button class="cat-pill ${i === 0 ? 'active' : ''}" data-cat="${c === 'Todos' ? '' : c}">${c}</button>
  `).join('');

  catNav.addEventListener('click', e => {
    const btn = e.target.closest('.cat-pill');
    if (!btn) return;
    catNav.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.cat;
    fetchProducts(true);
  });
}

// ── Search ─────────────────────────────────────────────────
function setupSearch() {
  let debounceTimer;
  const doSearch = () => {
    currentSearch = searchInput?.value.trim() || '';
    fetchProducts(true);
  };
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 300);
  });
  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

// ── Fetch products ──────────────────────────────────────────
async function fetchProducts(reset = false) {
  if (isLoading) return;
  if (reset) {
    currentPage = 0;
    hasMore = true;
    if (grid) grid.innerHTML = '';
  }
  if (!hasMore) return;

  isLoading = true;
  showSpinner(true);

  const from = currentPage * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabase
    .from(TABLES.catalogo)
    .select('*', { count: 'exact' })
    .eq('activo', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (currentCategory) query = query.eq('categoria', currentCategory);
  if (currentSearch)   query = query.ilike('nombre', `%${currentSearch}%`);

  const { data, count, error } = await query;

  if (error) { console.error(error); showSpinner(false); isLoading = false; return; }

  if (reset) {
    saveToCache(CACHE_KEY, data);
    grid.innerHTML = ''; // Clear cached products before rendering new ones
  }
  
  renderProducts(data || []);
  currentPage++;
  hasMore = from + PAGE_SIZE < (count || 0);

  if (!hasMore && sentinel) sentinel.style.display = 'none';
  showSpinner(false);
  isLoading = false;

  if (reset && (!data || data.length === 0)) {
    grid.innerHTML = `
      <div class="col-span-4 flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"/>
        </svg>
        <p class="text-lg font-semibold">No se encontraron productos</p>
        <p class="text-sm">Intenta con otra búsqueda o categoría</p>
      </div>`;
  }
}

// ── Render product cards ────────────────────────────────────
function renderProducts(products) {
  if (!grid) return;
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="img-wrap">
        <img src="${p.imagen_url || 'https://placehold.co/300x300/f1f5f9/94a3b8?text=Sin+Imagen'}"
             alt="${p.nombre}" loading="lazy" class="product-img"
             onerror="this.src='https://placehold.co/300x300/f1f5f9/94a3b8?text=Error'">
      </div>
      <div class="card-body">
        <p class="card-name">${p.nombre}</p>
        <div class="stars">${renderStars(p.valoracion || 5)}</div>
        <p class="text-xs text-gray-400">${p.categoria || ''}</p>
        <p class="card-price">$${parseFloat(p.precio).toFixed(2)}</p>
        <div class="card-footer">
          <button class="add-cart-btn" data-id="${p.id}">
            <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
            Añadir al carrito
          </button>
        </div>
      </div>`;
    
    // Image Expansion
    card.querySelector('.product-img').addEventListener('click', () => {
      Swal.fire({
        imageUrl: p.imagen_url,
        imageAlt: p.nombre,
        showConfirmButton: false,
        showCloseButton: true,
        backdrop: 'rgba(0,0,0,0.92)',
        background: 'transparent',
        padding: '0',
        width: 'auto',
        customClass: {
          image: 'expanded-product-image',
          popup: 'transparent-swal'
        }
      });
    });

    card.querySelector('.add-cart-btn').addEventListener('click', () => {
      addToCart(p);
      showToast(`"${p.nombre}" agregado al carrito`, 'success');
    });
    grid.appendChild(card);
  });
}

// ── Stars ───────────────────────────────────────────────────
function renderStars(val) {
  const full  = Math.round(val);
  const empty = 5 - full;
  const starFilled = `<svg class="w-3.5 h-3.5 star-filled" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  const starEmpty = `<svg class="w-3.5 h-3.5 star-empty" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  return starFilled.repeat(full) + starEmpty.repeat(empty);
}

// ── Infinite scroll ─────────────────────────────────────────
function setupInfiniteScroll() {
  if (!sentinel) return;
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !isLoading) {
      fetchProducts(false);
    }
  }, { rootMargin: '200px' });
  observer.observe(sentinel);
}

// ── Cart setup ──────────────────────────────────────────────
function setupCart() {
  document.getElementById('cart-btn')?.addEventListener('click', openCart);
  document.getElementById('cart-close')?.addEventListener('click', closeCart);
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('cart-clear')?.addEventListener('click', () => {
    if (confirm('¿Vaciar el carrito?')) { window.cartModule.clearCart(); }
  });
  
  document.getElementById('checkout-btn')?.addEventListener('click', () => {
    const cart = getCart();
    if (cart.length === 0) {
      showToast('Tu carrito está vacío', 'error');
      return;
    }
    
    let total = 0;
    let text = "Hola *CONECTADOS EXPRESS*, me gustaría hacer el siguiente pedido:\n\n";
    cart.forEach(item => {
      const sub = item.precio * item.qty;
      total += sub;
      text += `- ${item.qty}x ${item.nombre} ($${sub.toFixed(2)})\n`;
    });
    
    text += `\n*Total a pagar: $${total.toFixed(2)}*`;
    
    const phone = "5804125272142";
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  });
}

// ── Spinner ─────────────────────────────────────────────────
function showSpinner(show) {
  const el = document.getElementById('grid-spinner');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Toast ────────────────────────────────────────────────────
export function showToast(msg, type = 'success') {
  Swal.fire({
    text: msg,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2800,
    background: type === 'error' ? '#fee2e2' : '#f0fdf4',
    color: type === 'error' ? '#991b1b' : '#166534'
  });
}
