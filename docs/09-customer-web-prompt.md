# Mebel Order — Customer Web (Desktop) Experience Prompt

You are a senior product designer + React Native Web engineer. The customer app (`apps/mobile`, Expo SDK 58,
expo-router, RN 0.88, react-native-web) is also the customer **website** (served at `/`). On phones it is good.
On a laptop/desktop browser it is **bad**: it is a phone app stretched onto a big screen. Rebuild the wide-screen
(≥ 768px) experience so it looks and behaves like a modern B2B e-commerce **website** — benchmarks: Amazon Business,
IKEA web, Grainger, McMaster-Carr, Shopify Dawn theme, Baymard desktop guidelines. The phone layout (< 768px)
must stay exactly as it is.

## What is wrong today (observed at 1456×827)
1. Navigation is a mobile tab bar turned into a left sidebar: no logo/brand, no global search, no visible cart total,
   lots of empty space; it looks like a settings panel, not a store.
2. Stack screens (product, order, checkout…) drop the sidebar entirely and show a thin app-style back header — the
   site "changes shape" between pages.
3. Content is a narrow phone column centred in a huge empty canvas (orders list ~430px wide, home ~720px).
4. Phone patterns on desktop: full-width giant buttons, horizontal rails cut off at the edge, sticky glass footers at
   the bottom of a 1400px window, bottom-sheet modals.
5. Product page: tiny banner-shaped image strip with a big empty area below; buy box is a long stack of cards; the
   "add to cart" bar sits at the bottom of the window far from the price.
6. Cart/checkout: summary and primary action are in a bottom bar instead of a sticky right column.
7. No hover states, no pointer cursor, no keyboard focus ring, no browser tab titles.

## Target: website shell (wide ≥ 768px, customers only)
- **Top header (sticky, glass, 64px)** shared by *every* customer screen (tabs and stack screens):
  logo mark + "Mebel Order" → home · primary links **Bosh sahifa / Katalog / Buyurtmalar** (active underline, attention
  badge on Buyurtmalar) · **search field** in the middle (submits to `/catalog?q=…`, `/` keyboard shortcut focuses it)
  · right side: "Kod bo'yicha" (quick order by SKU), notifications bell with count, **cart button with item count and
  total**, account button (initial avatar → profile). On 768–1023px the links collapse to icons and the search shrinks.
- The mobile tab bar is hidden on wide screens; native stack headers are hidden on wide screens and replaced by an
  in-page **page header**: breadcrumbs (e.g. Katalog › Kromka › PVX kromka 2 mm), H1 title, optional actions on the
  right.
- **Container**: max-width 1280, side padding 32 (24 on tablet), content aligned to the header's container.
- A slim **site footer** at the bottom of scrollable pages (brand, support phone/Telegram if available in config,
  language + theme switch, ©).
- Modal routes (`pay`, `sku`, `password`, `address-new`) render as **centred dialogs** (max-width 520, backdrop) on
  wide screens instead of full-screen pages.

## Page layouts (wide)
- **Home**: hero row — greeting + company on the left, "Sizdan kutilmoqda" action cards on the right (compact,
  buttons auto-width). Active orders as a **3-column grid** (no cut-off rail). "Yana buyurtma qilish" grid of 5–6
  cards. Categories as a 6-column tile grid. Quick-order-by-code card as a wide banner.
- **Catalog**: left **filter sidebar** (260px, sticky): categories with counts, "Faqat borlar" toggle; main area:
  result count + active filter chips + sort select on one toolbar row; product grid 3–5 columns by width; cards with
  hover lift, pointer cursor, "+" add button. Search text comes from the header.
- **Product**: breadcrumbs; two columns — left: large square gallery (sticky), right: **buy box** in one card —
  title, brand · category, price + "Sizning narxingiz", quantity tiers, variant chips with headings, stock sentence,
  quantity stepper + **inline** "Savatga qo'shish" button (no bottom bar). Below, full width: specs table and
  description.
- **Cart**: two columns — line items list (thumbnail, name, variant, stepper, line total, remove) and a **sticky
  summary card** (items, weight, total, "Rasmiylashtirish"). Empty state centred with catalog CTA.
- **Checkout**: two columns — numbered sections on the left, sticky order summary + submit + "what happens next" on
  the right.
- **Orders**: segmented Faol/Tarix in the page header; list rendered as **table-like rows** spanning the container:
  number + date · items preview · status badge + sentence · progress · total · action pill / chevron. Row hover.
- **Order detail**: two columns — left: items, quote, delivery info, chat entry; right (sticky): status card with
  next-step sentence + primary action, vertical tracker, payment summary.
- **Profile**: two columns — left: account card + balance card; right: settings groups. Addresses, notifications,
  payment history: single centred column max 760 with page header.
- **Login / setup**: split screen — left brand panel (amber gradient, logo, value props), right form card.

## Interaction & visual polish (web)
- Every pressable: `cursor: pointer`, hover background/elevation, visible focus ring (`outline` 2px primary) for
  keyboard users. Buttons are auto-width on wide screens unless explicitly `block`.
- Browser tab title per screen: "<Page> · Mebel Order".
- Glass only on the header and dialogs; content cards solid. Keep the existing theme tokens, light/dark, uz/ru/en.
- Mouse-wheel scroll everywhere, no pull-to-refresh UI; no horizontal page scroll at any width ≥ 320.

## Engineering constraints
- Phone (< 768px) and native apps unchanged. Drivers/staff screens untouched.
- Build it with reusable pieces: `WebShell`/`WebHeader`/`SiteFooter` in `src/components/web/*`, a `PageHeader`
  (breadcrumbs + title + actions), a `TwoColumn` layout (main + sticky aside) and extend `Screen` so `footer` content
  renders in the aside/inline on wide screens instead of a bottom bar. Reuse `useLayout`, `contained`, `CONTENT`,
  existing ui components and theme tokens; no new design system.
- All strings in the typed i18n dictionaries (uz/ru/en). DRY, no dead code, only "why" comments (Uzbek).
- No API changes needed; if any, additive with e2e tests.
- Done when: `pnpm typecheck` and `pnpm test` pass, `npx expo export --platform web` succeeds, and every customer
  screen is checked in a browser at 1440px, 1024px and 390px (light + dark).
