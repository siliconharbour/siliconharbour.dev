import { mappedFields } from "./declarations";
import type { ColumnCoverage } from "../coverage";
export const directoryCoverage: Record<string, Record<string, ColumnCoverage>> = {
  companies: {
    technlExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    technlLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    genesisExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    genesisLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    bounceExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    bounceLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    ...mappedFields(
      ["companyCreate", "companyUpdate"],
      [
        "description",
        "website",
        "careersUrl",
        "wikipedia",
        "linkedin",
        "github",
        "email",
        "location",
        "founded",
        "logo",
        "coverImage",
        "technl",
        "genesis",
        "bounce",
        "newsFilterInclude",
        "visible",
      ],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: { mapped: { companyCreate: "name", jobCreate: "companyName", companyUpdate: "name" } },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  groups: {
    ...mappedFields(
      ["groupCreate", "groupUpdate"],
      ["name", "description", "website", "meetingFrequency", "logo", "coverImage", "visible"],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  education: {
    technlExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    technlLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    genesisExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    genesisLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    bounceExternalId: { mapped: { directoryImport: "companies[].sourceId" } },
    bounceLastSeenAt: {
      excluded:
        "Recorded from the operation clock when a directory match is reconciled or imported",
    },
    ...mappedFields(
      ["educationCreate", "educationUpdate"],
      [
        "name",
        "description",
        "website",
        "type",
        "logo",
        "coverImage",
        "technl",
        "genesis",
        "bounce",
        "visible",
      ],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  people: {
    ...mappedFields(
      ["personCreate", "personUpdate"],
      ["name", "bio", "website", "github", "avatar", "socialLinks", "visible"],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  projects: {
    ...mappedFields(
      ["projectCreate", "projectUpdate"],
      ["name", "description", "links", "type", "status", "logo", "coverImage"],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  project_images: {
    ...mappedFields(["projectGalleryAdd"], ["image"]),
    ...mappedFields(["projectGalleryAdd", "projectGalleryUpdate"], ["caption"]),
    id: { excluded: "Generated identifier" },
    projectId: {
      mapped: { projectGalleryAdd: "id", projectGalleryUpdate: "id", projectGalleryReorder: "id" },
    },
    sortOrder: { mapped: { projectGalleryReorder: "imageIds[]" } },
    createdAt: { excluded: "Creation timestamp" },
  },
  products: {
    ...mappedFields(
      ["productCreate", "productUpdate"],
      ["name", "description", "website", "companyId", "type", "logo", "coverImage"],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  technologies: {
    ...mappedFields(
      ["technologyCreate", "technologyUpdate"],
      ["name", "category", "description", "website", "icon", "visible"],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  technology_assignments: {
    id: { excluded: "Generated identifier" },
    technologyId: {
      mapped: {
        companyTechnologiesSet: "technologyIds",
        companyCreate: "technologyIds",
        companyUpdate: "technologyIds",
        projectCreate: "technologyIds",
        projectUpdate: "technologyIds",
      },
    },
    contentType: { excluded: "Derived from the operation target and content type" },
    contentId: { excluded: "Derived from the operation target and content type" },
    source: { excluded: "Importer-owned provenance; evidence edits use technology_evidence" },
    sourceUrl: { excluded: "Importer-owned provenance; evidence edits use technology_evidence" },
    lastVerified: { excluded: "Importer-owned provenance; evidence edits use technology_evidence" },
    createdAt: { excluded: "Creation timestamp" },
  },
  technology_evidence: {
    id: { excluded: "Generated identifier" },
    technologyAssignmentId: { excluded: "Resolved from the company technology assignment" },
    jobId: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].jobIds",
        companyCreate: "evidenceGroups[].jobIds",
        companyUpdate: "evidenceGroups[].jobIds",
      },
    },
    sourceType: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].sourceType",
        companyCreate: "evidenceGroups[].sourceType",
        companyUpdate: "evidenceGroups[].sourceType",
      },
    },
    sourceUrl: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].sourceUrl",
        companyCreate: "evidenceGroups[].sourceUrl",
        companyUpdate: "evidenceGroups[].sourceUrl",
      },
    },
    excerptText: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].excerptText",
        companyCreate: "evidenceGroups[].excerptText",
        companyUpdate: "evidenceGroups[].excerptText",
      },
    },
    lastVerified: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].lastVerified",
        companyCreate: "evidenceGroups[].lastVerified",
        companyUpdate: "evidenceGroups[].lastVerified",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
  },
};
