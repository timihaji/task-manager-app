// HSL conversion + effective-colour computation for the per-card colour-wash feature.
// Used by TaskCard and StackView to compute --eff-color and --overlay-rgba inline
// from task.cardColor + the user's saturation / lightness / strength prefs (per-theme).
//
// Why JS instead of CSS relative-color-syntax? Chrome silently fails to resolve
// `hsl(from var(--card-color) ...)` when the source colour is delivered through a
// var() chain inside color-mix(). Computing here sidesteps that.

export function hexToHsl(hex) {
  if (!hex || hex[0] !== '#') return null;
  let s = hex.slice(1);
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  if ([r, g, b].some(Number.isNaN)) return null;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h /= 6;
  }
  return { h: h * 360, s: sat * 100, l: l * 100 };
}

export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function adjusted(hex, satMult, lightShift) {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return {
    h: hsl.h,
    s: Math.max(0, Math.min(100, hsl.s * satMult / 100)),
    l: Math.max(0, Math.min(100, hsl.l + lightShift)),
  };
}

export function effectiveCssColor(hex, satMult, lightShift) {
  const e = adjusted(hex, satMult, lightShift);
  if (!e) return null;
  return `hsl(${e.h.toFixed(1)} ${e.s.toFixed(1)}% ${e.l.toFixed(1)}%)`;
}

export function effectiveRgba(hex, satMult, lightShift, alphaPct) {
  const e = adjusted(hex, satMult, lightShift);
  if (!e) return null;
  const { r, g, b } = hslToRgb(e.h, e.s, e.l);
  return `rgba(${r}, ${g}, ${b}, ${(alphaPct / 100).toFixed(3)})`;
}

// Returns an object suitable for spreading into a React element's style prop.
// Returns {} if cardColor is null/empty so it's safe to call unconditionally.
export function cardColorVars(cardColor, tweaks, theme) {
  if (!cardColor || !tweaks) return {};
  const isLight = theme === 'light';
  const sat        = isLight ? (tweaks.cardColorLightSat ?? 100)         : (tweaks.cardColorDarkSat ?? 100);
  const lightShift = isLight ? (tweaks.cardColorLightLightShift ?? 0)    : (tweaks.cardColorDarkLightShift ?? 0);
  const pct        = isLight ? (tweaks.cardColorLightPct ?? 50)          : (tweaks.cardColorDarkPct ?? 20);
  const eff = effectiveCssColor(cardColor, sat, lightShift);
  const rgba = effectiveRgba(cardColor, sat, lightShift, pct);
  const out = { '--card-color': cardColor };
  if (eff) out['--eff-color'] = eff;
  if (rgba) out['--overlay-rgba'] = rgba;
  return out;
}
