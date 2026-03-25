# Matex Mobile App

React Native (Expo) mobile client for [matexhub.ca](https://matexhub.ca) — the Canadian B2B recycled materials marketplace.

## Architecture

- **Offline-first** — WatermelonDB provides local SQLite storage with background sync when connectivity returns.
- **Camera-first workflows** — Photo capture for listings, inspection reports, scale tickets, and proof-of-delivery.
- **Biometric auth** — Face ID / Touch ID via Expo Local Authentication for secure access and step-up verification.
- **Push notifications** — Firebase Cloud Messaging (FCM) for Android and APNs for iOS.
- **GPS** — Expo Location for delivery tracking and geofencing.

## Getting Started

```bash
pnpm install
pnpm --filter @matex/mobile start
```

Set `EXPO_PUBLIC_GATEWAY_URL` to point at your MCP Gateway instance (defaults to `https://api.matexhub.ca`).

## Project Structure

```
App.tsx                 Entry point with navigation
src/api/gateway.ts      MCP Gateway fetch client
src/store/auth.ts       Zustand auth state
src/db/schema.ts        WatermelonDB offline schema
```
