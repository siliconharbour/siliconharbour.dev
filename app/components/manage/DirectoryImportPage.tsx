import { useFetcher } from "react-router";
import { useState, useEffect } from "react";
import type { ScrapedCompany } from "~/lib/scraper.server";
import type { DirectoryImportLoaderData } from "~/lib/directory-import";
import { normalizeUrl } from "~/lib/directory-import";
import { ManagePage } from "~/components/manage/ManagePage";

export interface StatusCategoriesConfig {
  /** Extract a status value from a company (e.g. "Current Company") */
  getValue: (company: ScrapedCompany) => string;
  /** Dropdown options: value is stored, label is displayed */
  options: { value: string; label: string }[];
}

export interface DirectoryImportPageProps {
  sourceKey: string;
  sourceLabel: string;
  description: string;
  loaderData: DirectoryImportLoaderData;
  /** Optional secondary filter dropdown (e.g. Genesis Current/Alumni) */
  statusCategories?: StatusCategoriesConfig;
  /** Show company.description in the card body (Genesis does this) */
  showDescriptionInCard?: boolean;
  /** Max category badges shown per card (default 3) */
  maxCategoryBadges?: number;
  /** Filter categories before displaying as badges */
  categoryFilter?: (categories: string[]) => string[];
}

type FilterKey = "all" | "new" | `not-${string}` | `already-${string}` | "blocked";

