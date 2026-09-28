/**
 * One money formatter, so the same amount cannot read two ways on one screen.
 *
 * README Content: "Currency: `$1,184.20`, `$61 of $200`" — cents when they
 * matter, whole dollars when they do not. `Spend.tsx` used `.toFixed(0)`
 * everywhere, so a real month spend of 0.42 printed as **`$0`** in the ring
 * centre, in "$0 of $200 this month" and in "EA · $0/150" — on a page whose
 * stat card and rail both said **`$0.42`** from the very same sum
 * (ux-review R6-01). The audit had just filled that ring centre, which
 * promoted the wrong number to the largest thing on the card.
 *
 * The rule: show cents whenever dropping them would change what the reader
 * takes away — which is any amount that is not already a whole number of
 * dollars, and above all any non-zero amount under a dollar.
 */
export function money(amount: number): string {
  return Number.isInteger(amount) ? `$${amount.toLocaleString("en-AU")}` : `$${amount.toFixed(2)}`;
}

/**
 * The live spend counter — always two decimals.
 *
 * The rail, the phone header and the Agents stat card all show "spend today" as
 * a running figure, and TD-02 asserts its shape directly
 * (`/^(all healthy|needs attention) · \$\d+\.\d{2}$/`): a counter that
 * changed width as it crossed a whole dollar would be worse, not better. So
 * this is a deliberate second form, not an exception that escaped `money()` —
 * AUDIT_v2.md AA-07 was right that three call sites bypassed the "single
 * formatter", and this is what they should have been calling.
 */
export function moneyPrecise(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
