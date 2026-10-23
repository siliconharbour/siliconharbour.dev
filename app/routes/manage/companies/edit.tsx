import {
  loadAllAdminItems,
  loadAdminOperation,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/edit";
import { useState } from "react";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";
import { TechnologySelect } from "~/components/TechnologySelect";
import { BaseMultiSelect } from "~/components/BaseMultiSelect";

import {
  getTechnologyProvenanceSourceByKey,
  inferTechnologyProvenanceSourceKey,
  technologyProvenanceSourceOptions,
  type TechnologyProvenanceSourceKey,
} from "~/lib/technology-evidence";

interface CompanyTechnologyProvenance {
  technologyId: number;
  technologyName: string;
  evidence: Array<{
    sourceType: "job_posting" | "survey" | "manual";
    sourceUrl: string | null;
    lastVerified: string | null;
    excerptText: string | null;
    jobId: number | null;
  }>;
}

interface CompanyJobOption {
  id: number;
  title: string;
  status: string;
}

interface ProvenanceGroup {
  id: string;
  sourceKey: TechnologyProvenanceSourceKey;
  sourceUrl: string;
  lastVerified: string;
  excerptText: string;
  jobIds: number[];
  technologyIds: number[];
}

function toMonthInputValue(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return "";
}

function buildInitialProvenanceGroups(
  companyTechnologies: CompanyTechnologyProvenance[],
): ProvenanceGroup[] {
  const byProvenance = new Map<TechnologyProvenanceSourceKey, ProvenanceGroup>(
    technologyProvenanceSourceOptions.map((option) => [
      option.key,
      {
        id: `existing-${option.key}`,
        sourceKey: option.key,
        sourceUrl: "",
        lastVerified: "",
        excerptText: "",
        jobIds: [],
        technologyIds: [],
      },
    ]),
  );

  for (const item of companyTechnologies) {
    const evidenceWithKey = item.evidence.map((evidence) => ({
      evidence,
      sourceKey: inferTechnologyProvenanceSourceKey(evidence.sourceType),
    }));
    const preferredSourceKey = evidenceWithKey.some((entry) => entry.sourceKey === "job_postings")
      ? "job_postings"
      : "get_coding_reference";
    const group = byProvenance.get(preferredSourceKey)!;
    if (!group.technologyIds.includes(item.technologyId)) {
      group.technologyIds.push(item.technologyId);
    }

    const relevantEvidence = evidenceWithKey.filter(
      (entry) => entry.sourceKey === preferredSourceKey,
    );
    for (const { evidence } of relevantEvidence) {
      if (evidence.jobId && !group.jobIds.includes(evidence.jobId)) {
        group.jobIds.push(evidence.jobId);
      }
      if (!group.excerptText && evidence.excerptText) {
        group.excerptText = evidence.excerptText;
      }
      if (!group.sourceUrl && evidence.sourceUrl) {
        group.sourceUrl = evidence.sourceUrl;
      }
      if (!group.lastVerified && evidence.lastVerified) {
        group.lastVerified = toMonthInputValue(evidence.lastVerified);
      }
    }
  }

  return technologyProvenanceSourceOptions.map((option) => byProvenance.get(option.key)!);
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.company?.name || "Company"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid company ID", { status: 400 });
  }

  const company = await loadAdminOperation(request, operationCatalog.companyGet, { id });

  const allTechnologies = await loadAllAdminItems(request, operationCatalog.technologyList, {
    sort: "name",
    order: "asc",
  });
  const { technologies: companyTechnologies, companyJobs, jobPostingEvidenceRows } = company;

  return {
    company,
    allTechnologies,
    companyJobs,
    selectedTechnologyIds: companyTechnologies.map((t) => t.technologyId),
    companyTechnologies: companyTechnologies.map((t) => ({
      technologyId: t.technologyId,
      technologyName: t.technology.name,
      evidence: t.evidence.map((evidence) => ({
        sourceType: evidence.sourceType,
        sourceUrl: evidence.sourceUrl,
        lastVerified: evidence.lastVerified,
        excerptText: evidence.excerptText,
        jobId: evidence.jobId,
      })),
    })),
    jobPostingEvidenceRows,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") === "import-block") {
    const result = await runAdminOperation(request, operationCatalog.companyDelete, {
      id: Number(params.id),
      confirm: true,
      block: { source: form.get("source") || "technl" },
    });
    return result.ok ? redirect("/manage/companies") : { error: result.error };
  }
  if (form.get("intent") === "convertToEducation") {
    const result = await runAdminOperation(request, operationCatalog.companyConvertToEducation, {
      id: Number(params.id),
      institutionType: form.get("institutionType") || "other",
      confirm: true,
    });
    return result.ok ? redirect(`/manage/education/${result.data.id}`) : { error: result.error };
  }
  const result = await runAdminOperation(request, operationCatalog.companyUpdate, {
    id: Number(params.id),
    ...directoryFormInput("company", form, true),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/companies");
}

export default function EditCompany() {
  const {
    company,
    allTechnologies,
    companyJobs,
    selectedTechnologyIds,
    companyTechnologies,
    jobPostingEvidenceRows,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [provenanceGroups, setProvenanceGroups] = useState<ProvenanceGroup[]>(() =>
    buildInitialProvenanceGroups(companyTechnologies),
  );
  const assignedTechnologies = [...companyTechnologies].sort((a, b) =>
    a.technologyName.localeCompare(b.technologyName),
  );

  const updateGroupField = (
    groupId: string,
    field: "sourceUrl" | "lastVerified" | "excerptText",
    value: string,
  ) => {
    setProvenanceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, [field]: value } : group)),
    );
  };

  const setGroupJobs = (groupId: string, nextJobIds: number[]) => {
    const uniqueJobIds = Array.from(new Set(nextJobIds));
    setProvenanceGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, jobIds: uniqueJobIds } : group)),
    );
  };

  const setGroupTechnologies = (groupId: string, nextTechnologyIds: number[]) => {
    const uniqueTechnologyIds = Array.from(new Set(nextTechnologyIds));
    const selectedForGroup = new Set(uniqueTechnologyIds);

    setProvenanceGroups((current) =>
      current.map((group) => {
        if (group.id === groupId) {
          return { ...group, technologyIds: uniqueTechnologyIds };
        }
        const overlappingIds = group.technologyIds.filter((id) => selectedForGroup.has(id));
        if (overlappingIds.length > 0) {
          return {
            ...group,
            technologyIds: group.technologyIds.filter((id) => !selectedForGroup.has(id)),
          };
        }
        return group;
      }),
    );
  };

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/companies" className="text-sm text-subtle hover:text-body">
            &larr; Back to Companies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Company</h1>

        {actionData?.error && (
          <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="flex flex-col gap-gap-6">
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="name" className="font-medium text-heading">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={company.name}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="description" className="font-medium text-heading">
              Description (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={company.description ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="email" className="font-medium text-heading">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              defaultValue={company.email || ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="careersUrl" className="font-medium text-heading">
              Careers URL
            </label>
            <input
              type="url"
              id="careersUrl"
              name="careersUrl"
              defaultValue={company.careersUrl || ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="website" className="font-medium text-heading">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={company.website ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="wikipedia" className="font-medium text-heading">
              Wikipedia
            </label>
            <input
              type="url"
              id="wikipedia"
              name="wikipedia"
              placeholder="https://en.wikipedia.org/wiki/..."
              defaultValue={company.wikipedia ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="github" className="font-medium text-heading">
              GitHub Organization
            </label>
            <input
              type="url"
              id="github"
              name="github"
              placeholder="https://github.com/org-name"
              defaultValue={company.github ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="linkedin" className="font-medium text-heading">
              LinkedIn
            </label>
            <input
              type="url"
              id="linkedin"
              name="linkedin"
              placeholder="https://www.linkedin.com/company/..."
              defaultValue={company.linkedin ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="location" className="font-medium text-heading">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={company.location ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="founded" className="font-medium text-heading">
                Founded
              </label>
              <input
                type="text"
                id="founded"
                name="founded"
                placeholder="e.g., 2015"
                defaultValue={company.founded ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={company.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={company.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">Directory Listings</span>
            <div className="flex gap-gap-6">
              <label className="flex items-center gap-gap-2">
                <input
                  type="checkbox"
                  name="technl"
                  defaultChecked={company.technl ?? false}
                  className="border border-harbour-300"
                />
                <span className="text-sm text-body">TechNL Member</span>
              </label>
              <label className="flex items-center gap-gap-2">
                <input
                  type="checkbox"
                  name="genesis"
                  defaultChecked={company.genesis ?? false}
                  className="border border-harbour-300"
                />
                <span className="text-sm text-body">Genesis Centre</span>
              </label>
              <label className="flex items-center gap-gap-2">
                <input
                  type="checkbox"
                  name="bounce"
                  defaultChecked={company.bounce ?? false}
                  className="border border-harbour-300"
                />
                <span className="text-sm text-body">Bounce</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">News Filtering</span>
            <label className="flex items-center gap-gap-2">
              <input
                type="checkbox"
                name="newsFilterInclude"
                defaultChecked={company.newsFilterInclude ?? false}
                className="border border-harbour-300"
              />
              <span className="text-sm text-body">Include name in news import keyword filter</span>
            </label>
            <p className="text-xs text-subtle">
              When a news source enables the company name filter, articles mentioning this
              company&rsquo;s name will be imported. Only enable for companies with distinctive
              names to avoid false positives.
            </p>
          </div>

          <TechnologySelect technologies={allTechnologies} selectedIds={selectedTechnologyIds} />

          {companyTechnologies.length > 0 && (
            <div className="flex flex-col gap-gap-3">
              <h2 className="font-medium text-heading">Technology Provenance</h2>
              <p className="text-xs text-subtle">Assign each technology to one source bucket.</p>
              <div className="flex flex-col gap-gap-3">
                {provenanceGroups.map((group) => (
                  <div
                    key={group.id}
                    className="border border-line p-pad-3 flex flex-col gap-gap-3"
                  >
                    <input type="hidden" name="provenanceGroupId" value={group.id} />
                    <div className="flex items-center gap-gap-2">
                      <div className="flex items-center gap-gap-2">
                        <h3 className="text-sm font-medium text-heading">
                          {getTechnologyProvenanceSourceByKey(group.sourceKey).label}
                        </h3>
                        {group.technologyIds.length === 0 && (
                          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-700">
                            Orphaned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-gap-2">
                      <select
                        name={`provenanceSourceKey_${group.id}`}
                        value={group.sourceKey}
                        disabled
                        className="px-pad-2 py-pad-1 border border-harbour-300 bg-soft text-heading focus:outline-none"
                      >
                        {technologyProvenanceSourceOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="hidden"
                        name={`provenanceSourceKey_${group.id}`}
                        value={group.sourceKey}
                      />
                      {group.sourceKey === "job_postings" ? (
                        <input
                          type="url"
                          name={`provenanceSourceUrl_${group.id}`}
                          value={group.sourceUrl}
                          onChange={(e) => updateGroupField(group.id, "sourceUrl", e.target.value)}
                          placeholder="Source URL"
                          className="px-pad-2 py-pad-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="url"
                          name={`provenanceSourceUrl_${group.id}`}
                          value={
                            getTechnologyProvenanceSourceByKey(group.sourceKey).sourceUrl ?? ""
                          }
                          readOnly
                          className="px-pad-2 py-pad-1 border border-harbour-300 bg-soft text-heading focus:outline-none"
                        />
                      )}
                      <input
                        type="month"
                        name={`provenanceLastVerified_${group.id}`}
                        value={group.lastVerified}
                        onChange={(e) => updateGroupField(group.id, "lastVerified", e.target.value)}
                        className="px-pad-2 py-pad-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                      />
                    </div>
                    {group.sourceKey === "job_postings" ? (
                      <p className="text-xs text-muted">
                        Snippets and confidence come from extracted job mentions and are shown
                        below.
                      </p>
                    ) : (
                      <textarea
                        name={`provenanceExcerpt_${group.id}`}
                        value={group.excerptText}
                        onChange={(e) => updateGroupField(group.id, "excerptText", e.target.value)}
                        rows={2}
                        placeholder="Evidence excerpt (optional)"
                        className="px-pad-2 py-pad-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                      />
                    )}

                    <div className="border border-line p-pad-2">
                      <p className="text-xs text-muted mb-2">Associate technologies</p>
                      <BaseMultiSelect
                        name={`provenanceTech_${group.id}`}
                        options={assignedTechnologies.map((item) => ({
                          value: String(item.technologyId),
                          label: item.technologyName,
                        }))}
                        selectedValues={group.technologyIds.map(String)}
                        onChange={(selected) =>
                          setGroupTechnologies(
                            group.id,
                            selected.map((value) => parseInt(value, 10)).filter((id) => !isNaN(id)),
                          )
                        }
                        placeholder="Select technologies..."
                      />
                    </div>
                    <div className="border border-line p-pad-2">
                      <p className="text-xs text-muted mb-2">Supporting job postings</p>
                      {group.sourceKey === "job_postings" ? (
                        <BaseMultiSelect
                          name={`provenanceJobs_${group.id}`}
                          options={companyJobs.map((job: CompanyJobOption) => ({
                            value: String(job.id),
                            label: `${job.title}${job.status === "removed" ? " (removed)" : ""}`,
                          }))}
                          selectedValues={group.jobIds.map(String)}
                          onChange={(selected) =>
                            setGroupJobs(
                              group.id,
                              selected
                                .map((value) => parseInt(value, 10))
                                .filter((id) => !isNaN(id)),
                            )
                          }
                          placeholder="Select job evidence..."
                        />
                      ) : (
                        <p className="text-xs text-subtle">
                          Job links only apply to the Job Postings source.
                        </p>
                      )}
                    </div>
                    {group.sourceKey === "job_postings" && (
                      <div className="border border-line">
                        <div className="px-pad-2 py-pad-1 bg-soft border-b border-line">
                          <p className="text-xs text-body">Extracted evidence (read-only)</p>
                        </div>
                        <table className="w-full">
                          <thead className="bg-soft border-b border-line">
                            <tr>
                              <th className="px-pad-2 py-pad-1 text-left text-xs font-medium text-body">
                                Technology
                              </th>
                              <th className="px-pad-2 py-pad-1 text-left text-xs font-medium text-body">
                                Job
                              </th>
                              <th className="px-pad-2 py-pad-1 text-left text-xs font-medium text-body">
                                Confidence
                              </th>
                              <th className="px-pad-2 py-pad-1 text-left text-xs font-medium text-body">
                                Snippet
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-harbour-100">
                            {jobPostingEvidenceRows
                              .filter(
                                (row) =>
                                  group.technologyIds.includes(row.technologyId) &&
                                  group.jobIds.includes(row.jobId),
                              )
                              .filter((row) => row.excerptText && row.excerptText.trim().length > 0)
                              .map((row) => (
                                <tr key={`${row.technologyId}:${row.jobId}`}>
                                  <td className="px-pad-2 py-pad-1 text-xs text-heading">
                                    {row.technologyName}
                                  </td>
                                  <td className="px-pad-2 py-pad-1 text-xs text-heading">
                                    {row.jobTitle}
                                  </td>
                                  <td className="px-pad-2 py-pad-1 text-xs text-body">
                                    {row.confidence ?? "-"}
                                  </td>
                                  <td className="px-pad-2 py-pad-1 text-xs text-body">
                                    {row.excerptText}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">Visibility</span>
            <label className="flex items-center gap-gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={company.visible ?? true}
                className="border border-harbour-300"
              />
              <span className="text-sm text-body">Visible on public site</span>
            </label>
            <p className="text-xs text-subtle">
              Uncheck to hide this company from public listings while you review/edit their profile.
            </p>
          </div>

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Update Company
          </button>
        </Form>

        {/* Convert to Institution section */}
        <div className="border-t border-line pt-pad-6 mt-6">
          <h2 className="text-lg font-semibold text-heading mb-4">
            Convert to Education Institution
          </h2>
          <p className="text-sm text-muted mb-4">
            This will move the company to the Education directory. The company entry will be deleted
            and a new education institution will be created with the same data.
          </p>
          <Form method="post" className="flex flex-wrap items-end gap-gap-4">
            <input type="hidden" name="intent" value="convertToEducation" />
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="institutionType" className="text-sm font-medium text-heading">
                Institution Type
              </label>
              <select
                id="institutionType"
                name="institutionType"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="university">University</option>
                <option value="college">College</option>
                <option value="bootcamp">Bootcamp</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-pad-4 py-pad-2 bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
              onClick={(e) => {
                if (
                  !confirm(
                    `Are you sure you want to convert "${company.name}" to an education institution? This will delete the company entry.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              Convert to Institution
            </button>
          </Form>
        </div>

        {/* Import Block section - only show for companies from TechNL or Genesis */}
        {(company.technl || company.genesis) && (
          <div className="border-t border-line pt-pad-6 mt-6">
            <h2 className="text-lg font-semibold text-heading mb-2">Import Block</h2>
            <p className="text-sm text-muted mb-4">
              Add this company to the import block list to prevent it from being re-imported from{" "}
              {company.technl && company.genesis
                ? "TechNL or Genesis"
                : company.technl
                  ? "TechNL"
                  : "Genesis"}{" "}
              in the future. This will also delete the current record.
            </p>
            <div className="flex flex-wrap gap-gap-3">
              {company.technl && (
                <Form method="post">
                  <input type="hidden" name="intent" value="import-block" />
                  <input type="hidden" name="source" value="technl" />
                  <button
                    type="submit"
                    className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Add "${company.name}" to TechNL import block list and delete? This prevents this company from being imported from TechNL again.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Block from TechNL Import
                  </button>
                </Form>
              )}
              {company.genesis && (
                <Form method="post">
                  <input type="hidden" name="intent" value="import-block" />
                  <input type="hidden" name="source" value="genesis" />
                  <button
                    type="submit"
                    className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Add "${company.name}" to Genesis import block list and delete? This prevents this company from being imported from Genesis again.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Block from Genesis Import
                  </button>
                </Form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
