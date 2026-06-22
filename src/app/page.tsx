import { Dashboard } from "@/components/dashboard/Dashboard";
import { buildSnapshot } from "@/lib/snapshot";

/**
 * Dashboard home. Renders on the server (behind Cloudflare Access — locked to Mark), reading
 * the live snapshot directly via {@link buildSnapshot} rather than self-fetching the
 * bearer-gated `/api/snapshot` route. Section switching happens client-side in {@link Dashboard}.
 *
 * `force-dynamic` + `runtime = "nodejs"`: the snapshot reads `process.env` secrets and SQLite,
 * and must reflect current state on each load.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  const snapshot = await buildSnapshot();
  return <Dashboard snapshot={snapshot} />;
}
