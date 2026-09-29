/**
 * Market registry. `line_snapshots.market` is open text; this is the list the
 * app accepts and the contract for what each value column means. Adding a
 * market = add an entry here (+ adapter mapping). No migration.
 */
export const MARKETS = {
  spread: {
    label: "Spread",
    // home_value: home handicap (negative = home favoured); away_value = -home_value.
    // price_home / price_away: American odds for each side.
  },
  total: {
    label: "Total",
    // home_value = away_value = the total points line.
    // price_home: over price; price_away: under price.
  },
  moneyline: {
    label: "Moneyline",
    // home_value / away_value: NULL. price_home / price_away: American odds.
  },
} as const;

export type Market = keyof typeof MARKETS;
export const MARKET_KEYS = Object.keys(MARKETS) as Market[];
export const isMarket = (v: string): v is Market => v in MARKETS;
