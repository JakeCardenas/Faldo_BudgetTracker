# Faldo design system

Faldo should feel like a calm consumer finance app, not a dashboard. Simple on the surface, powerful underneath.

## Information architecture

| Tab | Question it answers | Routes |
|---|---|---|
| Home | What do I have, what's safe to spend, what's next? | `/` |
| Wallet | Where does my money live? | `/accounts`, `/accounts/[id]`, `/import` |
| Plan | What's ahead? | `/plan`, `/plan/money`, `/bills`, `/budgets`, `/goals`, `/debts`, `/forecast` |
| History | What happened? | `/transactions`, `/reports`, `/insights` |

**Profile** (`/you`, with `/settings`, `/learn`, `/streaks`, `/tools`, `/assistant`) is not a tab. It opens from the avatar on Home (phones) and the avatar menu (desktop); its pages select no tab.

The **+** (the middle of the tab bar on phones, and a glass circle in the corner while the bar is away; "Add" on desktop) opens one menu: type it like a text, Expense, Income, Transfer, then receipt (photo or camera), goal, money owed, planned purchase, Faldo Check and import.

## Navigation

Phones: modelled on the Threads tab bar. One floating glass capsule, icons only: Home, Wallet, **+**, Plan, History, on the page's 20px margins and about 21px above the bottom edge (61px tall, the icons 26px with a 2px stroke). The selected tab sits in a darker lens (83 x 53px) set 4px into the glass, and whatever the lens covers is drawn **filled** (a solid icon with its details cut out: the wallet's clasp, the calendar's lines, the clock's hands); everything outside it stays outlined. The fill follows the lens exactly, so an icon half under a moving lens is half filled.

- **Tap** a tab: the lens glides to it and the page opens. Tap **+**: the Add menu opens and the lens stays put.
- **Drag** along the bar: the lens follows the finger (after 6px of travel), filling each icon it passes; let go and it settles on the nearest tab and opens it (on **+**, it glides back and the Add menu opens).
- **Scroll down** 72px: the bar turns into the **+**. A glass + circle (62px) comes out of the bar's right end the moment the bar starts to sink, rising the last 13px into place in the bottom-right corner, while the bar sinks off the bottom of the screen. **Scroll up** 28px, reach the top of the page, change page or tab onto the bar with the keyboard: the bar rises back up under the +, which fades and sinks into its right end. The bounce past the end of a page does not count as scrolling up.
- The **page header** steps aside with the bar, as in Threads: the sticky header row (back, title, actions) and History's search and filters fade out drifting up 20px (about 0.24s) while the bar sinks, and come back sliding down, quicker (about 0.18s), when the bar rises. A soft strip stays under the status bar the whole time, so nothing reads crisp under the clock. Focusing anything in the header brings it back.
- On pages that belong to no tab (Profile and its pages) the lens fades out and every icon is outlined.

The lens moves on physics, not keyframes: damped springs stepped every frame, writing styles directly so it stays smooth while the next page renders and keeps its speed when retargeted (glide: 90% in 175ms, about 1% overshoot; follow: critically damped). The scroll transition is CSS, so the system runs it off the main thread, on curves fitted to the reference frame by frame: the bar sinks on a critically damped curve (about 90% gone in 100ms, 223ms in all) and rises on a pure exponential with no bounce (222ms); the + shows within about 30ms and settles its 13px rise in 283ms, and fades out over 283ms as the bar comes back. The bar, its lens and the page header keep this motion with Reduce Motion on (they carry `data-motion="always"`), by the owner's choice; everything else follows the setting. The links stay in the bar for keyboard and screen readers.

Desktop: the same four tabs in the top bar, with search, notifications, Add and the avatar menu.


### Faldo bubble

On phones and tablets, a floating chat head like Messenger's: Faldo waving (`chat-head`) in a 56px green circle with a white ring, and a red badge counting what needs a look (the same count as the bell: warnings and bills due within three days).

- **Drag** it anywhere; let go and it springs to the nearer side with a little bounce, carried by how you threw it (the side it is heading for, and a quarter second of its speed along the edge).
- **Tap** it to open Talk to Faldo (it hides there).
- **Drag it down** and a × rises above the tab bar while the bottom of the screen darkens; within 84px the bubble is pulled onto it and the × grows. Let go there to put it away, with an Undo toast; the "Faldo bubble" switch in Settings brings it back.
- It rests 8px from the side, below the status bar and above the tab bar, and remembers its side and height on this device. The first time it appears, Faldo says "Tap me to ask about your money" beside it.
- It moves on springs, frame by frame (drag: stiff, no lag you notice; snap: a small overshoot; pull: quick, no bounce), and keeps moving with Reduce Motion on, like the tab bar.

## Page layouts

