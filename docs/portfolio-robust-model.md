# Robust portfolio scenario model v2

This model produces a conditional 12-month scenario, not an execution instruction or a forecast of ten-year performance. It does not impose category quotas, position caps or a minimum cash percentage. User-confirmed allocation bands remain hard constraints. Unmodeled holdings remain unchanged and are not treated as having zero real-world risk.

## Return evidence

Both analyst signals and historical bootstrap signals receive a base weight of 0.25. For crypto, the unshrunk bootstrap median is used before this common adjustment; the already-shrunk legacy target is not shrunk a second time. Analyst signals receive an additional coverage weight `n / (n + 10)`. Analyst count is a coverage proxy, not a count of independent observations.

The turnover uncertainty penalty uses the larger of the supplied forecast half-range and historical annual volatility divided by the square root of the available coverage (analyst count or historical years), multiplied by the signal weight. Analyst min/max targets and bootstrap P10/P90 ranges have different meanings; these proxies are explicitly not confidence intervals or calibrated prediction errors.

The factors 0.25 and 10 are transparent conservative assumptions, not empirically fitted constants. Lower coverage and wider ranges weaken a signal and/or increase its turnover penalty. Unknown coverage or a missing forecast range cannot authorize a proposed trade.

## Risk and objective

Adjusted daily closes are converted into EUR using same-date historical FX observations. No current FX rate is substituted for missing historical FX. Dates are intersected before log returns are calculated, so each series covers identical intervals. At least 180 common return intervals spanning at least 180 calendar days are required, ending no more than seven days ago.

