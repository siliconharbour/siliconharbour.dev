import type { Route } from "./+types/technl";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "~/lib/session.server";
import { scrapeTechNL, fetchImage, type ScrapedCompany } from "~/lib/scraper.server";
import { createCompany, updateCompany, getAllCompanies, getCompanyByName } from "~/lib/companies.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import from TechNL - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  // Get existing companies for duplicate detection
  const existingCompanies = await getAllCompanies();
  const existingNames = new Set(existingCompanies.map(c => c.name.toLowerCase()));
  const existingWebsites = new Set(
    existingCompanies
      .filter(c => c.website)
      .map(c => normalizeUrl(c.website!))
  );
  // Track which companies already have TechNL links (already imported)
  const hasTechNLLink = new Set(
    existingCompanies
      .filter(c => c.description.includes("members.technl.ca"))
      .map(c => c.name.toLowerCase())
  );
  
  return { 
    existingNames: Array.from(existingNames), 
    existingWebsites: Array.from(existingWebsites),
    hasTechNLLink: Array.from(hasTechNLLink),
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove www, trailing slashes, lowercase
    return parsed.hostname.replace(/^www\./, "").toLowerCase() + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

function getTechNLSearchUrl(companyName: string): string {
  const encoded = encodeURIComponent(companyName).replace(/%20/g, "+");
  return `https://members.technl.ca/memberdirectory/Find?term=${encoded}`;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "fetch") {
    // Fetch companies from TechNL
    try {
      const scraped = await scrapeTechNL();
      return { intent: "fetch", companies: scraped, error: null };
    } catch (e) {
      return { intent: "fetch", companies: [], error: String(e) };
    }
  }
  
  if (intent === "import") {
    // Import selected companies
    const companiesJson = formData.get("companies") as string;
    const downloadLogos = formData.get("downloadLogos") === "true";
    
    try {
      const companies: ScrapedCompany[] = JSON.parse(companiesJson);
      const imported: string[] = [];
      const errors: string[] = [];
      
      for (const company of companies) {
        try {
          let logo: string | null = null;
          
          // Download and save logo if requested
          if (downloadLogos && company.logoUrl) {
            const imageBuffer = await fetchImage(company.logoUrl);
            if (imageBuffer) {
              logo = await processAndSaveIconImageWithPadding(imageBuffer);
            }
          }
          
          // Build TechNL link
          const technlUrl = getTechNLSearchUrl(company.name);
          const technlLink = `[View in the TechNL Directory](${technlUrl})`;
          
          // Check if company already exists (e.g., imported from Genesis)
          const existing = await getCompanyByName(company.name);
          
          if (existing) {
            // Merge: append TechNL link to existing description if not already there
            let newDescription = existing.description;
            if (!newDescription.includes("members.technl.ca")) {
              newDescription = newDescription + "\n\n" + technlLink;
            }
            
            // Update with TechNL data, but don't overwrite existing values
            await updateCompany(existing.id, {
              description: newDescription,
              website: existing.website || company.website,
              logo: existing.logo || logo,
            });
            
            imported.push(`${company.name} (merged)`);
          } else {
            // Create new company with TechNL link
            const description = company.description || technlLink;
            
            await createCompany({
              name: company.name,
              description,
              website: company.website,
              email: company.email,
              location: null,
              logo,
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
  const { existingNames, existingWebsites, hasTechNLLink } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const [fetchedCompanies, setFetchedCompanies] = useState<ScrapedCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadLogos, setDownloadLogos] = useState(true);
  
  // Handle fetcher response
  const fetcherData = fetcher.data;
  if (fetcherData?.intent === "fetch" && fetcherData.companies && fetcherData.companies.length > 0) {
    if (fetchedCompanies.length === 0) {
      setFetchedCompanies(fetcherData.companies);
    }
  }
  
  // Check if company exists in our database
  const isExisting = (company: ScrapedCompany) => {
    const nameLower = company.name.toLowerCase();
    if (existingNames.includes(nameLower)) return true;
    if (company.website) {
      const normalized = normalizeUrl(company.website);
      if (existingWebsites.includes(normalized)) return true;
    }
    return false;
  };
  
  // Check if already has TechNL link (already imported from TechNL)
  const alreadyHasTechNL = (company: ScrapedCompany) => {
    return hasTechNLLink.includes(company.name.toLowerCase());
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
    // Select all that don't already have TechNL link
    const selectable = fetchedCompanies.filter(c => !alreadyHasTechNL(c));
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
          <h1 className="text-2xl font-semibold text-harbour-700">Import from TechNL</h1>
        </div>
        
        <p className="text-harbour-500">
          Import company data from the TechNL member directory. This is a one-time import - 
          data will be copied into your site with no ongoing connection to TechNL.
        </p>
        
        {/* Fetch button */}
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
        
        {/* Error display */}
        {fetcherData?.intent === "fetch" && fetcherData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {fetcherData.error}
          </div>
        )}
        
        {/* Import results */}
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
        
        {/* Companies list */}
        {fetchedCompanies.length > 0 && (
          <>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-harbour-500">
                Found {fetchedCompanies.length} companies
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
                  className="rounded"
                />
                Download logos
              </label>
            </div>
            
            <div className="flex flex-col gap-2">
              {fetchedCompanies.map((company) => {
                const existing = isExisting(company);
                const hasTechNL = alreadyHasTechNL(company);
                return (
                  <div
                    key={company.sourceId}
                    className={`flex items-center gap-4 p-3 border ${
                      hasTechNL 
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
                      disabled={hasTechNL}
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
                        {hasTechNL && (
                          <span className="text-xs px-2 py-0.5 bg-harbour-200 text-harbour-600">
                            Already imported
                          </span>
                        )}
                        {existing && !hasTechNL && (
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700">
                            Will merge
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
