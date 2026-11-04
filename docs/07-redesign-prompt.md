# Mebel Order — Professional Refactor & Redesign Prompt

You are a senior full-stack engineer and product designer working on **Mebel Order**, a B2B ordering platform for
furniture raw materials and hardware (boards, edging, fittings) in Uzbekistan. The monorepo (pnpm) contains:

| Path | Stack | Users |
|---|---|---|
| `apps/api` | NestJS 12, Prisma 7 (Postgres), Redis, Socket.IO, Vitest e2e | — |
| `apps/admin` | React 19, Vite 8, Tailwind CSS 4, TanStack Query, react-router 8 | Staff: super admin, manager, warehouse |
| `apps/mobile` | Expo SDK 58, expo-router, React Native 0.88 (+ web build) | Customers (craftsmen, workshops), drivers |
| `packages/shared` | TypeScript, zod | Enums, schemas, pricing, state machine, **labels, formatting** |

Bring the whole product to a **professional, production-grade level**: clean, DRY, consistent, modern, and easy to use.

## 1. Engineering principles (all packages)

1. **Clean code & DRY.** One source of truth for every concept. Before writing a helper, search for an existing one.
   Extract repeated JSX/markup into reusable components and repeated logic into hooks/services.
2. **Remove noise.** Delete comments that restate the code, commented-out code, dead exports, unused files,
   unused dependencies, and logic that no longer has a caller. **Keep** comments that explain *why*
   (business rules, non-obvious constraints, workarounds). Comments stay in Uzbek, matching the codebase.
3. **Small, focused units.** Components < ~200 lines; split pages into sections. Services do one thing.
4. **Strict typing.** No `any`, no unchecked casts where a type guard or zod schema fits.
5. **Behaviour is preserved.** Refactors must not change API contracts unless listed in §4. All existing tests stay
   green; add tests for new behaviour.
6. **Shared first.** Domain labels, money/date/phone formatting and API error texts live in `@mebel/shared`:
   - `LABELS`, `label(group, value, locale)` — order status, unit, payment terms/method/status, quote status,
     stock level, delivery type/status, role, customer type (uz / ru / en).
   - `API_ERRORS`, `apiErrorText(code, locale, fallback)`.
   - `formatMoney`, `formatNumber`, `formatDate`, `formatDateTime`, `formatPhone`.
   - Zod schemas for every request body. Delete app-local duplicates of these.

## 2. Internationalisation — 3 languages

- Locales: **`uz` (default, Latin), `ru`, `en`** (`LOCALES` in shared; Prisma enum `Locale` already has `en`).
- Every user-visible string goes through a typed dictionary: `t('key', params)`. Missing keys are type errors
  (dictionary type derived from the `uz` object; `ru` and `en` must satisfy it).
- Language switcher in both apps; choice persisted (localStorage / SecureStore) and synced to the profile via
  `PATCH /me { locale }`, so push notifications arrive in the same language.
- Catalog content only has `nameUz` / `nameRu`; English UI falls back to `nameUz`.
- Natural, short, professional wording. No machine-translation tone.

## 3. Design system — modern, glass, smooth

**Feel:** calm, premium, warm. Brand colour is amber (`#b45309` family) on neutral stone greys.
Light and dark themes are first-class.

**Tokens** (CSS variables on web, a typed theme object on mobile — same names and values):
`background, foreground, card, card-foreground, popover, primary, primary-foreground, secondary, muted,
muted-foreground, accent, destructive, success, warning, info, border, input, ring, glass, glass-border`.
Use OKLCH on web. Radius scale 8 / 12 / 16 / 24. Spacing on a 4px grid. Type scale 12 / 13 / 15 / 17 / 20 / 24 / 30.

**Glass pattern** (use for navigation chrome, cards on hero areas, dialogs, sticky bars — not for dense tables):
- Surface: semi-transparent `glass` fill + `backdrop-blur` (web: `backdrop-blur-xl`; mobile: `expo-blur` `BlurView`
  on iOS/web, solid translucent fallback on Android) + 1px `glass-border` + soft shadow.
- App background: subtle radial gradient mesh (amber/rose/sky at low opacity) so the blur has something to show.
- Text on glass always meets WCAG AA contrast in both themes.

**Motion:** 150–250 ms, ease-out. Hover/press states on everything interactive, page and list entrance fades,
dialog/sheet scale+fade, skeleton loaders instead of spinners for content. Respect `prefers-reduced-motion`.

