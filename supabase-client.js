// ============================================================
//  CONECTADOS EXPRESS — Supabase Client
//  ⚠️  FILL IN YOUR CREDENTIALS BELOW BEFORE USING THE APP
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ebkmhvrffajaodsrmgfd.supabase.co';   // ← reemplaza
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVia21odnJmZmFqYW9kc3JtZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzcxMzAsImV4cCI6MjA3NTg1MzEzMH0.bCkXUogywYWQjDAjDZfKh-0QZ-0w_jKE93KNI-Fj3nU';               // ← reemplaza

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const TABLES = {
  inventory: 'products',     // La tabla de donde extrae (Proyecto 2)
  catalogo: 'andres_catalogo', // El catálogo de este sitio 3
  banners: 'andres_banners'   // Banners de este sitio 3
};

// Admin authentication helper (matching Nezer logic)
export function getUser() {
  try {
    const u = sessionStorage.getItem('nzt_admin_user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export async function signIn(usuario, password) {
  const { data, error } = await supabase.rpc('validate_admin', {
    p_usuario: usuario,
    p_password: password
  });
  if (error) throw error;
  if (!data || !data.success) throw new Error(data?.message || 'Credenciales inválidas');

  const userData = { usuario: data.usuario, role: data.role };
  sessionStorage.setItem('nzt_admin_user', JSON.stringify(userData));
  return userData;
}

export function signOut() {
  sessionStorage.removeItem('nzt_admin_user');
  window.location.reload();
}
