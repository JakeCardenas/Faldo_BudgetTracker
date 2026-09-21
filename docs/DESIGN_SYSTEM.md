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

Home has a hard limit: the green hero (total balance, the balance line with 1W to 1Y, Faldo), Safe to Spend, spending this month, account cards, coming up, one Faldo note and recent activity. Add to Home only by removing something.

## Faldo, the panda

The panda artworks in `apps/web/public/brand/panda/` are the canonical mascot. They were only cut out of their white backgrounds (Apple Vision subject lift, with enclosed light areas such as inner ears restored from the original pixels and the white page un-mixed from the outline). Never redraw, recolour, restyle or generate a new panda. Use `<Panda pose="…" />` from `components/brand/panda.tsx`.

| Pose | Use it for |
|---|---|
| `bamboo` | Default Home companion, onboarding finish |
| `wave` | Greetings: sign-in, onboarding welcome, Talk to Faldo, empty Home |
| `happy` | Success: a logged transaction, a goal reached |
| `backpack` | Goals empty state |
| `munch` | Budgets empty state |
| `boba` | Learn |
| `sleep` | Not found |
| `resting`, `cozy`, `ramen`, `box` | Unlockable poses and future empty states |

One panda per view. It never sits inside transaction rows, cards or charts. The app icon (`faldo-panda-*.png`) is the same character and stays as the logo mark.

Rewards: the backend's outfit ids unlock poses (`OUTFIT_INFO` in `lib/catalog.ts`) and its background ids unlock green environment themes (`BACKGROUND_INFO`). The chosen pose and theme appear in the Home hero.

## Green environment

The Home hero, sign-in and the empty Home use `environmentStyle()` from `components/brand/environment.tsx`: a deep green gradient with soft light behind Faldo, plus a quiet `BambooDecor` at about 10% white. Bamboo never sits behind text and never appears on financial surfaces.

## Hide amounts

The eye button (`HideAmountsButton`) and the Settings switch set a per-device preference. While it's on, `formatMoney` returns ₱•••• everywhere and `maskAmounts()` masks amounts inside Faldo's notes. Labels stay visible.

## Provider logos

`lib/providers.ts` lists Philippine banks and e-wallets with brand colours. Faldo ships no provider logos. To show one, add the official or licensed file to `public/brand/providers/<id>.svg` and set `logo` for that provider. Without a file, a generic account icon in the brand colour is shown. Never draw or generate a logo.

## Tokens

All colours are CSS variables in `apps/web/src/app/globals.css`, with light and dark values.

- **Canvas:** `--background` (a soft neutral). Content groups sit on white `card-surface` / `ios-group` surfaces.
- **Accent:** one green (`--primary`). Use it for primary actions, active navigation, positive money and Safe to Spend.
- **Semantics:** green for income and good states, `--expense` red for problems and overspending, `--warning` amber for attention. Expenses in lists use the normal text colour, not red.
- **Signature surfaces:** only the Home green environment and account cards (the account's own colour) carry strong colour. Safe to Spend is a calm light surface: green when healthy, amber when this week's share is used, red only when money is genuinely short.

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

- **Balance line** (`BalanceLine`): no grid or axes, a dot for today, range chips (1W to 1Y). On Home it's white on green, and touching it shows that day's balance in the headline. There is no 1D range because balances are tracked per day.
- **Where it went:** a ranked list with bars sized to the largest category, not a pie.
- **Money in and out:** restrained 12-month bars.
- **Forecast:** actual versus projected with a likely range, always labelled as an estimate.

## Motion

Short and purposeful: the tab indicator slides (300ms), sheets rise, money counts up, buttons press to 97%. `prefers-reduced-motion` disables animation globally.

## Data integrity

The UI never computes financial results. Balances, Safe to Spend, forecasts, plan buckets and Faldo Check figures come from the backend engine. Cards show only safe account details: name, bank, optional last four digits, balance and credit limit.
