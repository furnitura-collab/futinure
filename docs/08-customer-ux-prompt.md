# Mebel Order — Customer App UX Overhaul Prompt

You are a senior product designer + React Native engineer. Redesign the **customer-facing app** (`apps/mobile`,
Expo SDK 58 / expo-router / RN 0.88, also served on the web) so a first-time customer — a furniture craftsman or
workshop buyer in Uzbekistan, often not tech-savvy, ordering on a phone — understands every screen **in 3 seconds**
and can place a repeat order **in under 30 seconds**.

Benchmark against best-in-class international commerce apps and research:
- **Baymard Institute** mobile e-commerce, product list, product page and checkout guidelines.
- **Amazon / Amazon Business**: "Buy again", clear per-unit price, delivery promise, order cards with item thumbnails
  and a single primary action.
- **IKEA app**: calm light UI, generous whitespace, large product imagery, visual categories, plain-language copy.
- **Grainger / McMaster-Carr** (B2B): SKU/code quick order, specs tables, quantity price tiers, fast reorder.
- **Uber Eats / Just Eat order tracking**: few customer-facing stages, a vertical progress tracker, one sentence
  explaining "what happens next".

## Problems in the current UI (fix all)
1. No home screen — the app opens on a bare grid; there is no orientation, no "what do I do now".
2. Product cards are mostly an empty grey placeholder; no way to add to cart from the list; no sort.
3. Product page: variants show cryptic strings (`Qora · 16 · 0190`) without a heading; specs and quantity-price tiers
   are hard to read; unit and total are ambiguous.
4. Orders list shows only an order number, date, status and total — not *what* was ordered or *what the customer must
   do* (e.g. a quote waiting for approval, a payment due).
5. Order detail lacks a progress tracker and a clear next action.
6. Accounting jargon ("Haqdor", "Hisob-kitob", "Kredit limiti") without explanation.
7. Dark, muddy gradient background by default; low contrast secondary text; heavy glass everywhere.
8. Barcode icon in the header has no label; users don't know what it does.

## Design principles
- **One primary action per screen**, visually dominant, in the thumb zone (bottom). Secondary actions are quiet.
- **Plain language** (uz/ru/en): verbs on buttons ("Savatga qo'shish", "Taklifni ko'rish", "To'lash"), no internal
  terms. Money always with the unit: "395 000 so'm / list".
- **Status = meaning + next step**: every status badge is accompanied by one sentence of what happens next and, when
  the customer must act, a primary button.
- **Light theme by default** (system still respected if the user chooses it). Clean white/stone surfaces, amber only
  for primary actions and highlights. Glass is reserved for floating chrome (tab bar, sticky bars, headers) — content
  cards are solid with a subtle border and soft shadow. Background: near-white with a very faint warm tint.
- **Hierarchy**: 1 title per screen (24–28), section titles (17 semibold), body 15, captions 13. Min contrast AA.
- **Touch targets ≥ 44pt**, spacing on a 4pt grid, 16pt screen gutters, 12–16 radius.
- **Feedback**: optimistic add-to-cart with a toast containing "Savatni ochish"; haptics on native; skeletons;
  pull-to-refresh; empty states that explain and offer the next step.
- **Responsive**: phone first; existing sidebar/grid behaviour on tablet/desktop stays.

## Screen specs

### 1. Home (new first tab "Bosh sahifa")
- Greeting with the customer's name + company/type.
- Big search field ("Mahsulot nomi yoki kodi") that opens the catalog with focus.
- **Action needed** cards (only if any): quote waiting for approval, payment due / overdue, unread manager message —
  each with a short sentence and a button.
- **Active orders** horizontal cards with a mini progress bar and status sentence.
- **Buy again**: products from the customer's past orders with one-tap add (reuses last quantity).
- **Categories** as a visual grid (icon + name + item count).
- Quick order by code entry point ("Kod bo'yicha buyurtma") with an explanation.

### 2. Catalog
- Sticky search + filter row: category, "Faqat borlar", sort (popular / price ↑ / price ↓ / name).
- Product card: image (or a category-tinted illustration placeholder with the category icon — never an empty box),
  name (2 lines), brand, **price per unit** ("dan" when variants differ), stock badge, **"+" add button** (opens a
  quick-add sheet when the product has several variants or a min quantity).
- Result count and active filter chips that can be cleared.

### 3. Product
- Gallery, title, brand · category, key specs row (size, thickness).
- Variant picker with a **heading per attribute** ("Rang", "Qalinlik") as selectable chips/swatches; SKU shown small.
- Price block: unit price, "your price" badge for group prices, struck-through base price, **quantity tiers table**
  ("10+ list — 385 000 so'm"), lead time / stock sentence ("Omborda 40 list bor", "3 kunda keladi").
- Specs table (dimensions, weight, unit, min order, step).
- Sticky bottom bar: quantity stepper with unit, live line total, primary "Savatga qo'shish" / "Savatda: 5 list —
  yangilash".

### 4. Cart & Checkout
- Line items with thumbnail, variant text, stepper, line total, remove; issues shown inline with a fix action.
- Summary card: items, weight, total; primary "Rasmiylashtirish".
- Checkout as clear numbered sections: 1 Yetkazish usuli, 2 Manzil, 3 Sana, 4 Izoh; review summary; explain that the
  manager confirms price/stock and sends a quote before payment.

### 5. Orders list
- Segments: Faol / Tarix. Cards show: order number + date (small), **status sentence**, **first 2–3 item names + "+N"**,
  total, mini progress bar, and an **action pill** when the customer must act (purple "Taklif keldi — ko'ring",
  amber "To'lov kutilmoqda"), unread messages count.

### 6. Order detail
- Header card: status badge, one-sentence "what's next", primary action (review quote / pay / chat).
- **Vertical progress tracker** with 5 customer stages: Qabul qilindi → Narx kelishildi → Tayyorlanmoqda → Yo'lda /
  Olib ketishga tayyor → Topshirildi (cancelled shown distinctly). Timestamps where known.
- Items, delivery info, payment summary (paid / due) with plain labels, chat entry, "Buy again" for completed orders.

### 7. Profile & money
- Balance card in plain language: "Qarzingiz: X so'm" (red) / "Oldindan to'lovingiz: X so'm" (green) /
  "Qarzingiz yo'q"; "Nasiya limiti: X so'm — shu summagacha keyin to'lab olishingiz mumkin"; link "To'lovlar tarixi".
- Grouped settings list (language, theme, password, notifications, addresses), logout at the bottom.

### 8. Login & setup
- Clear value proposition, phone + password, show/hide password, helper text for new users ("Yangi raqam bo'lsa,
  hisob avtomatik ochiladi"), language switch.

## Engineering constraints
- Keep business logic and API contracts. Small **additive** API endpoints are allowed when a screen needs data that
  doesn't exist (e.g. `GET /orders` item preview fields, `GET /me/buy-again`), with e2e tests in `apps/api/test`.
- Reuse and extend `src/components/ui/*`; new screen sections go in `src/components/<feature>/*`. DRY, no dead code,
  only "why" comments (Uzbek).
- All strings in the typed i18n dictionaries (uz/ru/en); labels/formatting from `@mebel/shared`.
- All colours from theme tokens; both themes polished.
- Done when: `pnpm typecheck`, `pnpm test` pass, `expo export --platform web` succeeds, and every screen is visually
  checked at 390px and desktop width in light and dark.