- **Home:** Faldo's green bamboo band at the top: the streak button and a glass pill (search, notifications, Profile) under the status bar, the date in small caps, the greeting with the name in bold, and Faldo standing on the band's edge beside his note in a speech bubble. Then quick action tiles, the total balance card with its balance line, Safe to Spend, a spending ring beside a money in and out card (Day, Week, Month), payments due on a date timeline, account cards and recent activity. Add to Home only by removing something.
- **Wallet:** the same band with the title, Faldo beside a white net worth card, and All, Assets and Liabilities pills. Then an insight and the last seven days of balance as bars, type filters, and accounts grouped by type (collapsible, with totals) as two-column tiles or a list.
- **Plan:** one row per planning tool (budgets, goals, money plan, bills, money owed, planned purchases, installments, forecast, what if), each with a tinted icon and a live summary, then "Can I afford it?" and quick links.
- **History:** search and filters, then each day as a collapsible header (the date in small caps, money out and in as pills) over a timeline: the time each entry was logged, a red or green dot, and the entry on its own card with its account in a small tag.

## Faldo, the panda

The panda artworks in `apps/web/public/brand/panda/` are the canonical mascot, only cropped to each pose (`bamboo` and `wave` are single artworks, the rest come from the pose sheet). Colour comes from the designer's 2000px Canva exports and transparency from the designer's transparent exports of the same designs (they align pixel for pixel), so every pose stays sharp at large sizes. Faldo is served at optimizer quality 90. Never redraw, recolour, retouch, cut out or generate a panda. Use `<Panda pose="…" />` from `components/brand/panda.tsx`.

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
| `chat-head` | The Faldo bubble only: the waving head, cropped square from the second pose sheet (`faldonew.png`, transparent), shown in a green circle |

One panda per view. It never sits inside transaction rows, cards or charts. The app icon (`faldo-panda-*.png`) is the same character and stays as the logo mark.

Rewards: the backend's outfit ids unlock poses (`OUTFIT_INFO` in `lib/catalog.ts`) and its background ids unlock green environment themes (`BACKGROUND_INFO`). The chosen pose and theme appear in the Home hero.

## Green environment

The Home hero, its loading state and the empty Home use `environmentStyle()` from `components/brand/environment.tsx`: a clean diagonal green from the chosen theme with a little depth at the bottom, and no glow at the top. White text, a white balance line and a quiet `BambooDecor` (white, about 10%) sit on it. The content below rises over it on a rounded sheet on phones. Bamboo never sits behind text or money.

While a green band is on screen, `StatusBarTint` sets the body's background to the band's green (and theme-color for older browsers). iOS 26 ignores theme-color and paints the strip under the status bar, with its soft blurred edge, from the body's background colour; the app draws its own canvas above the body, so the green only shows there and in overscroll. Once the band scrolls away the page colour returns.

Sign-in uses the light mint version (`LIGHT_ENVIRONMENT` with the `faldo-env` class), with the bamboo motif in faint green.

## Hide amounts

The eye button (`HideAmountsButton`) and the Settings switch set a per-device preference. While it's on, `formatMoney` returns ₱•••• everywhere and `maskAmounts()` masks amounts inside Faldo's notes. Labels stay visible.

## Account cards and provider logos

