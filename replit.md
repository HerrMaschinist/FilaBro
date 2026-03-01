# FilaBro — Replit.md

## Overview

FilaBro is a mobile app for managing 3D printing filament spools. It connects to a self-hosted **Spoolman** server on the local network to display and manage spool inventory — including remaining weight, filament types, manufacturers, and user favorites.

The app is built with **Expo React Native** targeting Android first, iOS later. It is designed to feel like a real product: fast, modern, and offline-capable. There is also a lightweight **Express.js** server included (for Replit hosting/proxy purposes).

Key user-facing features:
- Browse and search spool inventory from Spoolman
- View spool details and edit remaining weight
- Manual CRUD for manufacturers, filaments, and spools (offline-first)
- Mark spools as favorites
- Barcode/QR scanner to look up spools
- Offline mode with local SQLite persistence and sync queue
- Onboarding flow to configure Spoolman server URL (skippable)
- Settings screen with theme, language, and server management
- Dark Glass UI theme with blur effects and translucent cards

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (Mobile App)

- **Framework**: Expo SDK 54 / React Native 0.81 with TypeScript
- **Navigation**: `expo-router` (file-based routing, similar to Next.js)
  - `app/index.tsx` — entry point, redirects based on onboarding state
  - `app/onboarding.tsx` — first-run server setup screen
  - `app/(tabs)/` — main tab group: Spools, Favorites, Scanner, Settings
  - `app/spool/[id].tsx` — spool detail screen with glass UI and delete action
  - `app/add-manufacturer.tsx` — modal form to create manufacturer
  - `app/add-filament.tsx` — modal form to create filament (with material chips, manufacturer picker)
  - `app/add-spool.tsx` — modal form to create spool (with filament picker)
- **State Management**: React Context (`AppContext`) is the single UI-facing state boundary. Screens never call repositories or API clients directly. AppContext provides full CRUD for manufacturers, filaments, and spools with in-memory web fallback.
- **Data Fetching**: TanStack Query (`@tanstack/react-query`) for server-side cache and request management
- **Fonts**: Inter via `@expo-google-fonts/inter`
- **Animations**: `react-native-reanimated` for spring animations — SpoolCard entry stagger (index-based delay), scanner mode pill slide, AddSheet spring+fade, PressableScale tap feedback
- **Haptics**: `expo-haptics` for tactile feedback
- **i18n**: `i18next` + `react-i18next` with English and German translations in `locales/`

### Data Layer

Three-layer architecture: API → Repository → Domain

1. **Domain Models** (`src/domain/models.ts`): Pure TypeScript interfaces. No imports from DB or API layers. Includes `SyncState` enum (`synced | dirty | pending_push | conflict`).

2. **API Client** (`src/data/api/SpoolmanClient.ts`): Stateless HTTP client. Calls Spoolman REST API endpoints. All functions receive `baseUrl` as a parameter. Handles timeout (8s), cleartext HTTP, and typed network errors.

3. **Repositories** (`src/data/repositories/`): `SpoolRepository`, `FilamentRepository`, `ManufacturerRepository`. Use Drizzle ORM queries against local SQLite. No platform checks — platform differences are handled at the DB client level. All repos expose `createLocal()`, `updateLocal()`, `deleteByLocalId()` for offline-first CRUD.

4. **CatalogService** (`src/features/catalog/CatalogService.ts`): Thin coordinator for catalog CRUD. Delegates to repositories. Provides `MATERIALS` constant. Guards against `isPersistenceEnabled === false`.

5. **SyncService** (`src/data/sync/SyncService.ts`): Orchestrates pull/push between local DB and Spoolman.
   - `pull(baseUrl)` — fetch remote data, merge into local DB
   - `push(baseUrl)` — push dirty local records to server
   - `sync(baseUrl)` — push first, then pull (preserves local changes)
   - **Conflict strategy**: Server wins on all remote fields. `isFavorite` is local-only, never overwritten. Last-write-wins from server perspective when conflicts occur.

### Local Database

- **Engine**: `expo-sqlite` (SQLite on-device)
- **ORM**: `drizzle-orm` with SQLite dialect
- **Schema** (`src/data/db/schema.ts`): Tables for `manufacturers`, `filaments`, `spools`, `syncMeta`, and `pendingUpdates`
  - manufacturers: `website` text field
  - filaments: `printTempMin` int, `printTempMax` int, `density` real
  - spools: `displayName` text, `qrCode` text, `nfcTagId` text
- **Migrations**: Versioned SQL migration array in `src/data/db/client.ts`. Append-only — never edit existing entries. `CURRENT_SCHEMA_VERSION = 2`.
- **Web fallback** (`src/data/db/client.web.ts`): Metro resolves this file instead of `client.ts` on web. All reads return `[]`, all writes reject. `isPersistenceEnabled = false`. Repositories are unaware of this — they just call `getDb()`.
- **Web demo mode**: When `isPersistenceEnabled === false`, AppContext seeds 6 demo spools, 4 demo manufacturers, and 6 demo filaments from `src/data/demo/demoData.ts`. Favorites toggle, weight edits, and catalog CRUD work in-memory only. A `WebPreviewBanner` component shows "Web Preview — data is not persisted" on web.
- **Error classes** (`src/data/api/errors.ts`): `NetworkError`, `TimeoutError`, `ApiError`, `ParseError`, `UnsupportedFeatureError` + `classifyFetchError()` utility.

