import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Combined daily cron: NAV snapshot + leaderboard (Hobby plan: 1 cron/day) */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const headers: HeadersInit = {};
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  const [navRes, lbRes] = await Promise.all([
    fetch(`${base}/api/cron/nav`, { headers }),
    fetch(`${base}/api/cron/leaderboard`, { headers }),
  ]);

  return NextResponse.json({
    ok: true,
    nav: await navRes.json(),
    leaderboard: await lbRes.json(),
  });
}
