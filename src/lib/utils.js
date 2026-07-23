// ─── Utilidades compartidas ─────────────────────────────────────────────────
// Usadas tanto por App.jsx como por los módulos separados (HuevosModule, etc.)
// para evitar duplicar lógica y que quede una sola fuente de verdad.

export const API = import.meta.env.VITE_API_URL || "https://inventario-backend-ftw6.onrender.com";

export const fmt = (n) => `$${Number(n || 0).toLocaleString("es-CL")}`;
export const fmtIVA = (n) => `$${Math.round(Number(n || 0)).toLocaleString("es-CL")}`;

export const todayLocalISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
};