### Storage

- **Sensitive data** (server URL): `expo-secure-store` on native, `AsyncStorage` on web
- **App preferences** (theme, language, onboarding state, last sync): `AsyncStorage` via `lib/storage.ts`
- Storage keys are centralized in `STORAGE_KEYS` constant

### Backend (Express Server)

- Lightweight Express 5 server in `server/` directory
- Used for Replit hosting/proxy — serves static web build or acts as a relay
- CORS configured for Replit dev/deployment domains and localhost
- Routes defined in `server/routes.ts` (currently minimal — `/api` prefix)
- Shared schema in `shared/schema.ts` uses Drizzle with PostgreSQL dialect (users table with UUID primary keys)
- `drizzle.config.ts` points to PostgreSQL via `DATABASE_URL` env variable

### Theme System

- Dark and light color tokens in `constants/colors.ts`
- Accent color: `#3B82F6` (cool blue)
- Dark mode: deep blue-gray backgrounds (`#0B0F1A`, `#111827`, `#1E293B`)
- Glass UI primitives: `GlassCard` (blur + translucent), `FAB` (floating action button), `GradientBackground`
- Theme preference persisted in AsyncStorage, accessible via `useAppTheme()` hook from AppContext
- Automatic system theme detection via `useColorScheme()`

### UI Components

- `components/ui/GlassCard.tsx` — semi-transparent card with blur (native) / CSS backdrop-filter (web)
- `components/ui/FAB.tsx` — floating action button with accent color, positioned bottom-right
- `components/ui/GradientBackground.tsx` — dark gradient background wrapper
- `components/SpoolCard.tsx` — glass-styled spool list card with color bar, progress, badges, favorite. Accepts `index` prop for staggered entry animation.
- `components/ui/PressableScale.tsx` — reusable animated pressable with spring scale+opacity feedback
- Bottom sheet (AddSheet): Reanimated spring slide-up + backdrop fade, `animationType="none"` on Modal for full animation control
- Scanner mode switcher: animated pill (Reanimated `useSharedValue`) slides between QR/NFC tabs; uses accent color #3B82F6 throughout (no legacy teal)

---

## External Dependencies

### Spoolman API (Primary Integration)

The app's core data source. Self-hosted on local network.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/health` | GET | Health check + version |
| `/api/v1/spool` | GET | List all spools (with `?expand[]=filament`) |
| `/api/v1/spool/{id}` | GET | Single spool detail |
| `/api/v1/spool/{id}` | PATCH | Update spool fields (e.g., `remaining_weight`) |

- Default server URL: `http://192.168.50.10:7912`
- HTTP cleartext is explicitly supported (Android `usesCleartextTraffic: true`)
- The app handles HTTP in local network; no HTTPS required for Spoolman

### Key Expo/React Native Packages

| Package | Purpose |
|---|---|
| `expo-camera` | Barcode/QR scanning in Scanner tab |
| `react-native-nfc-manager` | NFC tag reading (Dev Client/EAS build only; graceful fallback in Expo Go and web). `parseTagPayload()` supports JSON, URL, prefix (`spool:42`, `filabro:42`), UUID, and free-text numeric extraction. |
| `expo-secure-store` | Secure storage for server URL |
| `expo-sqlite` | Local SQLite database |
| `expo-haptics` | Tactile feedback |
| `expo-image-picker` | Image selection |
| `expo-blur` | Blur effects for tab bar (iOS) |
| `expo-glass-effect` | Liquid glass tab bar (iOS 26+) |
| `expo-linear-gradient` | Gradient UI elements |
| `expo-sharing` | Share functionality |
| `react-native-reanimated` | Smooth animations |
| `react-native-gesture-handler` | Gesture support |
| `react-native-keyboard-controller` | Keyboard-aware scroll |
| `react-native-safe-area-context` | Safe area insets |

### Database (PostgreSQL)

- Used by the Express server via Drizzle ORM (`drizzle-orm/pg-core`)
- Requires `DATABASE_URL` environment variable
- Currently only has a `users` table (minimal server-side storage)
- Run `npm run db:push` to sync schema to the database

### Internationalization

- `i18next` + `react-i18next`
- Supported languages: English (`locales/en.ts`), German (`locales/de.ts`)
- Language preference persisted and changeable in Settings
- **i18n rules**: No em-dashes (—) in visible UI text; use `. ` or `: ` instead. German strings use proper umlauts (ö, ü, ä, Ö, Ü, Ä). Compound noun hyphens (e.g. "Filament-Sammlung") are acceptable; sentence-level dashes are not.

### Build & Tooling

- **Metro** bundler (Expo default)
- **Babel** with `babel-preset-expo` and `unstable_transformImportMeta`
- **ESBuild** for server production build (`server:build` script)
- **patch-package** runs on `postinstall` for any native patches
- **Replit-specific**: `REPLIT_DEV_DOMAIN` and `EXPO_PUBLIC_DOMAIN` env vars used for dev URL configuration in `expo:dev` script and `lib/query-client.ts`