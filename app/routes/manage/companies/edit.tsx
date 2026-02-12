import type { Route } from "./+types/edit";
import { useState } from "react";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "~/lib/session.server";
import { db } from "~/db";
import { jobs, jobTechnologyMentions } from "~/db/schema";
import { getCompanyById, updateCompany, deleteCompany } from "~/lib/companies.server";
import { convertCompanyToEducation } from "~/lib/education.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { TechnologySelect } from "~/components/TechnologySelect";
import { BaseMultiSelect } from "~/components/BaseMultiSelect";
import { blockItem } from "~/lib/import-blocklist.server";
import { actionError } from "~/lib/admin/action-result";
import { parseCompanyForm } from "~/lib/admin/manage-schemas";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import {
  getAllTechnologies,
  getTechnologiesForContent,
  setTechnologiesForContent,
  setTechnologyEvidenceForCompany,
} from "~/lib/technologies.server";
import {
  getTechnologyProvenanceSourceByKey,
  inferTechnologyProvenanceSourceKey,
  technologyProvenanceSourceOptions,
  type TechnologyProvenanceSourceKey,
} from "~/lib/technology-evidence";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase() + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

function normalizeNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLastVerified(value: FormDataEntryValue | null): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return `${normalized}-01`;
  }
  return normalized;
}

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

interface JobPostingEvidenceRow {
  technologyId: number;
  technologyName: string;
  jobId: number;
  jobTitle: string;
  confidence: number | null;
  excerptText: string | null;
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