Account cards use the real ID-1 card proportion (1.586:1) and scale their type with the card (container units). `lib/providers.ts` lists Philippine banks and e-wallets. Providers with a `card` entry get a face that echoes their real card (GCash's royal blue with the large G symbol, Maya's black with the mint wordmark, BPI's red ribbons, BDO's blue, GoTyme's navy-to-aqua lines, and so on), with a chip and contactless mark but never a cardholder name, card number or network logo. Other accounts use their colour with rings (e-wallets, cash) or engraved arcs (cards); savings keep a light striped face.

Logos are official files in `public/brand/providers/` (GCash, Maya, BDO, BPI, GoTyme, UnionBank, SeaBank, Landbank, PNB, EastWest and CIMB, from Wikimedia Commons), with sources and licences in `SOURCES.md` there. The files are never edited, only framed: `LOGOS` in `lib/providers.ts` records the measured visible area, the symbol (used in round badges and for GCash's large face mark) and, where a symbol has white detail, the wordmark used in white. On dark faces the reversed (white) version is shown, as on the physical cards; Maya keeps its mint wordmark on black. Without a file (MariBank, Metrobank and others), the provider's name is shown as text. Never draw or generate a logo. Cards show only `•••• 1234` when the person adds the last four digits; credit cards show used, available and the limit.

## Tokens

All colours are CSS variables in `apps/web/src/app/globals.css`, with light and dark values.

- **Canvas:** `--background` (a cool near-white). Content groups sit on white `card-surface` / `ios-group` surfaces.
- **Accent:** one green (`--primary`). Use it for primary actions, active navigation, positive money and Safe to Spend.
- **Semantics:** green for income and good states, `--expense` red for problems and overspending, `--warning` amber for attention. Expenses in lists use the normal text colour, not red.
- **Signature surfaces:** only the Home green environment and account cards (the provider's or account's own colour) carry strong colour. Safe to Spend is a calm light surface: green when healthy, amber when this week's share is used, red only when money is genuinely short.

## Shape

- Text buttons are rounded rectangles: 12px (default), 14px (large), 10px (small).
- Icon-only buttons, header controls, the + and the tab bar are circles or capsules.
- Chips and segmented controls stay pills.
- Inputs are 12px (`rounded-lg`).
- Inner tiles are 17px (`rounded-xl`).
- Surfaces are 22px (`rounded-2xl`).
- Hero cards and sheets are 26px (`rounded-3xl`, sheets 28px on phones).

## Type

Geist throughout. Money always uses tabular figures.

| Use | Class |
|---|---|
| Home balance | 32 to 40px bold on phones (steps down for long amounts), 52px on desktop |
| Major money (Safe to Spend, net worth) | `display-xl` (32px bold) |
| Page titles | `page-title` (26px bold, 30px on desktop) |
| Section titles | `section-title` (16px bold) |
| Card and row titles | 15px medium to semibold |
| Body and supporting text | 13 to 14px |
| Small labels | `eyebrow` (12px semibold, muted) or `label-caps` (11px bold, tracked capitals) |

Weight carries the hierarchy: titles and money are bold, supporting text stays regular. Negative amounts keep their sign and colour; positive money can use Faldo green.

Sentence case for titles, buttons and copy. The one exception is `label-caps`: small, tracked all-caps labels that name a figure (NET WORTH, BALANCE, TOTAL DUE, the date on Home). No em dashes in copy.

## Glass

Content is solid; controls float. `nav-glass` (the tab bar and its corner +) is a neutral frosted capsule (white in light mode, smoky grey in dark) that picks up the colour of what scrolls beneath it, lit along its top edge; `nav-lens` is the darker pill under the selected tab. `glass-control` (small header buttons) is a clearer glass with strong colour pickup, a bright thin rim and a soft specular sheen, and `glass-on-green` is the same idea on the Home environment. All of it is a web approximation of liquid glass, not Apple's native material. Never on cards, lists, charts or money. Page tops use `scroll-edge`, a soft fade and blur where content passes under the floating header, instead of a hard bar. `prefers-reduced-transparency` falls back to solid surfaces.

## Spacing and alignment

Phones use 20px page margins; tablets 24px; desktop 32px. The scale is 4, 8, 12, 16, 20, 24, 32, 40, 48. Section titles sit 12px above their content, sections are 24 to 32px apart, and cards pad 16 to 20px. Page titles, section titles, cards, the tab bar and the + share the same left and right edges; nothing is inset by a few pixels.

## Lists before cards

Transactions, bills, goals and budgets are rows in one grouped surface with inset dividers, not a card per item. Section titles sit on the canvas above the surface, with one "See all" link.

## Charts

Every chart answers one question, written as its section title.

- **Balance line** (`BalanceLine`): one green line over a quiet dashed grid, a compact scale on the right (hidden while amounts are hidden), first, middle and last dates below, and a dot for today. Drag across it with a finger or mouse, or use the arrow keys, to read any day; on Home it is white on green and that day's balance replaces the headline. Range chips run 1W to 1Y. There is no 1D range because balances are tracked per day.
- **Where it went:** a ranked list with bars sized to the largest category, not a pie.
- **Money in and out:** restrained 12-month bars.
- **Forecast:** actual versus projected with a likely range, always labelled as an estimate.

## Motion

Fast and ordered, using transforms and opacity only.

- **Tabs:** the lens glides to the new tab on a spring, filling the icons it passes over (see Navigation).
- **Pages:** the first visit plays `page-enter`: the header settles in 180ms, then each group below follows at 60ms steps (260ms each: fade, a 6px rise, 3px blur to sharp), and anything marked `.cascade` (Plan rows, History days, Wallet groups, quick actions, Home cards) flows in one after another at 45ms steps. Coming back to a page plays a quick 180ms fade (`page-return`).
- **Scroll:** on scroll down the tab bar sinks away and turns into a glass + in the corner and the page header fades up out of the way; on scroll up both come back, the bar rising under the +, which fades into it.
- **Theme:** light and dark crossfade in 240ms with view transitions where supported (`useSmoothTheme`).
- **Everything else:** sheets rise, money counts up, buttons press to 97%.

`prefers-reduced-motion` turns all of it into instant state changes, except the phone tab bar and the page header's scroll transition (`data-motion="always"`), which keep moving by the owner's choice.

## Top of the screen on iPhone

iOS 26 blurs a band from the status bar down about 40pt (the Liquid Glass scroll edge effect); there is no CSS or meta switch to turn it off. A tiny script marks `html.ios` before first paint, and `--top-inset` (the safe area plus 2.5rem on iOS) is where crisp content may start: page headers, the green bands, sticky filters, sign-in, onboarding and toasts all use it. Only the band's green or the page colour sits in the blur.

## Data integrity

The UI never computes financial results. Balances, Safe to Spend, forecasts, plan buckets and Faldo Check figures come from the backend engine. Cards show only safe account details: name, bank, optional last four digits, balance and credit limit.
