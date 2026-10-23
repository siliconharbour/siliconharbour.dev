import { notRejected } from "./directory-active.server";
import { and, eq, exists, not } from "drizzle-orm";
import {
  companies,
  education,
  people,
  groups,
  products,
  projects,
  technologies,
  jobImportSources,
} from "~/db/schema";
import { db } from "~/db";
import { sqlPage } from "./sql-page.server";
import type { ListInput } from "~/operations/listing";

type VisibilityInput = ListInput & { visible?: boolean };
export function listPeople(input: VisibilityInput) {
  return sqlPage(
    people,
    input,
    [people.name, people.slug, people.bio, people.website, people.github],
    { name: people.name, createdAt: people.createdAt, updatedAt: people.updatedAt },
    and(
      notRejected("person", people.id),
      input.visible === undefined ? undefined : eq(people.visible, input.visible),
    ),
  );
}
export function listCompanies(input: VisibilityInput & { hasJobSource?: boolean }) {
  const hasSource = exists(
    db
      .select({ id: jobImportSources.id })
      .from(jobImportSources)
      .where(eq(jobImportSources.companyId, companies.id)),
  );
  return sqlPage(
    companies,
    input,
    [companies.name, companies.slug, companies.description, companies.website, companies.github],
    { name: companies.name, createdAt: companies.createdAt, updatedAt: companies.updatedAt },
    and(
      notRejected("company", companies.id),
      input.visible === undefined ? undefined : eq(companies.visible, input.visible),
      input.hasJobSource === undefined
        ? undefined
        : input.hasJobSource
          ? hasSource
          : not(hasSource),
    ),
  );
}
export function listEducation(input: VisibilityInput) {
  return sqlPage(
    education,
    input,
    [education.name, education.slug, education.description, education.website],
    { name: education.name, createdAt: education.createdAt, updatedAt: education.updatedAt },
    input.visible === undefined ? undefined : eq(education.visible, input.visible),
  );
}
export function listTechnologies(input: VisibilityInput) {
  return sqlPage(
    technologies,
    input,
    [technologies.name, technologies.slug, technologies.description],
    {
      name: technologies.name,
      createdAt: technologies.createdAt,
      updatedAt: technologies.updatedAt,
    },
    input.visible === undefined ? undefined : eq(technologies.visible, input.visible),
  );
}
export function listGroups(input: VisibilityInput) {
  return sqlPage(
    groups,
    input,
    [groups.name, groups.slug, groups.description],
    {
      name: groups.name,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
    },
    input.visible === undefined ? undefined : eq(groups.visible, input.visible),
  );
}
export function listProducts(input: ListInput) {
  return sqlPage(products, input, [products.name, products.slug, products.description], {
    name: products.name,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  });
}
export function listProjects(input: ListInput) {
  return sqlPage(projects, input, [projects.name, projects.slug, projects.description], {
    name: projects.name,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
  });
}
