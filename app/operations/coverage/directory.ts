import type { ColumnCoverage } from "../coverage";
export const directoryCoverage: Record<string, Record<string, ColumnCoverage>> = {
  companies: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        companyCreate: "name",
        companyUpdate: "name",
      },
    },
    description: {
      mapped: {
        companyCreate: "description",
        companyUpdate: "description",
      },
    },
    website: {
      mapped: {
        companyCreate: "website",
        companyUpdate: "website",
      },
    },
    careersUrl: {
      mapped: {
        companyCreate: "careersUrl",
        companyUpdate: "careersUrl",
      },
    },
    wikipedia: {
      mapped: {
        companyCreate: "wikipedia",
        companyUpdate: "wikipedia",
      },
    },
    linkedin: {
      mapped: {
        companyCreate: "linkedin",
        companyUpdate: "linkedin",
      },
    },
    github: {
      mapped: {
        companyCreate: "github",
        companyUpdate: "github",
      },
    },
    email: {
      mapped: {
        companyCreate: "email",
        companyUpdate: "email",
      },
    },
    location: {
      mapped: {
        companyCreate: "location",
        companyUpdate: "location",
      },
    },
    founded: {
      mapped: {
        companyCreate: "founded",
        companyUpdate: "founded",
      },
    },
    logo: {
      mapped: {
        companyCreate: "logo",
        companyUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        companyCreate: "coverImage",
        companyUpdate: "coverImage",
      },
    },
    technl: {
      mapped: {
        companyCreate: "technl",
        companyUpdate: "technl",
      },
    },
    genesis: {
      mapped: {
        companyCreate: "genesis",
        companyUpdate: "genesis",
      },
    },
    bounce: {
      mapped: {
        companyCreate: "bounce",
        companyUpdate: "bounce",
      },
    },
    newsFilterInclude: {
      mapped: {
        companyCreate: "newsFilterInclude",
        companyUpdate: "newsFilterInclude",
      },
    },
    visible: {
      mapped: {
        companyCreate: "visible",
        companyUpdate: "visible",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  groups: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        groupCreate: "name",
        groupUpdate: "name",
      },
    },
    description: {
      mapped: {
        groupCreate: "description",
        groupUpdate: "description",
      },
    },
    website: {
      mapped: {
        groupCreate: "website",
        groupUpdate: "website",
      },
    },
    meetingFrequency: {
      mapped: {
        groupCreate: "meetingFrequency",
        groupUpdate: "meetingFrequency",
      },
    },
    logo: {
      mapped: {
        groupCreate: "logo",
        groupUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        groupCreate: "coverImage",
        groupUpdate: "coverImage",
      },
    },
    visible: {
      mapped: {
        groupCreate: "visible",
        groupUpdate: "visible",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  education: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        educationCreate: "name",
        educationUpdate: "name",
      },
    },
    description: {
      mapped: {
        educationCreate: "description",
        educationUpdate: "description",
      },
    },
    website: {
      mapped: {
        educationCreate: "website",
        educationUpdate: "website",
      },
    },
    type: {
      mapped: {
        educationCreate: "type",
        educationUpdate: "type",
      },
    },
    logo: {
      mapped: {
        educationCreate: "logo",
        educationUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        educationCreate: "coverImage",
        educationUpdate: "coverImage",
      },
    },
    technl: {
      mapped: {
        educationCreate: "technl",
        educationUpdate: "technl",
      },
    },
    genesis: {
      mapped: {
        educationCreate: "genesis",
        educationUpdate: "genesis",
      },
    },
    bounce: {
      mapped: {
        educationCreate: "bounce",
        educationUpdate: "bounce",
      },
    },
    visible: {
      mapped: {
        educationCreate: "visible",
        educationUpdate: "visible",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  people: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        personCreate: "name",
        personUpdate: "name",
      },
    },
    bio: {
      mapped: {
        personCreate: "bio",
        personUpdate: "bio",
      },
    },
    website: {
      mapped: {
        personCreate: "website",
        personUpdate: "website",
      },
    },
    github: {
      mapped: {
        personCreate: "github",
        personUpdate: "github",
      },
    },
    avatar: {
      mapped: {
        personCreate: "avatar",
        personUpdate: "avatar",
      },
    },
    socialLinks: {
      mapped: {
        personCreate: "socialLinks",
        personUpdate: "socialLinks",
      },
    },
    visible: {
      mapped: {
        personCreate: "visible",
        personUpdate: "visible",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  projects: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        projectCreate: "name",
        projectUpdate: "name",
      },
    },
    description: {
      mapped: {
        projectCreate: "description",
        projectUpdate: "description",
      },
    },
    links: {
      mapped: {
        projectCreate: "links",
        projectUpdate: "links",
      },
    },
    type: {
      mapped: {
        projectCreate: "type",
        projectUpdate: "type",
      },
    },
    status: {
      mapped: {
        projectCreate: "status",
        projectUpdate: "status",
      },
    },
    logo: {
      mapped: {
        projectCreate: "logo",
        projectUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        projectCreate: "coverImage",
        projectUpdate: "coverImage",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  project_images: {
    id: {
      excluded: "Generated identifier",
    },
    projectId: {
      mapped: {
        projectGalleryAdd: "id",
      },
    },
    image: {
      mapped: {
        projectGalleryAdd: "image",
      },
    },
    caption: {
      mapped: {
        projectGalleryAdd: "caption",
      },
    },
    sortOrder: {
      excluded: "Appended after the existing project gallery images",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  products: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        productCreate: "name",
        productUpdate: "name",
      },
    },
    description: {
      mapped: {
        productCreate: "description",
        productUpdate: "description",
      },
    },
    website: {
      mapped: {
        productCreate: "website",
        productUpdate: "website",
      },
    },
    companyId: {
      mapped: {
        productCreate: "companyId",
        productUpdate: "companyId",
      },
    },
    type: {
      mapped: {
        productCreate: "type",
        productUpdate: "type",
      },
    },
    logo: {
      mapped: {
        productCreate: "logo",
        productUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        productCreate: "coverImage",
        productUpdate: "coverImage",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  technologies: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    name: {
      mapped: {
        technologyCreate: "name",
        technologyUpdate: "name",
      },
    },
    category: {
      mapped: {
        technologyCreate: "category",
        technologyUpdate: "category",
      },
    },
    description: {
      mapped: {
        technologyCreate: "description",
        technologyUpdate: "description",
      },
    },
    website: {
      mapped: {
        technologyCreate: "website",
        technologyUpdate: "website",
      },
    },
    icon: {
      mapped: {
        technologyCreate: "icon",
        technologyUpdate: "icon",
      },
    },
    visible: {
      mapped: {
        technologyCreate: "visible",
        technologyUpdate: "visible",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  technology_assignments: {
    id: {
      excluded: "Generated identifier",
    },
    technologyId: {
      mapped: {
        companyTechnologiesSet: "technologyIds",
        companyCreate: "technologyIds",
        companyUpdate: "technologyIds",
        projectCreate: "technologyIds",
        projectUpdate: "technologyIds",
      },
    },
    contentType: {
      excluded: "Derived from the operation target and content type",
    },
    contentId: {
      excluded: "Derived from the operation target and content type",
    },
    source: {
      excluded: "Importer-owned provenance; evidence edits use technology_evidence",
    },
    sourceUrl: {
      excluded: "Importer-owned provenance; evidence edits use technology_evidence",
    },
    lastVerified: {
      excluded: "Importer-owned provenance; evidence edits use technology_evidence",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  technology_evidence: {
    id: {
      excluded: "Generated identifier",
    },
    technologyAssignmentId: {
      excluded: "Resolved from the company technology assignment",
    },
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
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
};
