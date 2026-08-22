export const palette = {
  ink: '#17191C',
  white: '#FFFFFF',
  purple700: '#4543C7',
  purple600: '#5E5CE6',
  purple300: '#C9C7FA',
  purple200: '#DAD8FF',
  purple100: '#EFEEFF',
  purple50: '#F8F8FF',
  grey700: '#6D737C',
  grey500: '#969BA4',
  grey400: '#C7CAD1',
  grey300: '#D9DCE2',
  grey200: '#E6E8EC',
  grey100: '#F4F5F7',
  red600: '#D94D4D',
  red100: '#FFF0F0',
  orange600: '#B66A15',
  orange100: '#FFF5E6',
  green600: '#249A5A',
  green100: '#EAF8F0',
  blue100: '#EAF3FF',
  camera900: '#111216',
  camera800: '#1A1B20',
  camera700: '#25262C',
  camera600: '#2A2B31',
} as const;

export const colors = {
  backgroundPrimary: palette.white,
  backgroundSecondary: palette.grey100,
  backgroundTertiary: palette.grey100,
  backgroundBrandWeak: palette.purple100,
  foregroundPrimary: palette.ink,
  foregroundSecondary: palette.grey700,
  foregroundTertiary: palette.grey700,
  foregroundDisabled: palette.grey500,
  foregroundInverse: palette.white,
  foregroundBrand: palette.purple600,
  lineDefault: palette.grey200,
  lineStrong: palette.grey300,
  lineFocus: palette.purple600,
  actionPrimary: palette.purple600,
  actionPrimaryPressed: palette.purple700,
  actionSecondary: palette.grey100,
  danger: palette.red600,
  dangerWeak: palette.red100,
  warning: palette.orange600,
  warningWeak: palette.orange100,
  success: palette.green600,
  successWeak: palette.green100,
  infoWeak: palette.blue100,
  cameraBackground: palette.camera900,
  cameraControls: palette.camera800,
  cameraButton: palette.camera700,
  cameraButtonStrong: palette.camera600,
  cameraMuted: palette.grey400,
  cameraGlass: 'rgba(17, 18, 22, 0.16)',
  overlay: 'rgba(17, 18, 22, 0.62)',
  pressOverlay: 'rgba(0, 0, 0, 0.12)',
} as const;

export const fontFamilies = {
  regular: 'NotoSansKRRegular',
  medium: 'NotoSansKRMedium',
  semibold: 'NotoSansKRBold',
  bold: 'NotoSansKRBold',
} as const;

export const typography = {
  display: { fontFamily: fontFamilies.bold, fontSize: 28, lineHeight: 38 },
  h1: { fontFamily: fontFamilies.bold, fontSize: 27, lineHeight: 36 },
  h2: { fontFamily: fontFamilies.bold, fontSize: 25, lineHeight: 35 },
  h3: { fontFamily: fontFamilies.bold, fontSize: 19, lineHeight: 27 },
  title: { fontFamily: fontFamilies.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 23 },
  bodySmall: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 18 },
  micro: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 16 },
} as const;

export const numericText = {
  fontVariant: ['tabular-nums'] as ('tabular-nums')[],
} as const;

export const spacing = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x7: 28,
  x8: 32,
  x10: 40,
  x12: 48,
  x14: 56,
  x16: 64,
  x20: 80,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  button: 16,
  card: 18,
  surface: 20,
  hero: 22,
  feature: 24,
  full: 999,
} as const;

export const shadows = {
  floating: {
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
  },
  bottom: {
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
} as const;

export const layout = {
  figmaWidth: 402,
  figmaHeight: 874,
  contentMaxWidth: 720,
  screenPadding: spacing.x5,
  minimumTouchTarget: 48,
  tabBarHeight: spacing.x20,
} as const;

export const sizes = {
  iconSmall: 28,
  iconButton: 40,
  avatar: 44,
  documentIcon: 46,
  largeIcon: 56,
  tabAction: 46,
  row: 72,
  taskRow: 78,
  compactAction: 42,
  button: 56,
  toggleWidth: 54,
  toggleHeight: 30,
} as const;
