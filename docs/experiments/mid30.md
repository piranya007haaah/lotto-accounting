# ลาวภูผา76 / ลาวสายธาร65 in Formula Lab

Both supplied Python v1.0 selectors are implemented in `src/lib/lottery/mid30.ts` and offered as separate Lab tabs through the existing `AllLotteryExperiment` form, worker, summary/search, per-group details, and JSON exports. They run independently for every two-digit lottery/position group, including upper and lower. Applying the original Lao Development upper-two formula to other groups is labelled an extension experiment.

| Formula | Pair-frequency window | Tens/units window | Selected ranks |
|---|---|---|---|
| ลาวภูผา76 (`phupha76`, MIX7/6-MID30) | 7 calendar months | 6 calendar months | 31–60, exactly 30 numbers |
| ลาวสายธาร65 (`saithan65`, MIX6/5-MID30) | 6 calendar months | 5 calendar months | 31–60, exactly 30 numbers |

The score is `0.5*(c+1)/(Nf+100) + 0.5*(t+1)*(u+1)/(Nd+10)^2`. Integer numerators determine the descending order, with numeric ascending ties. All 00–99 are ranked; leading zeros remain intact. Each monthly selection uses only outcomes before the first day of that month and is held for the entire month. Stake/payout affect evaluation, never selection. No settings or formulas are selected using test performance.

Strict mode is the default for these new tabs: every training day must have either an actual outcome or explicit `xx` no-draw confirmation. `--`, absent years and truncated history remain unknown. No cancellations from other lotteries are inherited. This adapts the original JSON certification requirement to dataset calendar slots without asserting that omitted dates are holidays. Observed-only mode is an explicitly labelled additional experiment; it requires outcomes in each training month and records all unknown dates. It does not certify completeness or reproduce the original data-validation policy.

Details display both training windows/counts, selected numbers, the complete 100-number audit, per-draw results, partial test months, unknown test dates, and skipped-month reasons. JSON detail exports retain exact numerator/denominator, full rank order, coverage policy and missing dates. Annual DD retains the existing bulk Lab convention relative to initial capital. Main formula rankings, portfolio configuration and the original Lao Star snapshot namespace are unchanged.

`scripts/mid30-reference.py` preserves the supplied Python selector before its truncated CLI. Run `node_modules/.bin/jiti scripts/mid30-check.ts [source-json]` for parity and data-contract checks. Optional source JSON uses the existing `{rows: [...]}` snapshot format; it is a local read-only check, not a refresh or production issuance. Existing formula, rank and bulk Lab checks should continue to pass.
