/**
 * FilaBro UI System – zentrale Token-Datei
 * Phase 1 UI-Härtung
 *
 * Alle neuen Komponenten und Screen-Anpassungen referenzieren diese Datei.
 * Keine Logik, keine Abhängigkeiten – nur Konstanten.
 */

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
} as const;

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  pill: 999,
} as const;

export const typography = {
  /** Sekundäre Badge-Beschriftung, 10 px */
  labelSm: {
    fontSize:      10,
    fontFamily:    "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  /** Abschnittstitel uppercase, 11–12 px */
  label: {
    fontSize:      12,
    fontFamily:    "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  /** Standard-Lauftext, 14 px regular */
  body: {
    fontSize:   14,
    fontFamily: "Inter_400Regular",
  },
  /** Standard-Lauftext, 14 px medium */
  bodyMd: {
    fontSize:   14,
    fontFamily: "Inter_500Medium",
  },
  /** Sekundärer Fließtext, 13 px */
  bodySm: {
    fontSize:   13,
    fontFamily: "Inter_400Regular",
  },
  /** Card- oder Listen-Name, 15 px semibold */
  bodyLg: {
    fontSize:      15,
    fontFamily:    "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  /** Screen-Titel, 22 px bold */
  title: {
    fontSize:      22,
    fontFamily:    "Inter_700Bold",
    letterSpacing: -0.5,
  },
  /** Sheet-/ Modal-Titel, 20 px bold */
  heading: {
    fontSize:   20,
    fontFamily: "Inter_700Bold",
  },
  /** Hilfstexte und Zeitstempel, 11 px */
  caption: {
    fontSize:   11,
    fontFamily: "Inter_400Regular",
  },
} as const;
