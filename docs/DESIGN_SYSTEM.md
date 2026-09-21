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

Home has a hard limit: total balance, Safe to Spend, account cards, one note, coming up, recent activity, one goal. Add to Home only by removing something.

## Tokens

All colours are CSS variables in `apps/web/src/app/globals.css`, with light and dark values.

- **Canvas:** `--background` (a soft neutral). Content groups sit on white `card-surface` / `ios-group` surfaces.
- **Accent:** one green (`--primary`). Use it for primary actions, active navigation, positive money and Safe to Spend.
- **Semantics:** green for income and good states, `--expense` red for problems and overspending, `--warning` amber for attention. Expenses in lists use the normal text colour, not red.
- **Signature surfaces:** only Safe to Spend (`--hero` to `--hero-deep` gradient, deep red when money is short) and account cards (the account's own colour) carry strong colour.

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

- **Balance line** (`BalanceLine`): no grid or axes, a dot for today, range chips (1W to 1Y).
- **Where it went:** a ranked list with bars sized to the largest category, not a pie.
- **Money in and out:** restrained 12-month bars.
- **Forecast:** actual versus projected with a likely range, always labelled as an estimate.

## Motion

Short and purposeful: the tab indicator slides (300ms), sheets rise, money counts up, buttons press to 97%. `prefers-reduced-motion` disables animation globally.

## Data integrity

The UI never computes financial results. Balances, Safe to Spend, forecasts, plan buckets and Faldo Check figures come from the backend engine. Cards show only safe account details: name, bank, optional last four digits, balance and credit limit.