    const relevantEvidence = evidenceWithKey.filter((entry) => entry.sourceKey === preferredSourceKey);
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

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.company?.name || "Company"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid company ID", { status: 400 });
  }

  const company = await getCompanyById(id);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  const [allTechnologies, companyTechnologies] = await Promise.all([
    getAllTechnologies(),
    getTechnologiesForContent("company", id),
  ]);
  const companyJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
    })
    .from(jobs)
    .where(eq(jobs.companyId, id))
    .orderBy(desc(jobs.firstSeenAt));

  const mentionRows = await db
    .select({
      jobId: jobTechnologyMentions.jobId,
      technologyId: jobTechnologyMentions.technologyId,
      confidence: jobTechnologyMentions.confidence,
      context: jobTechnologyMentions.context,
    })
    .from(jobTechnologyMentions)
    .innerJoin(jobs, eq(jobTechnologyMentions.jobId, jobs.id))
    .where(eq(jobs.companyId, id));
  const bestMentionByKey = new Map<string, { confidence: number | null; context: string | null }>();
  for (const mention of mentionRows) {
    const key = `${mention.technologyId}:${mention.jobId}`;
    const existing = bestMentionByKey.get(key);
    if (!existing || (mention.confidence ?? -1) > (existing.confidence ?? -1)) {
      bestMentionByKey.set(key, {
        confidence: mention.confidence ?? null,
        context: mention.context ?? null,
      });
    }
  }

  const companyJobMap = new Map(companyJobs.map((job) => [job.id, job]));
  const jobPostingEvidenceRowsMap = new Map<string, JobPostingEvidenceRow>();
  for (const item of companyTechnologies) {
    for (const evidence of item.evidence) {
      if (evidence.sourceType !== "job_posting" || !evidence.jobId) continue;
      const key = `${item.technologyId}:${evidence.jobId}`;
      const mention = bestMentionByKey.get(key);
      const job = companyJobMap.get(evidence.jobId);
      if (!job) continue;
      if (!jobPostingEvidenceRowsMap.has(key)) {
        jobPostingEvidenceRowsMap.set(key, {
          technologyId: item.technologyId,
          technologyName: item.technology.name,
          jobId: evidence.jobId,
          jobTitle: job.title,
          confidence: mention?.confidence ?? null,
          excerptText: evidence.excerptText ?? mention?.context ?? null,
        });
      }
    }
  }
  const jobPostingEvidenceRows = Array.from(jobPostingEvidenceRowsMap.values()).sort((a, b) => {
    const byTech = a.technologyName.localeCompare(b.technologyName);
    if (byTech !== 0) return byTech;
    return a.jobTitle.localeCompare(b.jobTitle);
  });

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
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid company ID" };
  }

  const existingCompany = await getCompanyById(id);
  if (!existingCompany) {
    return { error: "Company not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle import block action
  if (intent === "import-block") {
    const source = formData.get("source") as string;

    if (!source) {
      return { error: "No import source specified" };
    }

    // Use normalized website URL as external ID, or name if no website
    // Must match the normalization used in the import page
    const externalId = existingCompany.website
      ? normalizeUrl(existingCompany.website)
      : existingCompany.name.toLowerCase();

    await blockItem(source, externalId, existingCompany.name, "Blocked from edit page");
    await deleteCompany(id);

    return redirect("/manage/companies");
  }

  // Handle convert to institution
  if (intent === "convertToEducation") {
    const institutionType = (formData.get("institutionType") as string) || "other";
    try {
      const institution = await convertCompanyToEducation(
        id,
        institutionType as "university" | "college" | "bootcamp" | "online" | "other",
      );
      return redirect(`/manage/education/${institution.id}`);
    } catch (error) {
      console.error("Failed to convert company to institution:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { error: `Failed to convert company to institution: ${message}` };
    }
  }

  const parsed = parseCompanyForm(formData);
  if (!parsed.success) {
    return actionError(parsed.error);
  }
  const visible = formData.get("visible") === "true";
  const technologyIds = formData.getAll("technologies").map((id) => parseInt(id as string, 10));
  const provenanceGroupIds = formData
    .getAll("provenanceGroupId")
    .map((id) => String(id))
    .filter((id) => id.length > 0);

  const evidenceGroups = provenanceGroupIds.map((groupId) => {
    const sourceKey = String(formData.get(`provenanceSourceKey_${groupId}`) || "get_coding_reference");
    const sourceDefinition = getTechnologyProvenanceSourceByKey(sourceKey);
    const technologyIdsForGroup = formData
      .getAll(`provenanceTech_${groupId}`)
      .map((id) => parseInt(String(id), 10))
      .filter((techId) => !isNaN(techId) && technologyIds.includes(techId));
    const jobIds = formData
      .getAll(`provenanceJobs_${groupId}`)
      .map((id) => parseInt(String(id), 10))
      .filter((jobId) => !isNaN(jobId));

    return {
      technologyIds: technologyIdsForGroup,
      sourceType: sourceDefinition.sourceType,
      sourceUrl:
        sourceDefinition.sourceUrl
        ?? normalizeNullableString(formData.get(`provenanceSourceUrl_${groupId}`)),
      lastVerified: normalizeLastVerified(formData.get(`provenanceLastVerified_${groupId}`)),
      excerptText: normalizeNullableString(formData.get(`provenanceExcerpt_${groupId}`)),
      jobIds,
    } as const;
  });

  const logo = await resolveUpdatedImage({
    formData,
    uploadedImageField: "logoData",
    existingImageField: "existingLogo",
    currentImage: existingCompany.logo,
    processor: processAndSaveIconImage,
  });

  const coverImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "coverImageData",
    existingImageField: "existingCoverImage",
    currentImage: existingCompany.coverImage,
    processor: processAndSaveCoverImage,
  });

  await updateCompany(id, {
    ...parsed.data,
    visible,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

  // Update technology assignments
  await setTechnologiesForContent("company", id, technologyIds);
  await setTechnologyEvidenceForCompany(id, evidenceGroups);

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
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/companies" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Companies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Company</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-medium text-harbour-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={company.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={company.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="font-medium text-harbour-700">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={company.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="wikipedia" className="font-medium text-harbour-700">
              Wikipedia
            </label>
            <input
              type="url"
              id="wikipedia"
              name="wikipedia"
              placeholder="https://en.wikipedia.org/wiki/..."
              defaultValue={company.wikipedia ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="github" className="font-medium text-harbour-700">
              GitHub Organization
            </label>
            <input
              type="url"
              id="github"
              name="github"
              placeholder="https://github.com/org-name"
              defaultValue={company.github ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="linkedin" className="font-medium text-harbour-700">
              LinkedIn
            </label>
            <input
              type="url"
              id="linkedin"
              name="linkedin"
              placeholder="https://www.linkedin.com/company/..."
              defaultValue={company.linkedin ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="location" className="font-medium text-harbour-700">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={company.location ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="founded" className="font-medium text-harbour-700">
                Founded
              </label>
              <input
                type="text"
                id="founded"
                name="founded"
                placeholder="e.g., 2015"
                defaultValue={company.founded ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Directory Listings</span>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="technl"
                  defaultChecked={company.technl ?? false}
                  className="border border-harbour-300"
                />
                <span className="text-sm text-harbour-600">TechNL Member</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="genesis"
                  defaultChecked={company.genesis ?? false}
                  className="border border-harbour-300"
                />
                <span className="text-sm text-harbour-600">Genesis Centre</span>
              </label>
            </div>
          </div>

          <TechnologySelect
            technologies={allTechnologies}
            selectedIds={selectedTechnologyIds}
          />

          {companyTechnologies.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-medium text-harbour-700">Technology Provenance</h2>
              <p className="text-xs text-harbour-400">
                Assign each technology to one source bucket.
              </p>
              <div className="flex flex-col gap-3">
                {provenanceGroups.map((group) => (
                  <div key={group.id} className="border border-harbour-200 p-3 flex flex-col gap-3">
                    <input type="hidden" name="provenanceGroupId" value={group.id} />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-harbour-700">
                          {getTechnologyProvenanceSourceByKey(group.sourceKey).label}
                        </h3>
                        {group.technologyIds.length === 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700">
                            Orphaned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        name={`provenanceSourceKey_${group.id}`}
                        value={group.sourceKey}
                        disabled
                        className="px-2 py-1 border border-harbour-300 bg-harbour-50 text-harbour-700 focus:outline-none"
                      >
                        {technologyProvenanceSourceOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input type="hidden" name={`provenanceSourceKey_${group.id}`} value={group.sourceKey} />
                      {group.sourceKey === "job_postings" ? (
                        <input
                          type="url"
                          name={`provenanceSourceUrl_${group.id}`}
                          value={group.sourceUrl}
                          onChange={(e) => updateGroupField(group.id, "sourceUrl", e.target.value)}
                          placeholder="Source URL"
                          className="px-2 py-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="url"
                          name={`provenanceSourceUrl_${group.id}`}
                          value={getTechnologyProvenanceSourceByKey(group.sourceKey).sourceUrl ?? ""}
                          readOnly
                          className="px-2 py-1 border border-harbour-300 bg-harbour-50 text-harbour-700 focus:outline-none"
                        />
                      )}
                      <input
                        type="month"
                        name={`provenanceLastVerified_${group.id}`}
                        value={group.lastVerified}
                        onChange={(e) => updateGroupField(group.id, "lastVerified", e.target.value)}
                        className="px-2 py-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                      />
                    </div>
                    {group.sourceKey === "job_postings" ? (
                      <p className="text-xs text-harbour-500">
                        Snippets and confidence come from extracted job mentions and are shown below.
                      </p>
                    ) : (
                      <textarea
                        name={`provenanceExcerpt_${group.id}`}
                        value={group.excerptText}
                        onChange={(e) => updateGroupField(group.id, "excerptText", e.target.value)}
                        rows={2}
                        placeholder="Evidence excerpt (optional)"
                        className="px-2 py-1 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                      />
                    )}

                    <div className="border border-harbour-200 p-2">
                      <p className="text-xs text-harbour-500 mb-2">Associate technologies</p>
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
                    <div className="border border-harbour-200 p-2">
                      <p className="text-xs text-harbour-500 mb-2">Supporting job postings</p>
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
                              selected.map((value) => parseInt(value, 10)).filter((id) => !isNaN(id)),
                            )
                          }
                          placeholder="Select job evidence..."
                        />
                      ) : (
                        <p className="text-xs text-harbour-400">
                          Job links only apply to the Job Postings source.
                        </p>
                      )}
                    </div>
                    {group.sourceKey === "job_postings" && (
                      <div className="border border-harbour-200">
                        <div className="px-2 py-1 bg-harbour-50 border-b border-harbour-200">
                          <p className="text-xs text-harbour-600">Extracted evidence (read-only)</p>
                        </div>
                        <table className="w-full">
                          <thead className="bg-harbour-50 border-b border-harbour-200">
                            <tr>
                              <th className="px-2 py-1 text-left text-xs font-medium text-harbour-600">
                                Technology
                              </th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-harbour-600">Job</th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-harbour-600">
                                Confidence
                              </th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-harbour-600">Snippet</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-harbour-100">
                            {jobPostingEvidenceRows
                              .filter(
                                (row) =>
                                  group.technologyIds.includes(row.technologyId)
                                  && group.jobIds.includes(row.jobId),
                              )
                              .map((row) => (
                                <tr key={`${row.technologyId}:${row.jobId}`}>
                                  <td className="px-2 py-1 text-xs text-harbour-700">{row.technologyName}</td>
                                  <td className="px-2 py-1 text-xs text-harbour-700">{row.jobTitle}</td>
                                  <td className="px-2 py-1 text-xs text-harbour-600">
                                    {row.confidence ?? "-"}
                                  </td>
                                  <td className="px-2 py-1 text-xs text-harbour-600">
                                    {row.excerptText && row.excerptText.trim().length > 0
                                      ? row.excerptText
                                      : "No snippet available"}
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

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Visibility</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={company.visible ?? true}
                className="border border-harbour-300"
              />
              <span className="text-sm text-harbour-600">Visible on public site</span>
            </label>
            <p className="text-xs text-harbour-400">
              Uncheck to hide this company from public listings while you review/edit their profile.
            </p>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Company
          </button>
        </Form>

        {/* Convert to Institution section */}
        <div className="border-t border-harbour-200 pt-6 mt-6">
          <h2 className="text-lg font-semibold text-harbour-700 mb-4">
            Convert to Education Institution
          </h2>
          <p className="text-sm text-harbour-500 mb-4">
            This will move the company to the Education directory. The company entry will be deleted
            and a new education institution will be created with the same data.
          </p>
          <Form method="post" className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="intent" value="convertToEducation" />
            <div className="flex flex-col gap-2">
              <label htmlFor="institutionType" className="text-sm font-medium text-harbour-700">
                Institution Type
              </label>
              <select
                id="institutionType"
                name="institutionType"
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
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
          <div className="border-t border-harbour-200 pt-6 mt-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-2">Import Block</h2>
            <p className="text-sm text-harbour-500 mb-4">
              Add this company to the import block list to prevent it from being re-imported from{" "}
              {company.technl && company.genesis
                ? "TechNL or Genesis"
                : company.technl
                  ? "TechNL"
                  : "Genesis"}{" "}
              in the future. This will also delete the current record.
            </p>
            <div className="flex flex-wrap gap-3">
              {company.technl && (
                <Form method="post">
                  <input type="hidden" name="intent" value="import-block" />
                  <input type="hidden" name="source" value="technl" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
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
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
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
