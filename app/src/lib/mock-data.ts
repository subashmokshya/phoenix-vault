export type PoolCard = {
  address: string;
  name: string;
  manager: string;
  managerName: string;
  strategyTag: string;
  description: string;
  aum: number;
  pnl7d: number;
  pnl30d: number;
  perfFeeBps: number;
  mgmtFeeBps: number;
  featured: boolean;
  depositorCount: number;
  sharePrice: number;
  navHistory: { ts: string; nav: number }[];
  phoenixAuthority?: string;
};

export const DEMO_POOLS: PoolCard[] = [
  {
    address: "AlphaVault1111111111111111111111111111111",
    name: "Alpha Momentum",
    manager: "Mgr1111111111111111111111111111111111111",
    managerName: "quant.sol",
    strategyTag: "Momentum",
    description:
      "Systematic momentum on SOL and BTC perps. Low drawdown, steady compounding.",
    aum: 2_450_000,
    pnl7d: 12.4,
    pnl30d: 38.2,
    perfFeeBps: 2000,
    mgmtFeeBps: 100,
    featured: true,
    depositorCount: 142,
    sharePrice: 1.382,
    navHistory: generateNavHistory(30, 1.0, 0.38),
  },
  {
    address: "BetaVault222222222222222222222222222222222",
    name: "Delta Neutral Yield",
    manager: "Mgr2222222222222222222222222222222222222",
    managerName: "delta.hedge",
    strategyTag: "Market Neutral",
    description:
      "Funding-rate arbitrage with delta-neutral positioning across majors.",
    aum: 5_100_000,
    pnl7d: 3.1,
    pnl30d: 11.8,
    perfFeeBps: 1500,
    mgmtFeeBps: 50,
    featured: true,
    depositorCount: 318,
    sharePrice: 1.118,
    navHistory: generateNavHistory(30, 1.0, 0.12),
  },
  {
    address: "GammaVault333333333333333333333333333333333",
    name: "Vol Harvest",
    manager: "Mgr3333333333333333333333333333333333333",
    managerName: "vol.trader",
    strategyTag: "Volatility",
    description: "Short-vol carry with dynamic hedging on commodity perps.",
    aum: 890_000,
    pnl7d: 18.7,
    pnl30d: 52.1,
    perfFeeBps: 2500,
    mgmtFeeBps: 0,
    featured: true,
    depositorCount: 67,
    sharePrice: 1.521,
    navHistory: generateNavHistory(30, 1.0, 0.52),
  },
  {
    address: "DeltaVault444444444444444444444444444444444",
    name: "Macro Swing",
    manager: "Mgr4444444444444444444444444444444444444",
    managerName: "macro.whale",
    strategyTag: "Macro",
    description: "Event-driven macro swings on ETH and commodity futures.",
    aum: 1_200_000,
    pnl7d: -2.3,
    pnl30d: 8.4,
    perfFeeBps: 2000,
    mgmtFeeBps: 200,
    featured: false,
    depositorCount: 89,
    sharePrice: 1.084,
    navHistory: generateNavHistory(30, 1.0, 0.08),
  },
  {
    address: "EpsilonVault55555555555555555555555555555555",
    name: "Scalp Engine",
    manager: "Mgr5555555555555555555555555555555555555",
    managerName: "scalp.bot",
    strategyTag: "HFT",
    description: "High-frequency scalping on tight spreads, sub-minute holds.",
    aum: 340_000,
    pnl7d: 24.1,
    pnl30d: 71.3,
    perfFeeBps: 3000,
    mgmtFeeBps: 0,
    featured: false,
    depositorCount: 41,
    sharePrice: 1.713,
    navHistory: generateNavHistory(30, 1.0, 0.71),
  },
  {
    address: "ZetaVault6666666666666666666666666666666666",
    name: "Basis Arb",
    manager: "Mgr6666666666666666666666666666666666666",
    managerName: "basis.fund",
    strategyTag: "Arbitrage",
    description: "Cross-market basis capture with minimal directional exposure.",
    aum: 3_800_000,
    pnl7d: 5.6,
    pnl30d: 19.2,
    perfFeeBps: 1000,
    mgmtFeeBps: 100,
    featured: true,
    depositorCount: 201,
    sharePrice: 1.192,
    navHistory: generateNavHistory(30, 1.0, 0.19),
  },
];

function generateNavHistory(
  days: number,
  start: number,
  totalReturn: number
): { ts: string; nav: number }[] {
  const points: { ts: string; nav: number }[] = [];
  const end = start * (1 + totalReturn);
  for (let i = 0; i <= days; i++) {
    const t = i / days;
    const noise = (Math.random() - 0.5) * 0.02;
    const nav = start + (end - start) * t + noise;
    const date = new Date();
    date.setDate(date.getDate() - (days - i));
    points.push({ ts: date.toISOString(), nav: Math.max(0.5, nav) });
  }
  return points;
}

export function getPoolByAddress(address: string): PoolCard | undefined {
  return DEMO_POOLS.find((p) => p.address === address);
}

export function getFeaturedPools(): PoolCard[] {
  return DEMO_POOLS.filter((p) => p.featured);
}

export function getTopPnlPools(limit = 6): PoolCard[] {
  return [...DEMO_POOLS].sort((a, b) => b.pnl7d - a.pnl7d).slice(0, limit);
}