The annualized sample covariance is shrunk toward its own diagonal. The shrinkage intensity is estimated from off-diagonal sampling noise, bounded to [0, 1]. This retains positive semidefiniteness and allows measured negative correlations. The estimator follows the diagonal-target shrinkage approach; it does not claim to implement all variance/correlation shrinkage steps of corpcor. Methodological background: [Schäfer and Strimmer (2005)](https://strimmerlab.github.io/publications/journals/shrinkcov2005.pdf).

The solver maximizes `adjustedReturn · weights - lambda / 2 * weights' covariance weights - uncertainty · abs(weights - currentWeights)`, followed by fees and the existing discrete execution checks. Risk aversion remains profile-dependent. Missing covariance produces no confirmed reallocation; the old numerical benchmark may only serve as a clearly marked scenario.

## Decision checks

A proposed purchase requires a cited assessment of material company/product risks. Documented losses, margin distress, financing, going-concern or regulatory problems require review; they are not converted into invented numerical risk premiums. Unknown assessments also require review for a purchase.

The complete proposed trade bundle is compared with leaving holdings unchanged under: adverse return uncertainty, doubled risk aversion, quarter-sized return signals, perfect positive correlation stress, and failure of each proposed purchase's positive return signal. These are stress scenarios with no assigned probabilities, not an exhaustive robustness guarantee. A nonpositive net utility improvement in any check requires review. The utility comparison is not a predicted cash profit.

Trades that consume all available cash without a buffer for unknown spreads/taxes require review. This does not estimate taxes or certify their absence when a cash buffer exists. Tax and execution checks remain necessary.

Review applies to the complete dependent trade bundle: a declined purchase cannot leave a funding sale as an approved action. Scenario trades and targets remain visible separately, actual trade amounts are null, projected holdings/cash remain unchanged, and apparent implementable return/gain/risk metrics are cleared. Qualitative analysis continues. The AI may retain a holding or require review for additional substantiated reasons; it is never required to endorse a numerical scenario.

## Compatibility and evidence

Published targets, raw signals, adjusted signals, coverage, uncertainty proxies, common observation count, covariance shrinkage, concentration before/after, and stress results are displayed separately. Older saved analyses remain readable and are explicitly labeled as old scenarios requiring reanalysis for v2.

Only the local market provider may supply historical series and numerical uncertainty evidence. AI-supplied historical arrays are discarded. Raw daily series stay local and are stripped from model request/correction payloads. Existing successful web research remains reusable for 24 hours. Loading/upgrading historical market data is a separate operation.

New security candidates also receive a local, ISIN-based EUR quote lookup through Deutsche Börse's price-information endpoint. The returned ISIN, EUR trading currency, venue, positive per-unit price and actual market timestamp must match; percentage quotations, missing timestamps, future timestamps and quotes older than seven days are rejected. This maximum age is a data-validation ceiling, not confirmation of present executability. The displayed value is explicitly the last exchange trade, with its market and retrieval timestamps. Broker availability, bid/ask spread and execution price remain unconfirmed. The verified Xetra listing for IE00BF4RFH31 is IUSN.DE; the proposed WSML identifier and held-asset data are preserved.

Successful candidate quote lookups persist for a rolling 24 hours, separately from the web-research cache. Failed lookups remain nonblocking and are reported as checked with no usable quote. New quote evidence and source indexes are supplied for a second assessment of the candidate, including candidates initially marked for review. Model-supplied quote objects are discarded. Quote availability alone never supplies a missing forecast or bypasses the robust allocation checks.

Unit and integration tests verify the numerical invariants and decision gates. They do not establish forecast accuracy or live account/API eligibility; empirical calibration/backtesting is still required before claiming improved investment performance.

## ETF history scenarios

Held ETFs can use a separate `etf-history-v1` local model without an analyst target. New ETF candidates can use it when their ISIN-based quote provides a confirmed historical listing identifier (currently IUSN.DE for IE00BF4RFH31). Other new candidates without a confirmed listing remain reviewed with an explicit missing-data note; an AI-proposed ticker is never sufficient to select a different instrument's history.

The provider requests up to eight years of daily history. The model requires at least 1,261 adjusted closes spanning five years, 200–280 observations per calendar year, no gaps exceeding 14 calendar days, and positive finite prices. Empty holiday bars are removed; a traded bar lacking an adjusted price is rejected. Conflicting duplicates, flat series and stale/mismatched currencies are rejected. Today's incomplete daily bar is excluded. The reference price is the raw close of the last completed bar; its timestamp identifies the historical bar, not a current executable quote.

The model generates 2,000 deterministic moving-block bootstrap paths, using 20-trading-day blocks and a 252-trading-day horizon. P10, median and P90 are historical resampling scenarios, not calibrated confidence intervals or future probabilities. The median receives the same 0.25 signal weight as the existing robust model, exactly once. Historical volatility uses sample variance of the last 252 daily log returns, annualized by `sqrt(252)`. The five-year minimum, block length, horizon, shrinkage and uncertainty penalty are explicit model assumptions and require empirical validation; they do not establish forecast accuracy.

Adjusted closes provide a return proxy incorporating provider split/distribution adjustments. The displayed target is therefore a model reference value, not a published future ETF price; future distributions must not be added again. Fund expenses already reflected in prices are not subtracted a second time. Signals remain in the history's original trading currency, while same-date historical FX produces the EUR risk series; missing FX means no complete ETF model. Risk covariance uses aligned EUR returns with existing holdings. For new EUR ETF candidates the signal is recomputed against the independently verified current EUR quote, so intraday price changes are not ignored.

Successful models persist for 24 hours; explicitly requested market refresh bypasses that cache. A labeled fallback after a provider failure requires a valid model and reference no older than seven days. Reused web research keeps its separate 24-hour policy. Only the local provider can attach numerical ETF-model metadata, uncertainty and price arrays; AI-provided model fields are discarded, and daily arrays are omitted from model request/correction payloads.

An ETF initially marked `Prüfen` can still enter the joint nominal scenario when valid local evidence is present. This inclusion does not approve a purchase. All existing covariance, uncertainty, product-risk, fee, cash and stress gates apply. If the analysis subsequently declines a modeled ETF purchase, the dependent trade bundle remains open for review with no approved amounts. A model target of zero is also a calculation result; no allocation is invented merely to create an ETF purchase.
