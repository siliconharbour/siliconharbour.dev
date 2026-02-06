import type { Route } from "./+types/jobs.new";
import { Form, Link, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllCompanies } from "~/lib/companies.server";
import { createImportSource, getAllImportSources } from "~/lib/job-importers/sync.server";
import { getImporter, getAvailableSourceTypes } from "~/lib/job-importers";
import { sourceTypeLabels, type JobSourceType } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add Job Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  const [companies, existingSources] = await Promise.all([
    getAllCompanies(true),
    getAllImportSources(),
  ]);
  
  // Get companies that don't already have an import source
  const companiesWithSource = new Set(existingSources.map(s => s.companyId));
  const availableCompanies = companies
    .filter(c => !companiesWithSource.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  const sourceTypes = getAvailableSourceTypes();
  
  return { 
    companies: availableCompanies,
    allCompanies: companies.sort((a, b) => a.name.localeCompare(b.name)),
    sourceTypes,
    sourceTypeLabels,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const companyId = Number(formData.get("companyId"));
  const sourceType = formData.get("sourceType") as JobSourceType;
  const sourceIdentifier = (formData.get("sourceIdentifier") as string)?.trim();
  const sourceUrl = (formData.get("sourceUrl") as string)?.trim() || null;
  
  // Validate required fields
  if (!companyId) {
    return { error: "Please select a company" };
  }
  if (!sourceType) {
    return { error: "Please select a source type" };
  }
  if (!sourceIdentifier) {
    return { error: "Please enter a source identifier" };
  }
  
  // Validate with the importer
  try {
    const importer = getImporter(sourceType);
    const validation = await importer.validateConfig({
      companyId,
      sourceType,
      sourceIdentifier,
      sourceUrl,
    });
    
    if (!validation.valid) {
      return { error: validation.error || "Invalid configuration" };
    }
    
    // Create the source
    const sourceId = await createImportSource({
      companyId,
      sourceType,
      sourceIdentifier,
      sourceUrl,
    });
    
    return redirect(`/manage/import/jobs/${sourceId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default function NewJobImportSource() {
  const { companies, allCompanies, sourceTypes, sourceTypeLabels } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Link
            to="/manage/import/jobs"
            className="text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-harbour-700">Add Job Import Source</h1>
        </div>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="bg-white border border-harbour-200 p-6 flex flex-col gap-4">
          <div>
            <label htmlFor="companyId" className="block text-sm font-medium text-harbour-700 mb-1">
              Company *
            </label>
            {companies.length === 0 ? (
              <div className="text-sm text-harbour-500">
                <p>All companies already have import sources configured.</p>
                <p className="mt-1">
                  <select
                    id="companyId"
                    name="companyId"
                    className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a company...</option>
                    {allCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </p>
              </div>
            ) : (
              <select
                id="companyId"
                name="companyId"
                className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
                required
              >
                <option value="">Select a company...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="sourceType" className="block text-sm font-medium text-harbour-700 mb-1">
              Source Type *
            </label>
            <select
              id="sourceType"
              name="sourceType"
              className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              required
            >
              <option value="">Select a type...</option>
              {sourceTypes.map((type) => (
                <option key={type} value={type}>
                  {sourceTypeLabels[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sourceIdentifier" className="block text-sm font-medium text-harbour-700 mb-1">
              Source Identifier *
            </label>
            <input
              type="text"
              id="sourceIdentifier"
              name="sourceIdentifier"
              className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              placeholder="Board token or org slug"
              required
            />
            <p className="mt-1 text-xs text-harbour-400">
              For Greenhouse: the board token (e.g., "colabsoftware" from job-boards.greenhouse.io/colabsoftware)
              <br />
              For Ashby: the org slug (e.g., "spellbook.legal" from jobs.ashbyhq.com/spellbook.legal)
            </p>
          </div>

          <div>
            <label htmlFor="sourceUrl" className="block text-sm font-medium text-harbour-700 mb-1">
              Careers Page URL (optional)
            </label>
            <input
              type="url"
              id="sourceUrl"
              name="sourceUrl"
              className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
              placeholder="https://example.com/careers"
            />
            <p className="mt-1 text-xs text-harbour-400">
              The company's main careers page URL, for reference.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-harbour-100">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
            >
              {isSubmitting ? "Validating..." : "Add Source"}
            </button>
            <Link
              to="/manage/import/jobs"
              className="px-4 py-2 text-harbour-500 hover:text-harbour-700"
            >
              Cancel
            </Link>
          </div>

          <p className="text-xs text-harbour-400">
            The source will be validated before saving. If valid, jobs will be fetched automatically.
          </p>
        </Form>
      </div>
    </div>
  );
}
