// Shared Post for Me account cleanup.
//
// Stale PfM accounts (left behind after a disconnect in Orange Door) make the
// next OAuth connect for that platform fail. These helpers make sure PfM never
// keeps accounts that our DB doesn't know about.

const PFM_API = "https://api.postforme.dev";

// PfM's platform enum uses "x" for Twitter/X; our app uses "twitter" internally.
const FROM_PFM_PLATFORM: Record<string, string> = { x: "twitter" };

interface PfmListedAccount {
  id: string;
  platform: string;
  external_id: string | null;
}

// List every PfM account tagged with this client's external_id, for one platform.
// Filters locally too, in case PfM ignores the external_id query param.
export async function listPfmAccountsForClient(
  apiKey: string,
  clientId: string,
  platform: string,
): Promise<PfmListedAccount[]> {
  const found: PfmListedAccount[] = [];
  const limit = 50;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), external_id: clientId });
    const res = await fetch(`${PFM_API}/v1/social-accounts?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`PfM list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const batch: PfmListedAccount[] = body.data ?? [];
    found.push(...batch);
    if (!body.meta?.next || batch.length < limit) break;
    offset += limit;
  }
  return found.filter(
    (a) => a.external_id === clientId && (FROM_PFM_PLATFORM[a.platform] ?? a.platform) === platform,
  );
}

export interface PfmDeleteResult {
  attempted: number;
  failed: number;
  failures: string[];
}

// Delete PfM accounts by id. A 404 counts as success (already gone).
export async function deletePfmAccounts(apiKey: string, ids: string[]): Promise<PfmDeleteResult> {
  const result: PfmDeleteResult = { attempted: ids.length, failed: 0, failures: [] };
  for (const id of ids) {
    try {
      const res = await fetch(`${PFM_API}/v1/social-accounts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok || res.status === 404) {
        console.log(`PfM account ${id} deleted (${res.status})`);
      } else {
        const text = await res.text();
        console.warn(`PfM DELETE ${id} returned ${res.status}: ${text.slice(0, 200)}`);
        result.failed++;
        result.failures.push(`${id}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`PfM DELETE ${id} threw:`, err);
      result.failed++;
      result.failures.push(`${id}: network error`);
    }
  }
  return result;
}
