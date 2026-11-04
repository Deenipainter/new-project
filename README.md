# DP Data Sub

**Your Data, Your Way.** A mobile-first Nigerian VTU wallet built on Next.js (App Router) with PostgreSQL,
Prisma, a session-based auth system, an append-only wallet ledger, and isolated provider integrations.

## Stack

- **Next.js 16 (App Router)** — UI, API route handlers, server-side secrets.
- **PostgreSQL + Prisma** — users, wallets, ledger, orders, payments, plans, referrals, audit.
- **Session auth** — bcrypt password hashes, opaque session tokens stored hashed in the database,
  httpOnly cookie, single-use expiring tokens for email verification and password reset.
- **Money** — all amounts are integer **kobo**; no floating point anywhere.

## Commands

```bash
npm run dev          # dev server
npx tsc --noEmit     # type check (never `next build` against a live preview)
npm run db:push      # apply prisma/schema.prisma
npm run db:seed      # seed services, MTN SME reference plans, announcement

# verification suites (see "Database & verification" below)
npx tsx scripts/logic-check.mts                                   # pure logic, no DB
LEDGER_CHECK=1 npx tsx scripts/ledger-check.mts                   # ledger invariants, needs DB
NODE_OPTIONS=--conditions=react-server npx tsx scripts/http-e2e.mts  # auth/orders/payments, app must be running
```

## Environment

See `.env.example`. Minimum for a working app:

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | written automatically when PostgreSQL is connected to the app |
| `ADMIN_EMAILS` | comma-separated emails granted the ADMIN role |
| `NEXT_PUBLIC_APP_URL` | absolute URL used in email links outside a browser request |
| `ALRAHUZ_API_KEY`, `ALRAHUZ_API_BASE_URL`, `ALRAHUZ_ENDPOINTS_VERIFIED` | VTU provider |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` | wallet funding |
| `PAYSTACK_PALMPAY_ENABLED` | set `true` only after PalmPay is confirmed in your Paystack checkout |
| `PAYSTACK_CHANNELS` | optional comma list of channels enabled on the account (`card,bank,ussd,bank_transfer`) |
| `PAYSTACK_ALLOW_LIVE` | `true` to permit live keys; live charging stays blocked until then |
| `RESEND_API_KEY`, `EMAIL_FROM` | verification / reset email |
| `REFERRAL_REWARD_KOBO` | referral bonus, `0` = track only |

### Paystack webhook

Register `https://<your-domain>/api/payments/webhook` in the Paystack dashboard. The handler:

1. verifies the `x-paystack-signature` HMAC-SHA512 against the **raw** body,
2. re-verifies the transaction with the Paystack API,
3. credits the wallet once via a unique ledger reference (`PAY-<reference>`).

A redirect back to `/wallet/fund/callback` triggers the same server-side verification; a query string
alone never credits a wallet.

Settlement is one serialisable transaction: the ledger row, the wallet balance and the payment status
commit together, and `LedgerEntry.reference` (`PAY-<reference>`) is unique, so duplicate webhooks and a
webhook/verify race cannot credit twice.

### PalmPay (through Paystack, not a separate integration)

Paystack has no standalone PalmPay channel and no API that lists a merchant's enabled channels. For
Nigerian accounts PalmPay is a wallet offered **inside the `bank` channel**: the customer picks Bank, then
PalmPay, then authorises with their PalmPay PIN.

The **PalmPay** option on `/wallet/fund` therefore sends `channels: ["bank"]` to
`POST /transaction/initialize`. It is offered only when all of the following are true:

1. `PAYSTACK_SECRET_KEY` is a real key,
2. the Bank channel is enabled in the Paystack dashboard under *Settings → Preferences → Payment channels*,
3. `PAYSTACK_PALMPAY_ENABLED=true` is set here after confirming PalmPay appears at checkout.

Until then the option renders disabled with the reason, and `POST /api/wallet/fund` refuses it with
`PAYMENT_METHOD_UNAVAILABLE` — no payment is simulated. The channel list is always resolved on the server
from the submitted method id; a `channels` field in the request body is ignored.

`PAYSTACK_CHANNELS` is optional and only narrows the offer: if it is set and omits `bank`, PalmPay is
unavailable regardless of the flag.

### Payment tests

```bash
NODE_OPTIONS=--conditions=react-server npx tsx scripts/payment-flows.mts
```

