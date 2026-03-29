// ============================================================
//  CONECTADOS EXPRESS — Cart Module (localStorage)
// ============================================================

const CART_KEY = 'ce_cart';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateBadge();
  renderCartItems();
}

export function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  saveCart(cart);
  openCart();
}

export function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== id));
}

export function updateQty(id, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) { item.qty = qty < 1 ? 1 : qty; }
  saveCart(cart);
}

export function clearCart() {
  saveCart([]);
}

// ── Badge ──────────────────────────────────────────────────
export function updateBadge() {
  const count = getCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('[data-cart-badge]').forEach(el => {
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  });
}

// ── Drawer ─────────────────────────────────────────────────
export function openCart() {
  document.getElementById('cart-drawer')?.classList.remove('translate-x-full');
  document.getElementById('cart-overlay')?.classList.remove('hidden');
}

export function closeCart() {
  document.getElementById('cart-drawer')?.classList.add('translate-x-full');
  document.getElementById('cart-overlay')?.classList.add('hidden');
}

export function renderCartItems() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total');
  if (!container) return;

  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
        <p class="text-sm">Tu carrito está vacío</p>
      </div>`;
    if (totalEl) totalEl.textContent = '$0.00';
    return;
  }

  let total = 0;
  container.innerHTML = cart.map(item => {
    const sub = item.precio * item.qty;
    total += sub;
    return `
      <div class="flex gap-3 py-3 border-b border-gray-100 last:border-0">
        <img src="${item.imagen_url || 'https://placehold.co/64x64/e5e7eb/9ca3af?text=?'}"
             class="w-16 h-16 object-contain rounded flex-shrink-0 bg-gray-50" alt="${item.nombre}">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 truncate">${item.nombre}</p>
          <p class="text-brand-blue font-bold text-sm mt-0.5">$${item.precio.toFixed(2)}</p>
          <div class="flex items-center gap-2 mt-1">
            <button onclick="window.cartModule.updateQty(${item.id}, ${item.qty - 1})"
                    class="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold">−</button>
            <span class="text-sm w-5 text-center">${item.qty}</span>
            <button onclick="window.cartModule.updateQty(${item.id}, ${item.qty + 1})"
                    class="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold">+</button>
          </div>
        </div>
        <button onclick="window.cartModule.removeFromCart(${item.id})"
                class="text-gray-400 hover:text-red-500 transition-colors self-start mt-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`;
  }).join('');

  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

// Make cart functions globally accessible for inline handlers
window.cartModule = { addToCart, removeFromCart, updateQty, clearCart, openCart, closeCart };
