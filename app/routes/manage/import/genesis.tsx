import type { Route } from "./+types/genesis";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "~/lib/session.server";
import { scrapeGenesis, fetchImage, type ScrapedCompany } from "~/lib/scraper.server";
import { createCompany, updateCompany, getAllCompanies, getCompanyByName } from "~/lib/companies.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from Genesis Centre - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  const existingCompanies = await getAllCompanies();
  const existingNames = new Set(existingCompanies.map(c => c.name.toLowerCase()));
  const existingWebsites = new Set(
    existingCompanies
      .filter(c => c.website)
      .map(c => normalizeUrl(c.website!))
  );
  // Track which companies already have Genesis flag set
  const hasGenesis = new Set(
    existingCompanies
      .filter(c => c.genesis)
      .map(c => c.name.toLowerCase())
  );
  
  return { 
    existingNames: Array.from(existingNames), 
    existingWebsites: Array.from(existingWebsites),
    hasGenesis: Array.from(hasGenesis),
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase() + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "fetch") {
    try {
      const scraped = await scrapeGenesis();
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
            // Update: set genesis flag, fill in missing data
            await updateCompany(existing.id, {
              genesis: true,
              website: existing.website || company.website,
              location: existing.location || "St. John's, NL",
              logo: existing.logo || logo,
              // Update description if we have one and existing is empty
              description: existing.description || company.description || "",
            });
            imported.push(`${company.name} (updated)`);
          } else {
            // Create new company
            await createCompany({
              name: company.name,
              description: company.description || "",
              website: company.website,
              email: company.email,
              location: "St. John's, NL",
              logo,
              genesis: true,
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

export default function ImportGenesis() {
  const { existingNames, existingWebsites, hasGenesis } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const [fetchedCompanies, setFetchedCompanies] = useState<ScrapedCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadLogos, setDownloadLogos] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const fetcherData = fetcher.data;
  if (fetcherData?.intent === "fetch" && fetcherData.companies && fetcherData.companies.length > 0) {
    if (fetchedCompanies.length === 0) {
      setFetchedCompanies(fetcherData.companies);
    }
  }
  
  const isExisting = (company: ScrapedCompany) => {
    const nameLower = company.name.toLowerCase();
    if (existingNames.includes(nameLower)) return true;
    if (company.website) {
      const normalized = normalizeUrl(company.website);
      if (existingWebsites.includes(normalized)) return true;
    }
    return false;
  };
  
  const alreadyHasGenesis = (company: ScrapedCompany) => {
    return hasGenesis.includes(company.name.toLowerCase());
  };
  
  const getStatus = (company: ScrapedCompany) => {
    return company.categories.find(c => c === "Current Company" || c === "Alumni Company") || "";
  };
  
  const filteredCompanies = fetchedCompanies.filter(c => {
    if (filterStatus === "all") return true;
    if (filterStatus === "current") return getStatus(c) === "Current Company";
    if (filterStatus === "alumni") return getStatus(c) === "Alumni Company";
    return true;
  });
  
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
    const selectable = filteredCompanies.filter(c => !alreadyHasGenesis(c));
    setSelected(new Set(selectable.map(c => c.sourceId)));
  };
  
  const selectNone = () => {
    setSelected(new Set());
  };
  
  const handleImport = () => {
    const toImport = fetchedCompanies.filter(c => selected.has(c.sourceId));
    fetcher.submit(
      { 
        intent: "import", 
        companies: JSON.stringify(toImport),
        downloadLogos: String(downloadLogos)
      },
      { method: "post" }
    );
  };
  
  const isFetching = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "fetch";
  const isImporting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "import";
  
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
        
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Import from Genesis Centre</h1>
        </div>
        
        <p className="text-harbour-500">
          Import company data from the Genesis Centre startup portfolio. Companies will be flagged 
          as Genesis Centre members with a dedicated link to the portfolio.
        </p>
        
        {fetchedCompanies.length === 0 && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="fetch" />
            <button
              type="submit"
              disabled={isFetching}
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
            >
              {isFetching ? "Fetching..." : "Fetch Companies from Genesis Centre"}
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
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Found {fetchedCompanies.length} companies
              </span>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2 py-1 border border-harbour-300 text-sm"
              >
                <option value="all">All ({fetchedCompanies.length})</option>
                <option value="current">
                  Current ({fetchedCompanies.filter(c => getStatus(c) === "Current Company").length})
                </option>
                <option value="alumni">
                  Alumni ({fetchedCompanies.filter(c => getStatus(c) === "Alumni Company").length})
                </option>
              </select>
              
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
                  className="rounded"
                />
                Download logos
              </label>
            </div>
            
            <div className="flex flex-col gap-2">
              {filteredCompanies.map((company) => {
                const existing = isExisting(company);
                const hasGenesisFlag = alreadyHasGenesis(company);
                const status = getStatus(company);
                return (
                  <div
                    key={company.sourceId}
                    className={`flex items-center gap-4 p-3 border ${
                      hasGenesisFlag 
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
                      disabled={hasGenesisFlag}
                      className="w-5 h-5"
                    />
                    
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt=""
                        className="w-10 h-10 object-contain bg-white border border-harbour-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-harbour-100" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{company.name}</span>
                        {hasGenesisFlag && (
                          <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                            Already imported
                          </span>
                        )}
                        {existing && !hasGenesisFlag && (
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700">
                            Will update
                          </span>
                        )}
                        {status && (
                          <span className={`text-xs px-2 py-0.5 ${
                            status === "Current Company" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {status === "Current Company" ? "Current" : "Alumni"}
                          </span>
                        )}
                      </div>
                      {company.description && (
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
                    </div>
                    
                    {company.categories.filter(c => c !== "Current Company" && c !== "Alumni Company").length > 0 && (
                      <div className="hidden sm:flex gap-1 flex-wrap max-w-xs">
                        {company.categories
                          .filter(c => c !== "Current Company" && c !== "Alumni Company")
                          .slice(0, 2)
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
                  : `Import ${selected.size} Selected Companies`
                }
              </button>
              
              {selected.size > 0 && (
                <span className="text-sm text-harbour-500">
                  {selected.size} companies selected
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
