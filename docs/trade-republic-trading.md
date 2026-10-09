# Direct Trade Republic trading (experimental)

Open Assets > Trade Republic handeln. The dialog defaults to native EUR amount orders (market orders, from EUR 1,
including fractional shares) for stocks and ETFs. Whole units with a good-for-day
limit remain available as an alternative. Both use EUR securities accounts.
The amount is the trade value excluding broker fees and taxes. Fees are added for
buys and deducted from expected sale proceeds. Market quotes and share estimates
are indicative; actual execution can differ. The broker must confirm fractional
trading support and its step size. Fee simulation uses a fractional size rounded
down to that step from a fresh broker quote; submission preserves the exact EUR
amount in the native amount field, alongside the current estimated size. Missing
fractional support blocks the order. Sales recheck available shares at the fresh
bid price before submission.
Use the existing Import screen to save broker credentials with OS encryption.
The trading connection uses those credentials in an isolated pytr session and
can require approval in the Trade Republic app or an authenticator code.
No order is sent by opening the dialog, logging in, or requesting a preview.

The main process validates the instrument, broker exchange, side quote and its
timestamp, broker fee lines, available cash/units, and suitability response.
Unknown formats produce blockers instead of invented prices, fees, or approvals.
A preview expires after 30 seconds. Submission consumes its token, rechecks all
broker data and costs, and requires the explicit confirmation checkbox and final
button. It records intent before the single network attempt. Submitted means the
broker returned an order ID; it does not mean filled. FinPal does not book a local
transaction or change holdings. Use the existing broker import for the actual
settlement record.

The encrypted sync credentials remain under the existing storage policy. Trading
cookies are stored separately in userData/trade-republic-trading-session.bin using
Electron safeStorage (Windows DPAPI), bound to the saved phone/PIN. No plaintext
cookie file is written. A new worker first restores cookies in memory and validates
them through pytr.settings() and accountPairs before enabling trading. Expired
cookies or an HTTP 401/403 cause a new login; network/5xx errors retain the saved
session and do not automatically request another approval. Successful broker
responses refresh the encrypted snapshot through private IPC metadata. A storage
failure never discards an acknowledged order result.
Credentials are passed once over the private worker stdin pipe; the trading worker
does not write a plaintext PIN file. Its temporary profile is removed on process
close; the worker is closed on disconnect, main-window destruction, or app exit.
Disconnect/app exit retain the stored session. Sitzung loeschen removes it;
forgetting/changing credentials also invalidates it, including late worker replies.
Import sessions remain separate. Broker session lifetimes are not extended or
bypassed. Protocol verification used the installed pytr 0.4.10 wheel.
No PIN, cookies, Python traceback, or raw authentication logs are returned to the
renderer. Local order intents/outcomes are saved in userData/trade-republic-orders.json.
An unknown outcome blocks further submissions across restarts. Read active and
terminated orders with Orderstatus pruefen; only an exact broker clientProcessId
match resolves an unknown receipt. Definitive broker error responses are recorded
separately as rejected. There is no automatic retry or heuristic matching by amount.

Protocol references inspected 2026-10-08:
- https://github.com/pytr-org/pytr (runtime pinned to PyPI pytr==0.4.10)
- https://github.com/4strium/trade-republic-uapi/blob/main/trade_republic_uapi/api_server.py
- Public Trade Republic web frontend release 2.2641.2: priceForOrderV2,
  tickerV3, orderFeesV2, instrument-suitability REST, simpleCreateOrder.

Validation uses fake broker transports and a fully offline Python module stub.
The installed wheel was checked for v2 login support without authenticating.
Actual account response compatibility and live order execution have not been tested.

Read-only quote compatibility: if tickerV3 is rejected, preview falls back to the
legacy JSON ticker subscription for the same ISIN and exchange. Quote freshness
and matching side-price checks still apply. Unsupported fractional sizing skips
the invalid zero-size fee request and produces preview blockers. Broker errors
show only an allowlisted request stage and validated error code (including nested
errors arrays); raw error messages and payloads remain private. Order creation
never uses this fallback or any automatic retry.

Execution defaults to Trade Republic Best Price (native TIB destination), not a
local comparison of venue quotes. Direct Price with a manual venue is optional.
For TIB previews the worker reads the authenticated order-router v2 instrument
destinations endpoint and requires an available EUR TIB destination; fractional
step size comes from instrument.exchanges matched by the destination slug, as
in the official frontend (not from the routing destinations response). Missing, closed market-order routing or
an outage blocks submission, with no silent switch to LSX or another venue.
The same TIB route is used for quotes, fee simulation and order submission.
References: https://support.traderepublic.com/de-de/3372dc64-59cb-4521-a424-1ee812f264a4
and official frontend use-instrument-list-destinations / WidgetOrder modules.

REST compatibility: destinations v2 uses the existing authenticated pytr HTTP
session with the official web-pro platform header, Accept-Language and JSON
content type, plus lang=de and productContext=stock/fund from the broker instrument type.
The official frontend also supplies userId=sub and jurisdiction from the base64
JSON tr_claims cookie. FinPal reads these fields only inside the authenticated
worker and includes them only in the destinations request, never in renderer
diagnostics. Missing, ambiguous or malformed claims block the request and ask
for a fresh trading connection; no identity or jurisdiction is guessed. Suitability uses the same
REST headers. Failures retain only an allowlisted stage, validated broker code or
HTTP status (e.g. HTTP_401); invalid responses and local request failures are not
reported as explicit broker rejections. Tests cover actual HTTP helper construction
with a fake session, including requests-style falsey HTTP error responses.

Instrument schema: the official frontend reads instrument.typeId. Routing now
uses that field for stock/fund productContext; preview validation uses the same
field, with type supported only for legacy responses that lack typeId. Tests
use native typeId fixtures and assert it reaches the routing request. Unknown,
missing or unsupported types still block instead of using the local asset type.

Fractional sizing diagnostics distinguish missing proprietaryTradable approval,
explicit lack of approval, missing step size, whole-share-only steps and amounts
below the tradable minimum. Public instrument metadata shows the broker step
used. TIB REST destinations are used only to confirm routing availability.

Instrument identity is native instrument.isin, with id accepted only for older
responses without isin. The official trading frontend and TR hackathon sample
use isin/typeId. Fixtures mirror those fields. Direct venue availability accepts
exchangeIds or native exchanges[].slug and rejects an explicit inactive venue.
Identity, unsupported type, inactive instrument and unavailable venue produce
separate blockers; public diagnostics include these fields for inspection.

Create-order wire contract: parameters.type conveys buy/sell; no extra side
field is sent. Native market amount orders pass lastClientPrice as a JSON number
(the price shown in the confirmed preview). Limit orders omit lastClientPrice,
as the official frontend does. Offline tests check the exact permitted JSON keys
and scalar types after serialization, for both buys/sells and limit orders. A
JSON_PARSE_ERROR remains a definitive rejected receipt with no automatic retry.
