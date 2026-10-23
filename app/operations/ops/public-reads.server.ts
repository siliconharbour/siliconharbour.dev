import * as output from "../contracts/public-outputs";
import { publicProjection as project } from "../public-projection";
import { publicEvent, publicCompanyReferences } from "~/lib/public-content.server";
import { listNews } from "~/lib/content-lists.server";
import { newsPublicListInput } from "../contracts/public-reads";

import { page, pageResult } from "../listing";
import { listProjects } from "~/lib/directory-lists.server";
import { listProducts } from "~/lib/directory-lists.server";
import { listGroups } from "~/lib/directory-lists.server";
import { listTechnologies } from "~/lib/directory-lists.server";
import { listEducation } from "~/lib/directory-lists.server";
import { listCompanies } from "~/lib/directory-lists.server";
import { listPeople } from "~/lib/directory-lists.server";

import { defineOperation } from "../define";
import { toPlain } from "../plain";
import {
  publicListInput,
  publicEventListInput,
  publicJobListInput,
} from "../contracts/public-reads";

import { getPaginatedEvents } from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";

function projectPage<T, U>(
  result: { items: T[]; total: number; nextOffset: number | null },
  select: (row: T) => U,
) {
  return { ...result, items: result.items.map(select) };
}
export const publicReadOperations = {
  eventPublicList: defineOperation({
    name: "eventPublicList",
    area: "events",
    risk: "read",
    access: "public",
    summary: "List public events.",
    description:
      "Return a bounded page with optional text search. Only publicly visible events are returned. upcoming defaults to true; false includes past events. Administrators use eventList for moderation data.",
    input: publicEventListInput,
    output: page(output.eventPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => {
      const result = await getPaginatedEvents(
        input.limit,
        input.offset,
        input.query,
        input.upcoming ? "upcoming" : "all",
      );
      return pageResult(
        input,
        result.items.map((row) => publicEvent(toPlain(row))),
        result.total,
      );
    },
  }),
  jobPublicList: defineOperation({
    name: "jobPublicList",
    area: "jobs",
    risk: "read",
    access: "public",
    summary: "List public jobs.",
    description:
      "Return a bounded page with optional text search. Only active jobs; no source credentials or private source URLs are returned. Administrators use jobList for moderation data.",
    input: publicJobListInput,
    output: page(output.jobPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => {
      const result = await getPaginatedJobs(input.limit, input.offset, input.query, {
        includeNonTechnical: true,
        companyId: input.companyId,
        sourceId: input.sourceId,
        status: "active",
        isTechnical: input.isTechnical,
        workplaceType: input.workplaceType,
        location: input.location,
        lastSeenAfter: input.lastSeenAfter ? new Date(input.lastSeenAfter) : undefined,
        sort: input.sort,
        order: input.order,
      });
      const companies = publicCompanyReferences(
        result.items.flatMap((row) => (row.companyId === null ? [] : [row.companyId])),
      );
      return pageResult(
        input,
        result.items.map((row) =>
          project(output.jobPublicOutput, {
            ...toPlain(row),
            description: row.description ?? row.descriptionText,
            company: row.companyId === null ? null : (companies.get(row.companyId) ?? null),
          }),
        ),
        result.total,
      );
    },
  }),
  newsPublicList: defineOperation({
    name: "newsPublicList",
    area: "news",
    risk: "read",
    access: "public",
    summary: "List public news.",
    description:
      "Return a bounded page with optional text search. Only published news is returned. Administrators use newsList for moderation data.",
    input: newsPublicListInput,
    output: page(output.newsPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listNews({ ...input, status: "published" }), (row) =>
        project(output.newsPublicOutput, toPlain(row)),
      ),
  }),
  companyPublicList: defineOperation({
    name: "companyPublicList",
    area: "companies",
    risk: "read",
    access: "public",
    summary: "List public companies.",
    description:
      "Return a bounded page with optional text search. Hidden records are excluded. Administrators use companyList for moderation data.",
    input: publicListInput,
    output: page(output.companyPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listCompanies({ ...input, visible: true }), (row) =>
        project(output.companyPublicOutput, toPlain(row)),
      ),
  }),
  groupPublicList: defineOperation({
    name: "groupPublicList",
    area: "groups",
    risk: "read",
    access: "public",
    summary: "List public groups.",
    description:
      "Return a bounded page with optional text search. Follow the public directory visibility rules. Administrators use groupList for moderation data.",
    input: publicListInput,
    output: page(output.groupPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listGroups({ ...input, visible: true }), (row) =>
        project(output.groupPublicOutput, toPlain(row)),
      ),
  }),
  personPublicList: defineOperation({
    name: "personPublicList",
    area: "people",
    risk: "read",
    access: "public",
    summary: "List public people.",
    description:
      "Return a bounded page with optional text search. Hidden records are excluded. Administrators use personList for moderation data.",
    input: publicListInput,
    output: page(output.personPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listPeople({ ...input, visible: true }), (row) =>
        project(output.personPublicOutput, toPlain(row)),
      ),
  }),
  educationPublicList: defineOperation({
    name: "educationPublicList",
    area: "education",
    risk: "read",
    access: "public",
    summary: "List public education.",
    description:
      "Return a bounded page with optional text search. Hidden records are excluded. Administrators use educationList for moderation data.",
    input: publicListInput,
    output: page(output.educationPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listEducation({ ...input, visible: true }), (row) =>
        project(output.educationPublicOutput, toPlain(row)),
      ),
  }),
  technologyPublicList: defineOperation({
    name: "technologyPublicList",
    area: "technologies",
    risk: "read",
    access: "public",
    summary: "List public technologies.",
    description:
      "Return a bounded page with optional text search. Hidden records are excluded. Administrators use technologyList for moderation data.",
    input: publicListInput,
    output: page(output.technologyPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listTechnologies({ ...input, visible: true }), (row) =>
        project(output.technologyPublicOutput, toPlain(row)),
      ),
  }),
  productPublicList: defineOperation({
    name: "productPublicList",
    area: "products",
    risk: "read",
    access: "public",
    summary: "List public products.",
    description:
      "Return a bounded page with optional text search. Follow the public directory visibility rules. Administrators use productList for moderation data.",
    input: publicListInput,
    output: page(output.productPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listProducts({ ...input }), (row) =>
        project(output.productPublicOutput, toPlain(row)),
      ),
  }),
  projectPublicList: defineOperation({
    name: "projectPublicList",
    area: "projects",
    risk: "read",
    access: "public",
    summary: "List public projects.",
    description:
      "Return a bounded page with optional text search. Follow the public directory visibility rules. Administrators use projectList for moderation data.",
    input: publicListInput,
    output: page(output.projectPublicOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      projectPage(listProjects({ ...input }), (row) =>
        project(output.projectPublicOutput, toPlain(row)),
      ),
  }),
};
