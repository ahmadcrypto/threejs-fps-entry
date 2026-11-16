// The look plan, in one place. A dusk industrial yard: warm amber for Vanguard,
// cold crimson for Revenant, slate and rust for the map, one amber accent for the
// interface. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#17130f',
  surface: '#221c16',
  hairline: '#3a3128',
  ink: '#efe8da',
  muted: '#a89a86',
  accent: '#f0a830',
  vanguard: '#f0a830',
  revenant: '#e5484d',
  siteA: '#f0a830',
  siteB: '#4dc9e5',
  concrete: '#6b6560',
  rust: '#8a5a34',
  containerA: '#7a4a2b',
  containerB: '#2b4a5e',
  containerC: '#4a5e2b',
  steel: '#3d454c',
  hazard: '#e5c53d',
};

export function shade(name) {
  return PALETTE[name];
}
