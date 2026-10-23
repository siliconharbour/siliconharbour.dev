import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { companies, events } from "~/db/schema";
import { getCompanyBySlug } from "./companies.server";
import { getPersonBySlug } from "./people.server";
import { getEducationBySlug } from "./education.server";
import { getGroupBySlug } from "./groups.server";
import { getProductBySlug, getProductsByCompany } from "./products.server";
import { getProjectBySlugWithImages } from "./projects.server";
import {
  getTechnologyBySlug,
  getTechnologiesForContent,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "./technologies.server";
import { getPublicEventBySlug } from "./events.server";
import { getTagsForEvents } from "./event-tags.server";
import { getJobBySlug } from "./jobs.server";
import { getNewsBySlug } from "./news.server";
import { publiclyVisibleEvent } from "./event-visibility";
import { notRejected } from "./directory-active.server";
import { NotFoundError } from "~/operations/errors";
import { toPlain } from "~/operations/plain";
import { publicProjection as project } from "~/operations/public-projection";
import * as output from "~/operations/contracts/public-outputs";
import type { z } from "zod";
import type { eventOutput } from "~/operations/contracts/events";

function requireVisible<T extends { visible: boolean }>(row: T | null, label: string): T {
  if (!row?.visible) throw new NotFoundError(`${label} not found`);
  return row;
}
function requireRecord<T>(row: T | null, label: string): T {
  if (!row) throw new NotFoundError(`${label} not found`);
  return row;
}
export function publicCompanyReferences(ids: number[]) {
  const rows = ids.length
    ? db
        .select({ id: companies.id, slug: companies.slug, name: companies.name })
        .from(companies)
        .where(
          and(
            inArray(companies.id, ids),
            eq(companies.visible, true),
            notRejected("company", companies.id),
          ),
        )
        .all()
    : [];
  return new Map(rows.map((row) => [row.id, row]));
}
export function publicEvent(row: z.output<typeof eventOutput>) {
  return project(output.eventPublicOutput, {
    ...row,
    dates: row.dates.map((date) => project(output.publicEventDate, date)),
    tags: (row.tags ?? []).map((tag) => project(output.publicEventTag, tag)),
  });
}
async function publicTechnologies(type: "company" | "project", id: number) {
  return (await getTechnologiesForContent(type, id))
    .filter((row) => row.technology.visible)
    .map((row) => project(output.publicTechnologyReference, row.technology));
}
export async function getPublicCompany(slug: string) {
  const row = requireVisible(await getCompanyBySlug(slug), "Company");
  const [technologies, products] = await Promise.all([
    publicTechnologies("company", row.id),
    getProductsByCompany(row.id),
  ]);
  return {
    ...project(output.companyPublicOutput, toPlain(row)),
    technologies,
    products: products.map((product) =>
      project(output.productPublicOutput.omit({ company: true }), toPlain(product)),
    ),
  };
}
export async function getPublicPerson(slug: string) {
  return project(
    output.personPublicOutput,
    toPlain(requireVisible(await getPersonBySlug(slug), "Person")),
  );
}
export async function getPublicEducation(slug: string) {
  return project(
    output.educationPublicOutput,
    toPlain(requireVisible(await getEducationBySlug(slug), "Education")),
  );
}
export async function getPublicGroup(slug: string) {
  return project(
    output.groupPublicOutput,
    toPlain(requireVisible(await getGroupBySlug(slug), "Group")),
  );
}
export async function getPublicProduct(slug: string) {
  const row = requireRecord(await getProductBySlug(slug), "Product");
  const company =
    row.companyId === null
      ? null
      : (publicCompanyReferences([row.companyId]).get(row.companyId) ?? null);
  return project(output.productPublicOutput, { ...toPlain(row), company });
}
export async function getPublicProject(slug: string) {
  const row = requireRecord(await getProjectBySlugWithImages(slug), "Project");
  return {
    ...project(output.projectPublicOutput, toPlain(row)),
    technologies: await publicTechnologies("project", row.id),
    images: row.images.map((image) =>
      project(output.projectPublicDetailOutput.shape.images.element, image),
    ),
  };
}
export async function getPublicTechnology(slug: string) {
  const row = requireVisible(await getTechnologyBySlug(slug), "Technology");
  const [companies, projects] = await Promise.all([
    getCompaniesUsingTechnology(row.id),
    getProjectsUsingTechnology(row.id),
  ]);
  return {
    ...project(output.technologyPublicOutput, toPlain(row)),
    companies: companies.map((company) => project(output.publicCompanyReference, company)),
    projects: projects.map((item) =>
      project(output.technologyPublicDetailOutput.shape.projects.element, item),
    ),
  };
}
export async function getPublicEvent(slug: string) {
  const row = requireRecord(await getPublicEventBySlug(slug), "Event");
  const tags = (await getTagsForEvents([row.id])).get(row.id) ?? [];
  const reference = {
    id: events.id,
    slug: events.slug,
    title: events.title,
    timeMode: events.timeMode,
  };
  const parent =
    row.parentEventId === null
      ? null
      : (db
          .select(reference)
          .from(events)
          .where(and(eq(events.id, row.parentEventId), publiclyVisibleEvent))
          .get() ?? null);
  const schedule = db
    .select(reference)
    .from(events)
    .where(and(eq(events.parentEventId, row.id), publiclyVisibleEvent))
    .orderBy(events.title, events.id)
    .all();
  return { ...publicEvent(toPlain({ ...row, tags })), parent, schedule };
}
export async function getPublicJob(slug: string) {
  const row = requireRecord(await getJobBySlug(slug), "Job");
  if (row.status !== "active") throw new NotFoundError("Job not found");
  const company =
    row.companyId === null
      ? null
      : (publicCompanyReferences([row.companyId]).get(row.companyId) ?? null);
  return project(output.jobPublicOutput, {
    ...toPlain(row),
    description: row.description ?? row.descriptionText,
    company,
  });
}
export async function getPublicNews(slug: string) {
  const row = requireRecord(await getNewsBySlug(slug), "News");
  if (row.status !== "published") throw new NotFoundError("News not found");
  return project(output.newsPublicOutput, toPlain(row));
}
