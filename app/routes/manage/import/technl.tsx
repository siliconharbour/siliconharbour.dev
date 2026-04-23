import type { Route } from "./+types/technl";
import { useFetcher, useLoaderData } from "react-router";
import { useState, useEffect } from "react";
import { requireAuth } from "~/lib/session.server";
import { scrapeTechNL, fetchImage, type ScrapedCompany } from "~/lib/scraper.server";
import {
  createCompany,
  updateCompany,
  getAllCompanies,
  getCompanyByName,
  deleteCompany,
} from "~/lib/companies.server";
import { getAllEducation, getEducationByName, deleteEducation } from "~/lib/education.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";
import { getBlockedExternalIds, blockItem, unblockItem } from "~/lib/import-blocklist.server";
import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from TechNL - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  // Get existing companies for duplicate detection
  const existingCompanies = await getAllCompanies(true); // include hidden
  const companyNames = new Set(existingCompanies.map((c) => c.name.toLowerCase()));
  const companyWebsites = new Set(
    existingCompanies.filter((c) => c.website).map((c) => normalizeUrl(c.website!)),
  );
  // Track which companies already have TechNL flag set
  const hasTechNL = new Set(
    existingCompanies.filter((c) => c.technl).map((c) => c.name.toLowerCase()),
  );

  // Get existing education institutions (TechNL lists some educational orgs too)
  const existingEducation = await getAllEducation(true); // include hidden
  const educationNames = new Set(existingEducation.map((e) => e.name.toLowerCase()));
  const educationWithTechNL = new Set(
    existingEducation.filter((e) => e.technl).map((e) => e.name.toLowerCase()),
  );

  // Combine names for "already exists" check
  const existingNames = new Set([...companyNames, ...educationNames]);
  const existingWebsites = companyWebsites; // Only companies have websites typically

  // Combine TechNL flags
  const allTechNL = new Set([...hasTechNL, ...educationWithTechNL]);

  // Get blocked items
  const blockedTechNL = await getBlockedExternalIds("technl");

  // Build a lookup of existing company data for diff display
  const existingCompanyData: Record<
    string,
    { website: string | null; description: string; email: string | null; logo: string | null }
  > = {};
  for (const c of existingCompanies) {
    existingCompanyData[c.name.toLowerCase()] = {
      website: c.website,
      description: c.description,
      email: c.email,
      logo: c.logo,
    };
  }

  return {
    existingNames: Array.from(existingNames),
    existingWebsites: Array.from(existingWebsites),
    hasTechNL: Array.from(allTechNL),
    blockedTechNL: Array.from(blockedTechNL),
    existingCompanyData,
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.replace(/^www\./, "").toLowerCase() +
      parsed.pathname.replace(/\/$/, "").toLowerCase()
    );
  } catch {
    return url.toLowerCase();
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Blocklist actions
  if (intent === "block") {
    const externalId = formData.get("externalId") as string;
    const name = formData.get("name") as string;

    if (externalId && name) {
      // Add to blocklist
      await blockItem("technl", externalId, name);

      // Also delete existing company or learning institution with this name
      const existingCompany = await getCompanyByName(name);
      if (existingCompany) {
        await deleteCompany(existingCompany.id);
      }

      const existingEducation = await getEducationByName(name);
      if (existingEducation) {
        await deleteEducation(existingEducation.id);
      }

      return { intent: "block", blocked: { externalId, name } };
    }
    return { intent: "block", error: "Missing externalId or name" };
  }

  if (intent === "unblock") {
    const externalId = formData.get("externalId") as string;

    if (externalId) {
      await unblockItem("technl", externalId);
      return { intent: "unblock", unblocked: externalId };
    }
    return { intent: "unblock", error: "Missing externalId" };
  }

  if (intent === "adopt-field") {
    const name = formData.get("name") as string;
    const field = formData.get("field") as string;
    const value = formData.get("value") as string;

    if (!name || !field || !value) {
      return { intent: "adopt-field", error: "Missing name, field, or value" };
    }

    const allowedFields = ["website", "description", "email"];
    if (!allowedFields.includes(field)) {
      return { intent: "adopt-field", error: `Field "${field}" is not adoptable` };
    }

    const existing = await getCompanyByName(name);
    if (!existing) {
      return { intent: "adopt-field", error: `Company "${name}" not found` };
    }

    await updateCompany(existing.id, { [field]: value });
    return { intent: "adopt-field", adopted: { name, field } };
  }

  if (intent === "fetch") {
    try {
      const scraped = await scrapeTechNL();
      return { intent: "fetch", companies: scraped, error: null };
    } catch (e) {
      return { intent: "fetch", companies: [], error: String(e) };
    }
  }

  if (intent === "import") {
    const companiesJson = formData.get("companies") as string;
    const downloadLogos = formData.get("downloadLogos") === "true";

    try {
      const companies: ScrapedCompany[] = JSON.parse(companiesJson);
      const imported: string[] = [];
      const errors: string[] = [];

      for (const company of companies) {
        try {
          let logo: string | null = null;

          if (downloadLogos && company.logoUrl) {
            const imageBuffer = await fetchImage(company.logoUrl);
            if (imageBuffer) {
              logo = await processAndSaveIconImageWithPadding(imageBuffer);
            }
          }

          // Check if company already exists
          const existing = await getCompanyByName(company.name);

          if (existing) {
            // Just set the technl flag — don't overwrite curated data
            await updateCompany(existing.id, {
              technl: true,
            });
            imported.push(`${company.name} (marked TechNL)`);
          } else {
            // Create new company (hidden by default, requires review)
            await createCompany({
              name: company.name,
              description: company.description || "",
              website: company.website,
              email: company.email,
              location: null,
              logo,
              technl: true,
              visible: false,
            });
            imported.push(company.name);
          }
        } catch (e) {
          errors.push(`${company.name}: ${String(e)}`);
        }
      }

      return { intent: "import", imported, errors };
    } catch (e) {
      return { intent: "import", imported: [], errors: [String(e)] };
    }
  }

  return null;
}