export function DirectoryImportPage({
  sourceKey,
  sourceLabel,
  description,
  loaderData,
  statusCategories,
  showDescriptionInCard,
  maxCategoryBadges = 3,
  categoryFilter,
}: DirectoryImportPageProps) {
  const {
    existingNames,
    existingWebsites,
    hasSourceFlagNames,
    hasSourceFlagWebsites,
    blockedIds: initialBlocked,
    existingCompanyData,
  } = loaderData;

  const fetcher = useFetcher();
  const [fetchedCompanies, setFetchedCompanies] = useState<ScrapedCompany[]>(
    [],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadLogos, setDownloadLogos] = useState(true);
  const [blockedSet, setBlockedSet] = useState<Set<string>>(
    new Set(initialBlocked),
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Derived filter keys based on sourceKey
  const notSourceKey: FilterKey = `not-${sourceKey}`;
  const alreadySourceKey: FilterKey = `already-${sourceKey}`;

  const filterButtons: [FilterKey, string][] = [
    ["all", "All"],
    ["new", "New"],
    [notSourceKey, `Not ${sourceLabel}`],
    [alreadySourceKey, `Already ${sourceLabel}`],
    ["blocked", "Blocked"],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetcherData = fetcher.data as any;

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

    // Update local existingCompanyData when a field is adopted so diffs refresh
    if (fetcherData?.intent === "adopt-field" && fetcherData.adopted) {
      const { name, field } = fetcherData.adopted;
      const key = name.toLowerCase();
      if (existingCompanyData[key]) {
        const scraped = fetchedCompanies.find(
          (c) => c.name.toLowerCase() === key,
        );
        if (scraped) {
          const val =
            field === "website"
              ? scraped.website
              : field === "description"
                ? scraped.description
                : field === "email"
                  ? scraped.email
                  : null;
          if (val !== null && val !== undefined) {
            existingCompanyData[key] = {
              ...existingCompanyData[key],
              [field]: val,
            };
          }
        }
      }
    }

    if (fetcherData?.intent === "block" && fetcherData.blocked) {
      setBlockedSet(
        (prev) =>
          new Set([...prev, fetcherData.blocked.externalId.toLowerCase()]),
      );
    }
    if (fetcherData?.intent === "unblock" && fetcherData.unblocked) {
      setBlockedSet((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fetcherData.unblocked.toLowerCase());
        return newSet;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcherData, fetchedCompanies.length]);

  // --- Helper predicates ---

  const isExisting = (company: ScrapedCompany) => {
    if (existingNames.includes(company.name.toLowerCase())) return true;
    if (company.website) {
      if (existingWebsites.includes(normalizeUrl(company.website))) return true;
    }
    return false;
  };

  const alreadyHasFlag = (company: ScrapedCompany) => {
    if (hasSourceFlagNames.includes(company.name.toLowerCase())) return true;
    if (
      company.website &&
      hasSourceFlagWebsites.includes(normalizeUrl(company.website))
    )
      return true;
    return false;
  };

  const getExternalId = (company: ScrapedCompany) => {
    return company.website
      ? normalizeUrl(company.website)
      : company.name.toLowerCase();
  };

  const isBlocked = (company: ScrapedCompany) => {
    return blockedSet.has(getExternalId(company));
  };

  // --- Category logic ---

  const getCompanyCategory = (company: ScrapedCompany): FilterKey => {
    if (isBlocked(company)) return "blocked";
    if (alreadyHasFlag(company)) return alreadySourceKey;
    if (isExisting(company)) return notSourceKey;
    return "new";
  };

  const filteredCompanies = fetchedCompanies.filter((c) => {
    if (filter !== "all" && getCompanyCategory(c) !== filter) return false;
    if (statusCategories && statusFilter !== "all") {
      const val = statusCategories.getValue(c);
      const matchOption = statusCategories.options.find(
        (o) => o.value === statusFilter,
      );
      if (matchOption && val !== matchOption.label) return false;
    }
    return true;
  });

  const categoryCounts: Record<FilterKey, number> = {
    all: fetchedCompanies.length,
    new: fetchedCompanies.filter((c) => getCompanyCategory(c) === "new")
      .length,
    [notSourceKey]: fetchedCompanies.filter(
      (c) => getCompanyCategory(c) === notSourceKey,
    ).length,
    [alreadySourceKey]: fetchedCompanies.filter(
      (c) => getCompanyCategory(c) === alreadySourceKey,
    ).length,
    blocked: fetchedCompanies.filter(
      (c) => getCompanyCategory(c) === "blocked",
    ).length,
  };

  // --- Diff computation ---

  const getDiffs = (company: ScrapedCompany) => {
    const existing =
      existingCompanyData[company.name.toLowerCase()] ||
      (company.website
        ? existingCompanyData[`website:${normalizeUrl(company.website)}`]
        : null);
    if (!existing) return [];
    const diffs: {
      key: string;
      field: string;
      ours: string;
      theirs: string;
      rawValue: string;
    }[] = [];
    if (
      company.website &&
      existing.website &&
      normalizeUrl(company.website) !== normalizeUrl(existing.website)
    ) {
      diffs.push({
        key: "website",
        field: "Website",
        ours: existing.website,
        theirs: company.website,
        rawValue: company.website,
      });
    }
    if (company.website && !existing.website) {
      diffs.push({
        key: "website",
        field: "Website",
        ours: "(none)",
        theirs: company.website,
        rawValue: company.website,
      });
    }
    if (
      company.description &&
      existing.description &&
      company.description.trim() !== existing.description.trim()
    ) {
      const oursShort =
        existing.description.length > 80
          ? existing.description.slice(0, 80) + "..."
          : existing.description;
      const theirsShort =
        company.description.length > 80
          ? company.description.slice(0, 80) + "..."
          : company.description;
      diffs.push({
        key: "description",
        field: "Description",
        ours: oursShort,
        theirs: theirsShort,
        rawValue: company.description,
      });
    }
    if (
      company.email &&
      existing.email &&
      company.email.toLowerCase() !== existing.email.toLowerCase()
    ) {
      diffs.push({
        key: "email",
        field: "Email",
        ours: existing.email,
        theirs: company.email,
        rawValue: company.email,
      });
    }
    if (company.email && !existing.email) {
      diffs.push({
        key: "email",
        field: "Email",
        ours: "(none)",
        theirs: company.email,
        rawValue: company.email,
      });
    }
    return diffs;
  };

  // --- Selection handlers ---

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
    const selectable = filteredCompanies.filter(
      (c) => !alreadyHasFlag(c) && !isBlocked(c),
    );
    setSelected(new Set(selectable.map((c) => c.sourceId)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  // --- Action handlers ---

  const handleBlock = (company: ScrapedCompany) => {
    fetcher.submit(
      {
        intent: "block",
        externalId: getExternalId(company),
        name: company.name,
      },
      { method: "post" },
    );
  };

  const handleUnblock = (company: ScrapedCompany) => {
    fetcher.submit(
      { intent: "unblock", externalId: getExternalId(company) },
      { method: "post" },
    );
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

  const isFetching =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "fetch";
  const isImporting =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";

  return (
    <ManagePage
      title={`Import from ${sourceLabel}`}
      backTo="/manage"
      backLabel="Back to Dashboard"
      maxWidthClassName="max-w-6xl"
    >
      <p className="text-harbour-500">{description}</p>

      {fetchedCompanies.length === 0 && (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="fetch" />
          <button
            type="submit"
            disabled={isFetching}
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
          >
            {isFetching
              ? "Fetching..."
              : `Fetch Companies from ${sourceLabel}`}
          </button>
        </fetcher.Form>
      )}

      {fetcherData?.intent === "fetch" && fetcherData.error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600">
          {fetcherData.error}
        </div>
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
                {fetcherData.errors.map((e: string, i: number) => (
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
              {filterButtons.map(([key, label]) => (
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
                  {label} ({categoryCounts[key] ?? 0})
                </button>
              ))}

              {statusCategories && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 border border-harbour-300 text-xs"
                >
                  <option value="all">All statuses</option>
                  {statusCategories.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Showing {filteredCompanies.length} of{" "}
                {fetchedCompanies.length}
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
              const hasFlag = alreadyHasFlag(company);
              const blocked = isBlocked(company);
              const displayCategories = categoryFilter
                ? categoryFilter(company.categories)
                : company.categories;
              return (
                <div
                  key={company.sourceId}
                  className={`flex items-center gap-4 p-3 border ${
                    blocked
                      ? "bg-red-50 border-red-200 opacity-50"
                      : hasFlag
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
                    disabled={hasFlag || blocked}
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
                      {!blocked && hasFlag && (
                        <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                          Already imported
                        </span>
                      )}
                      {!blocked && existing && !hasFlag && (
                        <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700">
                          Not {sourceLabel}, mark {sourceLabel}
                        </span>
                      )}
                      {statusCategories &&
                        (() => {
                          const val = statusCategories.getValue(company);
                          if (!val) return null;
                          const opt = statusCategories.options.find(
                            (o) => o.label === val,
                          );
                          if (!opt) return null;
                          return (
                            <span
                              className={`text-xs px-2 py-0.5 ${
                                opt.value === "current"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {opt.value === "current" ? "Current" : "Alumni"}
                            </span>
                          );
                        })()}
                    </div>
                    {showDescriptionInCard && company.description && (
                      <p className="text-sm text-harbour-500 truncate">
                        {company.description}
                      </p>
                    )}
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
                    {!blocked &&
                      existing &&
                      !hasFlag &&
                      (() => {
                        const diffs = getDiffs(company);
                        if (diffs.length === 0) return null;
                        return (
                          <div className="mt-2 text-xs border border-harbour-100 divide-y divide-harbour-100">
                            {diffs.map((d) => (
                              <div
                                key={d.key}
                                className="flex items-center gap-2 px-2 py-1"
                              >
                                <span className="text-harbour-400 w-20 shrink-0">
                                  {d.field}
                                </span>
                                <span
                                  className="text-harbour-500 truncate"
                                  title={d.ours}
                                >
                                  {d.ours}
                                </span>
                                <span className="text-harbour-300 shrink-0">
                                  {"\u2192"}
                                </span>
                                <span
                                  className="text-amber-700 truncate flex-1"
                                  title={d.theirs}
                                >
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
                                        companyWebsite: company.website || "",
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

                  {displayCategories.length > 0 && (
                    <div className="hidden sm:flex gap-1 flex-wrap max-w-xs">
                      {displayCategories
                        .slice(0, maxCategoryBadges)
                        .map((cat, i) => (
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
              {isImporting
                ? "Importing..."
                : `Import ${selected.size} Selected Companies`}
            </button>

            {selected.size > 0 && (
              <span className="text-sm text-harbour-500">
                {selected.size} companies selected
              </span>
            )}
          </div>
        </>
      )}
    </ManagePage>
  );
}
