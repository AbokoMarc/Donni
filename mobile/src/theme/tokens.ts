export const colors = {
  bg: '#F9EFE6',
  surface: '#FBF1E8',
  surfaceAlt: '#F3E5D8',
  sunken: '#E9D8C6',
  ink: '#101C46',
  inkSoft: '#4A5070',
  label: '#8A4E32',
  muted: '#9A8F89',
  border: '#D3A58C',
  borderSoft: '#EBD9CA',
  accent: '#F3751E',
  positive: '#1F7A3E',
  negative: '#A8201A',
  onInk: '#FBF1E8',
  overlay: 'rgba(16, 28, 70, 0.38)',
} as const;

export const radii = {field: 12, card: 16, pill: 999} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const SCREEN_MARGIN = 20;
export const MIN_TOUCH = 44;
export const MAX_FONT_SCALE = 1.3;

export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  display: 'DonniDisplay-Regular',
} as const;

export type TextVariant =
  | 'display'
  | 'moduleTitle'
  | 'title'
  | 'cardTitle'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'caption'
  | 'label'
  | 'overline'
  | 'figure'
  | 'figureLarge';

export interface TextStyleSpec {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

export const typography: Record<TextVariant, TextStyleSpec> = {
  display: {fontFamily: fonts.display, fontSize: 56, lineHeight: 64, letterSpacing: 2},
  moduleTitle: {
    fontFamily: fonts.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {fontFamily: fonts.bold, fontSize: 32, lineHeight: 38},
  cardTitle: {fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24},
  body: {fontFamily: fonts.regular, fontSize: 16, lineHeight: 22},
  bodyStrong: {fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22},
  small: {fontFamily: fonts.regular, fontSize: 14, lineHeight: 20},
  caption: {fontFamily: fonts.regular, fontSize: 13, lineHeight: 18},
  label: {fontFamily: fonts.medium, fontSize: 14, lineHeight: 20},
  overline: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  figure: {fontFamily: fonts.bold, fontSize: 28, lineHeight: 34},
  figureLarge: {fontFamily: fonts.bold, fontSize: 40, lineHeight: 46},
};
