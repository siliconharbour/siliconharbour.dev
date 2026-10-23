import { db } from "~/db";
import { jobs, jobTechnologyMentions } from "~/db/schema";
import { desc, eq } from "drizzle-orm";
import { getTechnologiesForContent } from "~/lib/technologies.server";
interface JobPostingEvidenceRow {
  technologyId: number;
  technologyName: string;
  jobId: number;
  jobTitle: string;
  confidence: number | null;
  excerptText: string | null;
}

export async function getCompanyTechnologyDetails(id: number) {
  const companyTechnologies = await getTechnologiesForContent("company", id);
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

  return { technologies: companyTechnologies, companyJobs, jobPostingEvidenceRows };
}
