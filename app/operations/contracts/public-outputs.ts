import { z } from "zod";
import { text } from "../fields";
import { companyOutput } from "./companies";
import { personOutput } from "./people";
import { educationOutput } from "./education";
import { groupOutput } from "./groups";
import { productOutput } from "./products";
import { projectOutput } from "./projects";
import { technologyOutput } from "./technologies";
import { eventOutput, eventDateOutput, eventTagOutput } from "./events";
import { jobOutput } from "./jobs";
import { newsOutput } from "./news";
import { projectImageOutput } from "./directory-relations";

export const publicGetInput = z.object({ slug: text("slug", 300) }).strict();
const identity = { id: true, slug: true, name: true } as const;
const timestamps = { createdAt: true, updatedAt: true } as const;
const directory = {
  ...identity,
  ...timestamps,
  description: true,
  website: true,
  logo: true,
  coverImage: true,
} as const;
export const publicCompanyReference = companyOutput.pick(identity);
export const companyPublicOutput = companyOutput.pick({
  ...directory,
  externalLinks: true,
  location: true,
  founded: true,
  careersUrl: true,
});
export const personPublicOutput = personOutput.pick({
  ...identity,
  ...timestamps,
  bio: true,
  website: true,
  avatar: true,
  externalLinks: true,
});
export const educationPublicOutput = educationOutput.pick({ ...directory, type: true });
export const groupPublicOutput = groupOutput.pick({ ...directory, meetingFrequency: true });
export const productPublicOutput = productOutput
  .pick({ ...directory, type: true })
  .extend({ company: publicCompanyReference.nullable() })
  .strict();
export const projectPublicOutput = projectOutput.pick({
  ...identity,
  ...timestamps,
  description: true,
  links: true,
  type: true,
  status: true,
  logo: true,
  coverImage: true,
});
export const technologyPublicOutput = technologyOutput.pick({
  ...identity,
  ...timestamps,
  category: true,
  description: true,
  website: true,
  icon: true,
});
export const publicTechnologyReference = technologyOutput.pick({
  ...identity,
  category: true,
  icon: true,
});
export const publicEventDate = eventDateOutput.pick({
  startDate: true,
  endDate: true,
  isAllDay: true,
});
export const publicEventTag = eventTagOutput.pick({
  id: true,
  name: true,
  slug: true,
  color: true,
});
export const eventPublicOutput = eventOutput
  .pick({
    id: true,
    slug: true,
    ...timestamps,
    title: true,
    description: true,
    location: true,
    link: true,
    organizer: true,
    coverImage: true,
    iconImage: true,
    requiresSignup: true,
    timeMode: true,
    recurrenceRule: true,
    recurrenceStart: true,
    recurrenceEnd: true,
    defaultStartTime: true,
    defaultEndTime: true,
  })
  .extend({ dates: z.array(publicEventDate), tags: z.array(publicEventTag) })
  .strict();
export const jobPublicOutput = jobOutput
  .pick({
    id: true,
    slug: true,
    ...timestamps,
    title: true,
    description: true,
    location: true,
    department: true,
    workplaceType: true,
    salaryRange: true,
    url: true,
    postedAt: true,
    isTechnical: true,
  })
  .extend({ company: publicCompanyReference.nullable() })
  .strict();
export const newsPublicOutput = newsOutput.pick({
  id: true,
  slug: true,
  ...timestamps,
  type: true,
  title: true,
  externalUrl: true,
  sourceName: true,
  content: true,
  excerpt: true,
  coverImage: true,
  publishedAt: true,
});
export const companyPublicDetailOutput = companyPublicOutput
  .extend({
    technologies: z.array(publicTechnologyReference),
    products: z.array(productPublicOutput.omit({ company: true })),
  })
  .strict();
export const projectPublicDetailOutput = projectPublicOutput
  .extend({
    technologies: z.array(publicTechnologyReference),
    images: z.array(
      projectImageOutput.pick({ id: true, image: true, caption: true, sortOrder: true }),
    ),
  })
  .strict();
export const technologyPublicDetailOutput = technologyPublicOutput
  .extend({
    companies: z.array(publicCompanyReference),
    projects: z.array(projectPublicOutput.pick({ ...identity, logo: true })),
  })
  .strict();
const eventReference = eventOutput.pick({ id: true, slug: true, title: true, timeMode: true });
export const eventPublicDetailOutput = eventPublicOutput
  .extend({ parent: eventReference.nullable(), schedule: z.array(eventReference) })
  .strict();
