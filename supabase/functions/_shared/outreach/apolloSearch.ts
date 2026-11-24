// Apollo company search (POST /mixed_companies/search), shared by discovery and
// the keyword probe. Costs 1 Apollo credit per page regardless of per_page.
import { normalizeGeographyForApollo } from "./discoveryRotation.ts";

const APOLLO_API = "https://api.apollo.io/api/v1";

export interface FoundCompany {
  name: string;
  website_url: string;
  city?: string;
  business_type?: string;
  why_fit?: string;
  /** Which Apollo search surfaced this company, so replies/clicks can be traced back to a keyword. */
  found_by?: { key: string; label: string };
}

// "10-200 employees" / "10 to 200" -> "10,200" (Apollo's range format).
// Returns undefined for "any" or anything unparseable -- an omitted filter
// searches all sizes, which is the safer default over guessing wrong.
export function parseEmployeeRange(companySize?: string): string | undefined {
  if (!companySize) return undefined;
  const nums = companySize.match(/\d+/g);
  if (!nums || nums.length < 2) return undefined;
  return `${nums[0]},${nums[1]}`;
}

export async function apolloSearchCompanies(
  apolloKey: string,
  keywords: string[],
  icp: { company_size?: string },
  geography: string,
  maxResults: number,
  focus?: string,
  page = 1,
  excludeDomains: string[] = [],
): Promise<FoundCompany[]> {
  // Apollo's docs list q_not_organization_keyword_tags, organization_not_locations
  // and not_organization_websites_list as exclusion filters. Only the last is used
  // here: it skips companies this client already has, so each page costs a credit
  // for companies that can actually become leads. ICP disqualifiers are still
  // applied downstream in scoreProspectFit once a prospect has real context to
  // judge against (this search response only returns name + domain).
  const body: Record<string, unknown> = {
    q_organization_keyword_tags: focus?.trim() ? [...keywords, focus.trim()] : keywords,
    // Over-fetch: results on known non-prospect domains are dropped afterwards.
    per_page: Math.min(maxResults * 2, 100),
    page,
  };
  const location = /global|worldwide/i.test(geography) ? "" : normalizeGeographyForApollo(geography);
  if (location) body.organization_locations = [location];
  const employeeRange = parseEmployeeRange(icp.company_size);
  if (employeeRange) body.organization_num_employees_ranges = [employeeRange];

  const call = (b: Record<string, unknown>) =>
    fetch(`${APOLLO_API}/mixed_companies/search`, {
      method: "POST",
      headers: { "x-api-key": apolloKey, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });

  let res: Response;
  if (excludeDomains.length > 0) {
    res = await call({ ...body, not_organization_websites_list: excludeDomains });
    // The exclusion list is an optimisation: if Apollo rejects it (size limit, format),
    // search without it rather than lose the run. Auth/plan/rate errors are not retried.
    if ([400, 413, 422].includes(res.status)) {
      console.warn(`Apollo rejected not_organization_websites_list (${res.status}, ${excludeDomains.length} domains); retrying without it`);
      await res.body?.cancel().catch(() => {});
      res = await call(body);
    }
  } else {
    res = await call(body);
  }

  if (!res.ok) {
    throw new Error(`Apollo organization search failed (${res.status}: ${(await res.text()).slice(0, 300)})`);
  }

  const data = await res.json();
  const orgs: any[] = data?.organizations ?? [];
  // Apollo's search response doesn't include city/industry/employee-count
  // fields (those need a separate per-org enrichment call) -- leave city and
  // business_type unset rather than fabricate them.
  return orgs
    .map((o) => ({
      name: o.name as string,
      website_url: (o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : "")) as string,
    }))
    .filter((c) => c.name && c.website_url);
}
