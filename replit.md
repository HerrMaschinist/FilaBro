# FilaBro — Replit.md

## Overview

FilaBro is a mobile application designed for efficient management of 3D printing filament spools. It interfaces with a self-hosted Spoolman server on the local network to provide real-time inventory tracking, including remaining weight, filament types, and manufacturer details. The app prioritizes a fast, modern, and offline-capable user experience.

Key capabilities include:
- Browsing, searching, and managing spool inventory.
- Detailed spool views with editing capabilities for remaining weight and other attributes.
- Offline-first CRUD operations for manufacturers, filaments, and spools.
- Barcode/QR and NFC scanning for quick spool lookup and provisioning.
- Robust offline mode with local SQLite persistence and a synchronization queue.
- User onboarding for Spoolman server configuration and personalized settings.
- A distinctive Dark Glass UI theme with blur effects and translucent elements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)

The mobile application is built with **Expo SDK 54 / React Native 0.81** and **TypeScript**. It leverages `expo-router` for file-based navigation, providing a structured approach to screens such as onboarding, main tabs (Spools, Favorites, Scanner, Settings), and detail/form modals for spools, filaments, and manufacturers.

**State Management**: `AppContext` serves as the central state boundary, abstracting data operations from UI components. It provides full CRUD functionalities for managing local and remote data.
**Data Fetching**: `TanStack Query` is used for efficient server-side caching and request management.
**UI/UX**: Features a Dark Glass UI theme with `react-native-reanimated` for smooth animations, `expo-haptics` for tactile feedback, and `i18next` for internationalization (English and German).

### Data Layer

A three-layer architecture (API → Repository → Domain) ensures clean separation of concerns:
1.  **Domain Models**: Pure TypeScript interfaces defining data structures.
2.  **API Client**: `SpoolmanClient` handles stateless HTTP communication with the Spoolman REST API, supporting cleartext HTTP for local network access.
3.  **Repositories**: Manage data persistence using `drizzle-orm` with `expo-sqlite` for local storage, providing offline-first CRUD capabilities.
4.  **CatalogService**: Coordinates CRUD operations across repositories.
5.  **SyncService**: Orchestrates data synchronization between the local database and the external Spoolman server using a push-then-pull strategy. It employs a "server wins" conflict resolution policy for most fields, while `isFavorite` remains a local-only attribute.
6.  **Hexagonal Port**: `IExternalFilamentSystemPort` uses backend-neutral DTOs, with `SpoolmanAdapter` handling the mapping between Spoolman's snake_case API fields and the application's camelCase domain models, allowing for flexible backend integration.

### Local Database

The app uses `expo-sqlite` with `drizzle-orm` for local data persistence. The schema includes tables for `manufacturers`, `filaments`, `spools`, `syncMeta`, `conflict_snapshots`, `usage_events`, and `spool_stats`. Database migrations are versioned and append-only. Performance optimizations include batch-first synchronization, JOIN views for efficient data retrieval, pagination for lists, and indexed lookups for QR/NFC codes. `spool_stats.remaining_weight` is the primary source of truth for spool weight. A web demo mode provides in-memory CRUD when persistence is disabled.

### Storage

-   **Sensitive Data**: `expo-secure-store` is used for securely storing sensitive information like the server URL.
-   **App Preferences**: `AsyncStorage` handles non-sensitive preferences such as theme, language, and onboarding status.

### Backend (Express Server)

A lightweight **Express 5** server is included, primarily for Replit hosting/proxy purposes, serving static web builds or acting as a relay. It uses Drizzle ORM with a PostgreSQL dialect for server-side storage (currently minimal, with a `users` table).

### Theme System

The app features a dark and light theme with an accent color of `#3B82F6`. Dark mode utilizes deep blue-gray backgrounds. Key UI primitives like `GlassCard`, `FAB`, and `GradientBackground` contribute to the distinct Glass UI aesthetic. Theme preferences are persisted and include automatic system theme detection.

## External Dependencies

### Spoolman API

The primary data source for the application, typically self-hosted on a local network.
-   **Endpoints**: `/api/v1/health`, `/api/v1/spool` (GET, PATCH), `/api/v1/spool/{id}` (GET, PATCH).
-   **Default Server URL**: `http://192.168.50.10:7912`.
-   Supports HTTP cleartext for local network communication.

### Key Expo/React Native Packages

-   `expo-camera`: Barcode/QR scanning.
-   `react-native-nfc-manager`: NFC tag reading and writing (`filabro:v1:<spoolLocalId>`).
-   `expo-secure-store`: Secure storage.
-   `expo-sqlite`: Local SQLite database.
-   `expo-haptics`: Tactile feedback.
-   `react-native-reanimated`: Smooth animations.
-   `i18next` & `react-i18next`: Internationalization (English, German).

### Database (PostgreSQL)

-   Used by the Express server via Drizzle ORM.
-   Requires `DATABASE_URL` environment variable.

### Build & Tooling

-   **Metro** bundler, **Babel**, and **ESBuild**.
-   `patch-package` for applying native patches.
-   Replit-specific environment variables (`REPLIT_DEV_DOMAIN`, `EXPO_PUBLIC_DOMAIN`) for development.