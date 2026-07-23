// ─── Tokens de diseño ────────────────────────────────────────────────────────
// Paleta cálida y minimalista: verde salvia como acento (evoca lo agrícola/
// fresco del rubro sin caer en un verde genérico), fondos neutros cálidos,
// mucho aire entre elementos, radios grandes. Un solo acento, usado con
// disciplina. Pensado para que los módulos nuevos (Huevos, Productos, etc.)
// importen los mismos valores y todo se sienta parte de un mismo sistema.

export const theme = {
  light: {
    bgMain: "#F7F6F3",
    bgCard: "#FFFFFF",
    bgCard2: "#F2F1EC",
    bgHover: "#ECF4F0",
    border: "#E9E7E0",
    border2: "#DEDCD3",
    textPrimary: "#20241F",
    textSecondary: "#5B6660",
    textMuted: "#93998F",
    accent: "#2F6F5E",
    accentSoft: "#E4F0EC",
    accentStrong: "#245A4C",
    success: "#2F6F5E",
    danger: "#B3452F",
    dangerSoft: "#FBEAE4",
    warning: "#B9852F",
    warningSoft: "#FBF1E1",
  },
  dark: {
    bgMain: "#151815",
    bgCard: "#1D211D",
    bgCard2: "#242923",
    bgHover: "#293630",
    border: "#2A2E28",
    border2: "#343A32",
    textPrimary: "#EDEFEA",
    textSecondary: "#9CA39B",
    textMuted: "#6B716A",
    accent: "#4FAE93",
    accentSoft: "rgba(79,174,147,0.15)",
    accentStrong: "#63C2A6",
    success: "#4FAE93",
    danger: "#D97757",
    dangerSoft: "rgba(217,119,87,0.14)",
    warning: "#D9A857",
    warningSoft: "rgba(217,168,87,0.14)",
  },
  radius: { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },
  font: {
    display: "'Sora', sans-serif",
    body: "'Sora', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
};

export const getTheme = (dark) => (dark ? theme.dark : theme.light);
