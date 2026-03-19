/**
 * UI design tokens.
 * Derived from existing hardcoded values across the codebase.
 * Colors are NOT duplicated here – they live in constants/colors.ts.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 2,   // handle bar
  sm: 8,   // chips, badges, small buttons
  md: 10,  // inputs, save button
  lg: 12,  // search row, cards
  xl: 20,  // GlassCard default
  xxl: 24, // bottom sheets
} as const;

export const fontSize = {
  xxs: 10, // raw metadata labels
  xs: 11,  // card titles, section headers
  sm: 12,  // secondary labels, badges
  base: 13, // body small, info rows
  md: 14,  // body, list items
  lg: 15,  // body large, buttons
  xl: 18,  // sub-headings, inputs
  h3: 20,  // modal titles
  h2: 22,  // screen titles
  h1: 32,  // hero screen header
} as const;

export const fontWeight = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const letterSpacing = {
  tight:  -0.5,
  normal:  0,
  wide:    0.5,
  wider:   0.8,
} as const;

export const typography = {
  title: {
    fontSize: fontSize.h1,
    fontFamily: fontWeight.bold,
    letterSpacing: -1,
  },
  bodyLg: {
    fontSize: fontSize.lg,
    fontFamily: fontWeight.semibold,
  },
  caption: {
    fontSize: fontSize.xs,
    fontFamily: fontWeight.regular,
  },
} as const;

export const shadow = {
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 } as const,
    elevation: 20,
  },
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 } as const,
    elevation: 3,
  },
} as const;
