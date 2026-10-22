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
    output: z.array(eventOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        (
          await getPaginatedEvents(
            input.limit,
            input.offset,
            input.query,
            input.upcoming ? "upcoming" : "all",
          )
        ).items,
      ),
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
    output: z.array(
      jobOutput
        .extend({
          companyName: z.string().nullable(),
          companyLogo: z.string().nullable(),
          importSourceType: z.string().nullable(),
        })
        .strict(),
    ),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        (
          await getPaginatedJobs(input.limit, input.offset, input.query, {
            includeNonTechnical: true,
            companyId: input.companyId,
            sourceId: input.sourceId,
            status: "active",
            isTechnical: input.isTechnical,
            workplaceType: input.workplaceType,
            location: input.location,
            lastSeenAfter: input.lastSeenAfter ? new Date(input.lastSeenAfter) : undefined,
          })
        ).items.map(
          ({ importSourceIdentifier: _identifier, importSourceUrl: _url, ...job }) => job,
        ),
      ),
  }),
  newsPublicList: defineOperation({
    name: "newsPublicList",
    area: "news",
    risk: "read",
    access: "public",
    summary: "List public news.",
    description:
      "Return a bounded page with optional text search. Only published news is returned. Administrators use newsList for moderation data.",
    input: publicListInput,
    output: z.array(newsOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedNews(input.limit, input.offset, input.query)).items),
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
    output: z.array(companyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedCompanies(input.limit, input.offset, input.query)).items),
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
    output: z.array(groupOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedGroups(input.limit, input.offset, input.query)).items),
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
    output: z.array(personOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedPeople(input.limit, input.offset, input.query)).items),
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
    output: z.array(educationOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedEducation(input.limit, input.offset, input.query)).items),
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
    output: z.array(technologyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        (await getAllTechnologies())
          .filter(
            (row) => !input.query || row.name.toLowerCase().includes(input.query.toLowerCase()),
          )
          .slice(input.offset, input.offset + input.limit),
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
    output: z.array(productOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        (await getPaginatedProducts(input.limit, input.offset, input.query)).items.map(
          ({ company: _company, ...product }) => product,
        ),
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
    output: z.array(projectOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) =>
      toPlain((await getPaginatedProjects(input.limit, input.offset, input.query)).items),
  }),
};