export default function ImportTechNL() {
  const {
    existingNames,
    existingWebsites,
    hasTechNL,
    blockedTechNL: initialBlocked,
    existingCompanyData,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [fetchedCompanies, setFetchedCompanies] = useState<ScrapedCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadLogos, setDownloadLogos] = useState(true);
  const [blockedTechNL, setBlockedTechNL] = useState<Set<string>>(new Set(initialBlocked));
  const [filter, setFilter] = useState<"all" | "new" | "not-technl" | "already-technl" | "blocked">(
    "all",
  );

  const fetcherData = fetcher.data;

  useEffect(() => {
    if (
      fetcherData?.intent === "fetch" &&
      fetcherData.companies &&
      fetcherData.companies.length > 0
    ) {
      if (fetchedCompanies.length === 0) {
        setFetchedCompanies(fetcherData.companies);
      }
    }

    // Handle block/unblock responses
    // Update local existingCompanyData when a field is adopted so diffs refresh
    if (fetcherData?.intent === "adopt-field" && fetcherData.adopted) {
      const { name, field } = fetcherData.adopted;
      const key = name.toLowerCase();
      if (existingCompanyData[key]) {
        const scraped = fetchedCompanies.find((c) => c.name.toLowerCase() === key);
        if (scraped) {
          const val =
            field === "website" ? scraped.website :
            field === "description" ? scraped.description :
            field === "email" ? scraped.email : null;
          if (val !== null && val !== undefined) {
            existingCompanyData[key] = { ...existingCompanyData[key], [field]: val };
          }
        }
      }
    }

    if (fetcherData?.intent === "block" && fetcherData.blocked) {
      setBlockedTechNL((prev) => new Set([...prev, fetcherData.blocked.externalId.toLowerCase()]));
    }
    if (fetcherData?.intent === "unblock" && fetcherData.unblocked) {
      setBlockedTechNL((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fetcherData.unblocked.toLowerCase());
        return newSet;
      });
    }
  }, [fetcherData, fetchedCompanies.length]);

  const isExisting = (company: ScrapedCompany) => {
    const nameLower = company.name.toLowerCase();
    if (existingNames.includes(nameLower)) return true;
    if (company.website) {
      const normalized = normalizeUrl(company.website);
      if (existingWebsites.includes(normalized)) return true;
    }
    return false;
  };

  const alreadyHasTechNL = (company: ScrapedCompany) => {
    return hasTechNL.includes(company.name.toLowerCase());
  };

  const getExternalId = (company: ScrapedCompany) => {
    // Use normalized website URL, or lowercase name if no website
    // This must match the normalization used everywhere else
    return company.website ? normalizeUrl(company.website) : company.name.toLowerCase();
  };

  const isBlocked = (company: ScrapedCompany) => {
    return blockedTechNL.has(getExternalId(company));
  };

  const handleBlock = (company: ScrapedCompany) => {
    fetcher.submit(
      { intent: "block", externalId: getExternalId(company), name: company.name },
      { method: "post" },
    );
  };

  const handleUnblock = (company: ScrapedCompany) => {
    fetcher.submit({ intent: "unblock", externalId: getExternalId(company) }, { method: "post" });
  };

  const toggleSelect = (sourceId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    const selectable = fetchedCompanies.filter((c) => !alreadyHasTechNL(c) && !isBlocked(c));
    setSelected(new Set(selectable.map((c) => c.sourceId)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleImport = () => {
    const toImport = fetchedCompanies.filter((c) => selected.has(c.sourceId));
    fetcher.submit(
      {
        intent: "import",
        companies: JSON.stringify(toImport),
        downloadLogos: String(downloadLogos),
      },
      { method: "post" },
    );
  };

  const getCompanyCategory = (company: ScrapedCompany) => {
    if (isBlocked(company)) return "blocked" as const;
    if (alreadyHasTechNL(company)) return "already-technl" as const;
    if (isExisting(company)) return "not-technl" as const;
    return "new" as const;
  };

  const filteredCompanies = fetchedCompanies.filter((c) => {
    if (filter === "all") return true;
    return getCompanyCategory(c) === filter;
  });

  const categoryCounts = {
    all: fetchedCompanies.length,
    new: fetchedCompanies.filter((c) => getCompanyCategory(c) === "new").length,
    "not-technl": fetchedCompanies.filter((c) => getCompanyCategory(c) === "not-technl").length,
    "already-technl": fetchedCompanies.filter((c) => getCompanyCategory(c) === "already-technl")
      .length,
    blocked: fetchedCompanies.filter((c) => getCompanyCategory(c) === "blocked").length,
  };

  const getDiffs = (company: ScrapedCompany) => {
    const existing = existingCompanyData[company.name.toLowerCase()];
    if (!existing) return [];
    const diffs: { key: string; field: string; ours: string; theirs: string; rawValue: string }[] = [];
    if (company.website && existing.website && normalizeUrl(company.website) !== normalizeUrl(existing.website)) {
      diffs.push({ key: "website", field: "Website", ours: existing.website, theirs: company.website, rawValue: company.website });
    }
    if (company.website && !existing.website) {
      diffs.push({ key: "website", field: "Website", ours: "(none)", theirs: company.website, rawValue: company.website });
    }
    if (company.description && existing.description && company.description.trim() !== existing.description.trim()) {
      const oursShort = existing.description.length > 80 ? existing.description.slice(0, 80) + "..." : existing.description;
      const theirsShort = company.description.length > 80 ? company.description.slice(0, 80) + "..." : company.description;
      diffs.push({ key: "description", field: "Description", ours: oursShort, theirs: theirsShort, rawValue: company.description });
    }
    if (company.email && existing.email && company.email.toLowerCase() !== existing.email.toLowerCase()) {
      diffs.push({ key: "email", field: "Email", ours: existing.email, theirs: company.email, rawValue: company.email });
    }
    if (company.email && !existing.email) {
      diffs.push({ key: "email", field: "Email", ours: "(none)", theirs: company.email, rawValue: company.email });
    }
    return diffs;
  };

  const isFetching = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "fetch";
  const isImporting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";

  return (
    <ManagePage
      title="Import from TechNL"
      backTo="/manage"
      backLabel="Back to Dashboard"
      maxWidthClassName="max-w-6xl"
    >
      <p className="text-harbour-500">
        Import company data from the TechNL member directory. Companies will be flagged as TechNL
        members with a dedicated link to their directory listing.
      </p>

      {fetchedCompanies.length === 0 && (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="fetch" />
          <button
            type="submit"
            disabled={isFetching}
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
          >
            {isFetching ? "Fetching..." : "Fetch Companies from TechNL"}
          </button>
        </fetcher.Form>
      )}

      {fetcherData?.intent === "fetch" && fetcherData.error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600">{fetcherData.error}</div>
      )}

      {fetcherData?.intent === "import" && (
        <div className="flex flex-col gap-2">
          {fetcherData.imported && fetcherData.imported.length > 0 && (
            <div className="p-4 bg-green-50 border border-green-200 text-green-700">
              Successfully imported {fetcherData.imported.length} companies
            </div>
          )}
          {fetcherData.errors && fetcherData.errors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600">
              <p className="font-medium">Errors:</p>
              <ul className="list-disc list-inside mt-2">
                {fetcherData.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {fetchedCompanies.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ["all", "All"],
                  ["new", "New"],
                  ["not-technl", "Not TechNL"],
                  ["already-technl", "Already TechNL"],
                  ["blocked", "Blocked"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`text-xs px-2.5 py-1 border transition-colors ${
                    filter === key
                      ? "bg-harbour-600 text-white border-harbour-600"
                      : "bg-white text-harbour-600 border-harbour-200 hover:border-harbour-400"
                  }`}
                >
                  {label} ({categoryCounts[key]})
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Showing {filteredCompanies.length} of {fetchedCompanies.length}
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-harbour-600 hover:text-harbour-800 underline"
              >
                Select all new
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="text-sm text-harbour-600 hover:text-harbour-800 underline"
              >
                Select none
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={downloadLogos}
                  onChange={(e) => setDownloadLogos(e.target.checked)}
                  className="border border-harbour-300"
                />
                Download logos
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {filteredCompanies.map((company) => {
              const existing = isExisting(company);
              const hasTechNLFlag = alreadyHasTechNL(company);
              const blocked = isBlocked(company);
              return (
                <div
                  key={company.sourceId}
                  className={`flex items-center gap-4 p-3 border ${
                    blocked
                      ? "bg-red-50 border-red-200 opacity-50"
                      : hasTechNLFlag
                        ? "bg-harbour-50 border-harbour-200 opacity-60"
                        : selected.has(company.sourceId)
                          ? "bg-blue-50 border-blue-300"
                          : existing
                            ? "bg-amber-50 border-amber-200"
                            : "bg-white border-harbour-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(company.sourceId)}
                    onChange={() => toggleSelect(company.sourceId)}
                    disabled={hasTechNLFlag || blocked}
                    className="w-5 h-5"
                  />

                  {company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt=""
                      className={`w-10 h-10 object-contain bg-white border border-harbour-100 ${blocked ? "grayscale" : ""}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-harbour-100" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-medium truncate ${blocked ? "line-through text-harbour-400" : ""}`}
                      >
                        {company.name}
                      </span>
                      {blocked && (
                        <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700">
                          Import blocked
                        </span>
                      )}
                      {!blocked && hasTechNLFlag && (
                        <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                          Already imported
                        </span>
                      )}
                      {!blocked && existing && !hasTechNLFlag && (
                        <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700">
                          Not TechNL, mark TechNL
                        </span>
                      )}
                    </div>
                    {company.website && (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-harbour-400 hover:text-harbour-600 truncate block"
                      >
                        {company.website}
                      </a>
                    )}
                    {!blocked && existing && !hasTechNLFlag && (() => {
                      const diffs = getDiffs(company);
                      if (diffs.length === 0) return null;
                      return (
                        <div className="mt-2 text-xs border border-harbour-100 divide-y divide-harbour-100">
                          {diffs.map((d) => (
                            <div key={d.key} className="flex items-center gap-2 px-2 py-1">
                              <span className="text-harbour-400 w-20 shrink-0">{d.field}</span>
                              <span className="text-harbour-500 truncate" title={d.ours}>
                                {d.ours}
                              </span>
                              <span className="text-harbour-300 shrink-0">{"\u2192"}</span>
                              <span className="text-amber-700 truncate flex-1" title={d.theirs}>
                                {d.theirs}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  fetcher.submit(
                                    {
                                      intent: "adopt-field",
                                      name: company.name,
                                      field: d.key,
                                      value: d.rawValue,
                                    },
                                    { method: "post" },
                                  )
                                }
                                className="shrink-0 px-1.5 py-0.5 text-xs border border-harbour-200 text-harbour-500 hover:text-harbour-700 hover:border-harbour-400 transition-colors"
                              >
                                Use this
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {company.categories.length > 0 && (
                    <div className="hidden sm:flex gap-1 flex-wrap max-w-xs">
                      {company.categories.slice(0, 3).map((cat, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-harbour-100 text-harbour-600"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {blocked ? (
                    <button
                      type="button"
                      onClick={() => handleUnblock(company)}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                    >
                      Remove block
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBlock(company)}
                      className="text-xs px-2 py-1 text-harbour-500 hover:bg-harbour-100 transition-colors"
                    >
                      Import block
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0 || isImporting}
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
            >
              {isImporting ? "Importing..." : `Import ${selected.size} Selected Companies`}
            </button>

            {selected.size > 0 && (
              <span className="text-sm text-harbour-500">{selected.size} companies selected</span>
            )}
          </div>
        </>
      )}
    </ManagePage>
  );
}
