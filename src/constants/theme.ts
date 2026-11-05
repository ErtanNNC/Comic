/** One dark, ink-on-newsprint inspired palette. Comics read best on dark chrome. */
export const C = {
  bg: '#0F0F12',
  surface: '#1A1A1F',
  surfaceHi: '#24242B',
  border: '#2E2E36',
  text: '#F4F1EA',
  textDim: '#A3A1A8',
  textFaint: '#6B6A72',
  accent: '#E8382F',
  accentSoft: '#3A1715',
  success: '#3FBF7F',
  warning: '#F2B33D',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 6, md: 10, lg: 16 } as const;

/** Standard comic cover aspect ratio (width / height). */
export const COVER_RATIO = 0.66;
