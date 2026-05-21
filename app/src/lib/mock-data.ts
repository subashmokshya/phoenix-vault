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
