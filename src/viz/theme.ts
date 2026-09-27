/**
 * Téma-segéd: a világos/sötét mód és a canvas-render színeinek összekötése.
 * A `data-theme` attribútum az <html> elemen él — a CSS és a rajzolók is innen olvasnak.
 */

export type Theme = 'light' | 'dark';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function isDarkTheme(): boolean {
  return currentTheme() === 'dark';
}