export const VERAFIN_BROWSER_SCRIPT = String.raw`(async () => {
  const q = new URL(location.href).searchParams.get("q") ?? "";
  const m = location.pathname.match(/^\/([^/]+)(?:\/|$)/);
  if (!m) throw new Error("Could not infer Workday site from URL path.");

  const site = m[1];
  const company = location.hostname.split(".")[0];
  const base = location.origin;
  const apiBase = base + "/wday/cxs/" + company + "/" + site;
  const headers = { "Accept": "application/json", "Content-Type": "application/json" };

  const list = [];
  let offset = 0;
  const limit = 20;

  while (true) {
    const res = await fetch(apiBase + "/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: q }),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Workday list fetch failed: " + res.status + " " + res.statusText);

    const data = await res.json();
    const postings = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
    if (postings.length === 0) break;
    list.push(...postings);
    offset += postings.length;
    if (offset >= (Number(data?.total) || 0)) break;
  }

  const jobs = [];
  for (const posting of list) {
    const fallbackId = String(posting.externalPath ?? posting.title ?? "").trim();
    const fromPath = String(posting.externalPath ?? "").match(/_([A-Z0-9-]+(?:-\d+)?)$/i);
    const defaultJob = {
      externalId: fromPath?.[1] || fallbackId,
      title: String(posting.title ?? "").trim(),
      location: String(posting.locationsText ?? "").trim() || undefined,
      url: base + "/" + site + String(posting.externalPath ?? ""),
    };

    try {
      const dRes = await fetch(apiBase + String(posting.externalPath ?? ""), {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!dRes.ok) {
        jobs.push(defaultJob);
        continue;
      }

      const detail = await dRes.json();
      const info = detail?.jobPostingInfo ?? {};
      jobs.push({
        externalId: String(info.jobReqId || info.id || defaultJob.externalId).trim(),
        title: String(info.title || defaultJob.title).trim(),
        location: info.location ? String(info.location).trim() : defaultJob.location,
        descriptionHtml: typeof info.jobDescription === "string" ? info.jobDescription : undefined,
        descriptionText: undefined,
        url: String(info.externalUrl || defaultJob.url).trim(),
        postedAt: typeof info.startDate === "string" ? info.startDate : undefined,
      });
    } catch {
      jobs.push(defaultJob);
    }
  }

  const output = JSON.stringify(jobs, null, 2);
  console.log(output);
  if (typeof copy === "function") copy(output);
})();`;
