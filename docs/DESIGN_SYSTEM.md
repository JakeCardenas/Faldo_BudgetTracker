# Faldo design system

Faldo should feel like a calm consumer finance app, not a dashboard. Simple on the surface, powerful underneath.

## Information architecture

| Place | Question it answers | Routes |
|---|---|---|
| Home | What do I have, what's safe to spend, what's next? | `/`, `/accounts`, `/import` |
| Activity | What happened? | `/transactions`, `/reports`, `/insights` |
| Plans | What's ahead? | `/plan`, `/plan/money`, `/bills`, `/budgets`, `/goals`, `/debts`, `/forecast` |
| You | Everything about me and the app | `/you`, `/settings`, `/learn`, `/streaks`, `/tools`, `/assistant` |

The **+** (phone tab bar, desktop "Add") opens one menu: type it like a text, Expense, Income, Transfer, then receipt, goal, money owed, planned purchase, Faldo Check and import.

Home has a hard limit: the hero (total balance, the balance line with 1W to 1Y, Faldo), Safe to Spend, spending this month, account cards, coming up, one Faldo note and recent activity. Add to Home only by removing something.

## Faldo, the panda

The panda artworks in `apps/web/public/brand/panda/` are the canonical mascot: the designer's Canva exports with a transparent background, only cropped to each pose (`bamboo` and `wave` are single artworks, the rest come from the pose sheet). Never redraw, recolour, retouch, cut out or generate a panda. Use `<Panda pose="…" />` from `components/brand/panda.tsx`.

| Pose | Use it for |
|---|---|
| `bamboo` | Default Home companion, onboarding finish |
| `wave` | Greetings: sign-in, onboarding welcome, Talk to Faldo, empty Home |
| `happy` (cheering) | Success: a logged transaction, a goal reached |
| `backpack` | Goals empty state |
| `munch` | Budgets empty state |
| `boba` | Learn |
| `sleep` | Not found |
| `resting`, `cozy`, `ramen`, `box` | Unlockable poses and future empty states |

One panda per view. It never sits inside transaction rows, cards or charts. The app icon (`faldo-panda-*.png`) is the same character and stays as the logo mark.

Rewards: the backend's outfit ids unlock poses (`OUTFIT_INFO` in `lib/catalog.ts`) and its background ids unlock environment tints (`BACKGROUND_INFO`). The chosen pose and tint appear in the Home hero.

## Environment

The Home hero, sign-in and the empty Home use the `faldo-env` class with `environmentStyle()` from `components/brand/environment.tsx`: a clean off-white base with a light diagonal tint of the chosen theme (mint by default), lightest where Faldo stands, and a dark version for dark mode. On phones the hero melts into the page instead of ending on a hard line. No radial glows. `BambooDecor` is a very faint green motif used only on the sign-in panel and the empty Home, never behind text, charts or money.

## Hide amounts

The eye button (`HideAmountsButton`) and the Settings switch set a per-device preference. While it's on, `formatMoney` returns ₱•••• everywhere and `maskAmounts()` masks amounts inside Faldo's notes. Labels stay visible.

## Account cards and provider logos

Account cards use the real ID-1 card proportion (1.586:1) and scale their type with the card (container units). `lib/providers.ts` lists Philippine banks and e-wallets. Providers with a `card` entry get a face that echoes their real card (GCash's royal blue with the large G symbol, Maya's black with the mint wordmark, BPI's red ribbons, BDO's blue, GoTyme's navy-to-aqua lines, and so on), with a chip and contactless mark but never a cardholder name, card number or network logo. Other accounts use their colour with rings (e-wallets, cash) or engraved arcs (cards); savings keep a light striped face.

Logos are official files in `public/brand/providers/` (GCash, Maya, BDO, BPI, GoTyme, UnionBank, SeaBank, Landbank, PNB, EastWest and CIMB, from Wikimedia Commons), with sources and licences in `SOURCES.md` there. The files are never edited, only framed: `LOGOS` in `lib/providers.ts` records the measured visible area, the symbol (used in round badges and for GCash's large face mark) and, where a symbol has white detail, the wordmark used in white. On dark faces the reversed (white) version is shown, as on the physical cards; Maya keeps its mint wordmark on black. Without a file (MariBank, Metrobank and others), the provider's name is shown as text. Never draw or generate a logo. Cards show only `•••• 1234` when the person adds the last four digits; credit cards show used, available and the limit.

## Tokens

All colours are CSS variables in `apps/web/src/app/globals.css`, with light and dark values.

- **Canvas:** `--background` (a soft neutral). Content groups sit on white `card-surface` / `ios-group` surfaces.
- **Accent:** one green (`--primary`). Use it for primary actions, active navigation, positive money and Safe to Spend.
- **Semantics:** green for income and good states, `--expense` red for problems and overspending, `--warning` amber for attention. Expenses in lists use the normal text colour, not red.
- **Signature surfaces:** only account cards (the provider's or account's own colour) carry strong colour. The Home environment is a light tint. Safe to Spend is a calm light surface: green when healthy, amber when this week's share is used, red only when money is genuinely short.

## Shape

- Buttons, chips, segmented controls and tabs are full pills.
- Inputs are 12px (`rounded-lg`).
- Inner tiles are 17px (`rounded-xl`).
- Surfaces are 22px (`rounded-2xl`).
- Hero cards and sheets are 26px (`rounded-3xl`, sheets 28px on phones).

## Type

Geist throughout. Money always uses tabular figures.

| Use | Class |
|---|---|
| Hero money (balance, Safe to Spend) | `display-xl` (44px, 52px on desktop) |
| Page titles | `page-title` (30px, 34px on desktop) |
| Section titles | `section-title` (17px semibold) |
| Body and rows | 15px |
| Secondary | 13px muted |

Sentence case everywhere. No uppercase labels, no em dashes in copy.

## Glass

`glass-float` is a web approximation of a liquid-glass material (backdrop blur, layered edge, top highlight). It is used only for floating controls: the phone tab bar and the desktop top bar (`glass`). Never on cards, charts or financial figures. `prefers-reduced-transparency` falls back to a solid surface.

## Lists before cards

Transactions, bills, goals and budgets are rows in one grouped surface with inset dividers, not a card per item. Section titles sit on the canvas above the surface, with one "See all" link.

## Charts

Every chart answers one question, written as its section title.

- **Balance line** (`BalanceLine`): one green line over a quiet dashed grid, a compact scale on the right (hidden while amounts are hidden), first, middle and last dates below, and a dot for today. Drag across it with a finger or mouse, or use the arrow keys, to read any day; on Home that day's balance replaces the headline. Range chips run 1W to 1Y. There is no 1D range because balances are tracked per day.
- **Where it went:** a ranked list with bars sized to the largest category, not a pie.
- **Money in and out:** restrained 12-month bars.
- **Forecast:** actual versus projected with a likely range, always labelled as an estimate.

## Motion

Short and purposeful: the tab indicator slides (300ms), sheets rise, money counts up, buttons press to 97%. `prefers-reduced-motion` disables animation globally.

## Data integrity

The UI never computes financial results. Balances, Safe to Spend, forecasts, plan buckets and Faldo Check figures come from the backend engine. Cards show only safe account details: name, bank, optional last four digits, balance and credit limit.