**Theme switching:** light / dark / system. Persisted. No flash of the wrong theme on load.

**Accessibility:** visible focus rings, 44px touch targets on mobile, labelled icon buttons, keyboard-navigable
dialogs and menus.

## 4. Product logic to add

1. **Staff management** (admin, SUPER_ADMIN only):
   - `GET /admin/staff` → staff users (`id, phone, fullName, role, isActive, lastLoginAt, createdAt`).
   - `POST /admin/staff` body `createStaffSchema` → creates staff with a password. Phone must be unique (409 `PHONE_TAKEN`).
   - `PATCH /admin/staff/:id` body `updateStaffSchema` → edit name/role/active/password. Changing the password or
     deactivating revokes the user's refresh sessions. A super admin cannot deactivate or demote themselves
     (400 `CANNOT_MODIFY_SELF`).
2. **Change own password:** `POST /me/password` body `changePasswordSchema`. If a password is already set,
   `currentPassword` is required and verified (401 `INVALID_PASSWORD`). Revokes other sessions.
3. **Password login security:** an existing account **without** a password may no longer claim it on first login for
   staff roles — staff passwords are set by the super admin. Customers without a password keep the
   first-login behaviour (they were created by OTP sign-up).
4. Notification templates (`apps/api/src/notifications`) gain `en` texts and use shared `formatMoney`.

## 5. Per-app scope

### apps/admin (web, staff)
- Adopt **shadcn/ui** conventions on Tailwind 4: `components.json`, `@/` path alias, `cn()` util,
  `class-variance-authority` variants, Radix primitives, `tw-animate-css`, `lucide-react` icons, `sonner` toasts.
  Components live in `src/components/ui/*` (button, input, label, textarea, select, checkbox, switch, badge, card,
  dialog, sheet, dropdown-menu, tabs, table, tooltip, skeleton, separator, avatar, scroll-area) — one per file.
- App-level reusable components in `src/components/*`: `AppShell` (glass sidebar + topbar, collapsible, mobile sheet),
  `PageHeader`, `DataTable` (sorting, empty/loading states, pagination), `StatCard`, `StatusBadge`
  (tone from status), `EmptyState`, `ConfirmDialog`, `FormField`, `MoneyInput`, `SearchInput`,
  `ThemeToggle`, `LanguageSwitcher`.
- Typed i18n (`src/i18n/{uz,ru,en}.ts`, `useI18n()`), theme provider with no-flash inline script in `index.html`.
- Redesign every page (login, orders list/detail + dialogs, catalog list/edit/categories/import/bulk price,
  stock, customers list/detail, payments, receivables report) on the new components.
  Dashboard-style summary cards on the orders page.
- New **Staff** page (SUPER_ADMIN): table + create/edit sheet, activate/deactivate, reset password.
- New **Profile** menu: change own password, language, theme, logout.
- Responsive down to 360px.

### apps/mobile (Expo, customers + drivers; also served as web)
- shadcn is web-only; mirror its token names and component API on React Native.
- `src/theme/`: light/dark token objects, `ThemeProvider` (system / light / dark, persisted), `useTheme()`.
  **No static colour imports in screens** — everything reads from the theme.
- `src/components/ui/*` one component per file: `Text`, `Button` (variants + sizes + press animation), `Input`,
  `Card`, `GlassView`, `Badge`, `Chip`, `Segmented`, `ListItem`, `Screen` (safe area + background mesh +
  content width), `EmptyState`, `ErrorState`, `Skeleton`, `QtyStepper`, `Toast`.
- i18n gains `en`; enum labels, money/date formatting and API errors come from `@mebel/shared`.
- Glass tab bar and headers (`expo-blur`), gradient background, Reanimated entrance/press animations.
- Settings in Profile: language (3), theme (3), change password.
- Keep the existing responsive layout (`src/lib/layout.ts`: sidebar on wide screens, adaptive catalog grid).

### apps/api
- Remove noise per §1, consolidate duplicated query/mapping logic into helpers, keep module boundaries.
- Implement §4 with e2e tests. Keep all existing tests green.

## 6. Definition of done
- `pnpm typecheck`, `pnpm test` pass for every package; `apps/admin` `vite build` and
  `apps/mobile` `expo export --platform web` succeed.
- No hard-coded user-visible strings outside dictionaries; no hard-coded colours outside theme tokens.
- Both themes and all three languages verified on every screen.
- README / docs updated for new endpoints and settings.
