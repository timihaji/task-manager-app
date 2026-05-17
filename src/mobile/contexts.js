import { createContext, useContext } from 'react';

export const ThemeContext = createContext('light');
export const AppContext   = createContext(null);
export const DataContext  = createContext(null);

export const useTheme = () => useContext(ThemeContext);
export const useApp   = () => useContext(AppContext);
export const useData  = () => useContext(DataContext);

export function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function haptic(ms = [8]) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch {}
}