Runs the real settlement engine, ledger, Paystack client and database against a local mock provider
(`127.0.0.1:5555`, test keys injected by the script). Covers success, duplicate verify, duplicate webhook,
cancelled checkout, failed payment, wrong amount, wrong currency, unknown/foreign references, channel
mapping and PalmPay gating. It creates one test user and deletes it plus its rows afterwards.

### Alrahuz integration

No official Alrahuz Data API reference was available in this project and none could be located publicly.
Because of that, **no endpoint URL or service code is hard-coded**, and purchases stay disabled until:

1. `ALRAHUZ_API_BASE_URL` and `ALRAHUZ_API_KEY` are set,
2. the endpoint contract (plan list, purchase, requery, balance) is confirmed against the provider,
3. `ALRAHUZ_ENDPOINTS_VERIFIED=true` is set deliberately.

Then an admin runs **Sync live plans** on `/admin`, which imports provider plans with `source = PROVIDER`.
Only those rows can be purchased. The MTN SME prices in `prisma/seed.mjs` are the account owner's
**reference** prices and are never sent to the provider.

## Database & verification

The managed PostgreSQL service for this project never became Ready (the Service IP answered with
`ECONNREFUSED` on 5432 for the whole session, including after a clean stop/start cycle), so the schema and
seed were applied to a **disposable local PostgreSQL** running inside the preview container:

```bash
node scripts/dev-pg.mjs     # PostgreSQL (WASM) on 127.0.0.1:55432, multiplexed connections
```

`.env` currently points `DATABASE_URL` at that local instance so the preview stays usable. That database is
**not durable** and must never be used outside the preview — `src/lib/db.ts` refuses to boot when
`NODE_ENV=production` and the URL is a loopback address. To return to the managed instance, re-connect the
PostgreSQL service in IQX (it rewrites `DATABASE_URL`), or restore the managed connection string manually,
then run `npx prisma db push && npm run db:seed` once it is reachable.

Tests:

- `scripts/logic-check.mts` — money, phone/password validation, provider status mapping, MTN plan set.
- `scripts/ledger-check.mts` — atomic debit guard, duplicate-reference protection, single refund, ownership
  scoping. Requires `LEDGER_CHECK=1` and a disposable database.
- `scripts/http-e2e.mts` — registration, login, password reset, referral capture, order gate, payment
  gating, webhook refusal, throttling, session revocation. Requires the app running and
  `NODE_OPTIONS=--conditions=react-server` so `server-only` modules resolve.

## Data safety rules implemented

- `ledgerEntry.reference` is unique → a retry cannot credit or debit twice.
- Debits use `UPDATE ... WHERE balanceKobo >= amount` → concurrent orders cannot overspend.
- Orders carry a unique `idempotencyKey` → duplicate submissions return the original order.
- A provider timeout leaves the order `PENDING` and is **never** auto-resubmitted; reconcile explicitly.
- Definitive provider failures refund once through a `REFUND-<reference>` ledger entry.
- Every admin refund/adjustment writes an `AuditEvent`.
- Ownership is enforced in queries (`where: { userId }`), not by hiding rows in the UI.

## Service availability

`ServiceAvailability` rows drive the UI. States are honest: `ENABLED`, `PROVIDER_CONFIG_REQUIRED`,
`COMING_SOON`. A disabled service shows what is missing instead of a fake success screen. CAC, NIN, BVN and
crypto services deliberately collect no data and never ask for seed phrases or private keys.

## Open infrastructure blocker

The managed PostgreSQL dependency (`cmvsfhl7t3aahud01kb82xyfs`) has never reached a Ready state. Its DNS
name resolves to the cluster Service IP, but nothing listens on 5432, so every connection attempt gets
`ECONNREFUSED` (not a timeout, and not a credentials error). A controlled `stop` → `start` cycle did not
change it, no pod events or logs are exposed to the project, and the container has no cluster API access,
so the failure cannot be repaired from inside the project.

Required platform action: rebuild or reprovision the PostgreSQL dependency for this project (or recreate the
project's dependency so a new volume/pod is scheduled), then confirm port 5432 accepts connections. After
that, re-connect it to the app so `DATABASE_URL` is rewritten to the managed host, run
`npx prisma db push && npm run db:seed`, and delete the local verification database.

Live vending and wallet funding remain **disabled** regardless of database state: `ALRAHUZ_*` and
`PAYSTACK_*` credentials are absent, so both the VTU and payment paths are gated server-side.
