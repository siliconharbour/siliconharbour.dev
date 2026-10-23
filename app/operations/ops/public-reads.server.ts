import { listNews } from "~/lib/content-lists.server";
import { newsPublicListInput } from "../contracts/public-reads";
import { jobListItemOutput } from "../contracts/jobs";
import { page, pageResult } from "../listing";
import { listProjects } from "~/lib/directory-lists.server";
import { listProducts } from "~/lib/directory-lists.server";
import { listGroups } from "~/lib/directory-lists.server";
import { listTechnologies } from "~/lib/directory-lists.server";
import { listEducation } from "~/lib/directory-lists.server";
import { listCompanies } from "~/lib/directory-lists.server";
import { listPeople } from "~/lib/directory-lists.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { toPlain } from "../plain";
import {
  publicListInput,
  publicEventListInput,
  publicJobListInput,
} from "../contracts/public-reads";
import { eventOutput } from "../contracts/events";
import { jobOutput } from "../contracts/jobs";
import { newsOutput } from "../contracts/news";
import { companyOutput } from "../contracts/companies";
import { groupOutput } from "../contracts/groups";
import { personOutput } from "../contracts/people";
import { educationOutput } from "../contracts/education";
import { technologyOutput } from "../contracts/technologies";
import { productOutput } from "../contracts/products";
import { projectOutput } from "../contracts/projects";
import { getPaginatedEvents } from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { getPaginatedNews } from "~/lib/news.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getPaginatedPeople } from "~/lib/people.server";
import { getPaginatedEducation } from "~/lib/education.server";
import { getAllTechnologies } from "~/lib/technologies.server";
import { getPaginatedProducts } from "~/lib/products.server";
import { getPaginatedProjects } from "~/lib/projects.server";
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
    output: page(eventOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => {
      const result = await getPaginatedEvents(
        input.limit,
        input.offset,
        input.query,
        input.upcoming ? "upcoming" : "all",
      );
      return toPlain(pageResult(input, result.items, result.total));
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
    output: page(jobListItemOutput.omit({ importSourceIdentifier: true, importSourceUrl: true })),
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
      return toPlain(
        pageResult(
          input,
          result.items.map(({ importSourceIdentifier: _id, importSourceUrl: _url, ...row }) => row),
          result.total,
        ),
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
    output: page(newsOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listNews({ ...input, status: "published" })),
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
    output: page(companyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listCompanies({ ...input, visible: true })),
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
    output: page(groupOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listGroups({ ...input, visible: true })),
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
    output: page(personOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listPeople({ ...input, visible: true })),
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
    output: page(educationOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listEducation({ ...input, visible: true })),
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
    output: page(technologyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listTechnologies({ ...input, visible: true })),
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
    output: page(productOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listProducts({ ...input })),
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
    output: page(projectOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listProjects({ ...input })),
  }),
};
