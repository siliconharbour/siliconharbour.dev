import { parseExpressionAt, type Expression } from "acorn";
import { z } from "zod";
import { TECHNL_DIRECTORY_URL } from "./technl";
import { publicFetch } from "~/lib/public-network-fetch.server";
/**
 * Scraper utilities for importing company data from external directories.
 *
 * This is a one-time import tool - data is copied into the site and
 * no ongoing connection to the source is maintained.
 */

import { parseHTML } from "linkedom";

export interface ScrapedCompany {
  name: string;
  description: string | null;
  website: string | null;
  email: string | null;
  logoUrl: string | null;
  categories: string[];
  // Source metadata (for display during import, not stored)
  sourceUrl: string;
  sourceId: string;
}

const TECHNL_EMBED_URL = "https://directory-display.lovable.app/";
const technlDirectory = z.object({
  complete: z.literal(true),
  members: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      member_type: z.string().nullable(),
      description: z.string().nullable(),
      website: z.string().nullable(),
      logo_url: z.string().nullable(),
    }),
  ),
});

// Read only data expressions from the directory's serialized loader state; never execute scripts.
function readTechNLData(node: Expression): unknown {
  switch (node.type) {
    case "Literal":
      if (node.value === null || ["string", "number", "boolean"].includes(typeof node.value))
        return node.value;
      break;
    case "UnaryExpression":
      if (
        node.operator === "!" &&
        node.argument.type === "Literal" &&
        typeof node.argument.value === "number"
      )
        return !node.argument.value;
      break;
    case "AssignmentExpression":
      if (
        node.operator === "=" &&
        node.left.type === "MemberExpression" &&
        node.left.object.type === "Identifier" &&
        node.left.object.name === "$R" &&
        node.left.computed &&
        node.left.property.type === "Literal" &&
        typeof node.left.property.value === "number"
      )
        return readTechNLData(node.right);
      break;
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (!element || element.type === "SpreadElement")
          throw new Error("Unexpected TechNL member data");
        return readTechNLData(element);
      });
    case "ObjectExpression":
      return Object.fromEntries(
        node.properties.map((property) => {
          if (
            property.type !== "Property" ||
            property.kind !== "init" ||
            property.computed ||
            property.method ||
            property.key.type !== "Identifier"
          )
            throw new Error("Unexpected TechNL member data");
          return [property.key.name, readTechNLData(property.value)];
        }),
      );
  }
  throw new Error("Unexpected TechNL member data");
}

export async function scrapeTechNL(): Promise<ScrapedCompany[]> {
  const response = await publicFetch(TECHNL_EMBED_URL);
  if (!response.ok) throw new Error(`Failed to fetch TechNL directory: ${response.status}`);
  const { document } = parseHTML(await response.text());
  for (const script of document.querySelectorAll("script")) {
    const source = script.textContent ?? "";
    const start = source.search(/\{\s*members:/);
    if (start < 0) continue;
    const expression = parseExpressionAt(source, start, { ecmaVersion: "latest" });
    const state = expression.type === "SequenceExpression" ? expression.expressions[0] : expression;
    const data = technlDirectory.parse(readTechNLData(state));
    const unique = new Map(data.members.map((member) => [member.id, member]));
    return [...unique.values()].map((member) => ({
      name: member.name,
      description: member.description,
      website: member.website,
      email: null,
      logoUrl: member.logo_url,
      categories: member.member_type ? [member.member_type] : [],
      sourceUrl: TECHNL_DIRECTORY_URL,
      sourceId: member.id,
    }));
  }
  throw new Error("TechNL directory member data was not found; the source format may have changed");
}

const GENESIS_PORTFOLIO_URL = "https://www.genesiscentre.ca/portfolio";

/**
 * Fetch and parse company data from Genesis Centre portfolio
 */
export async function scrapeGenesis(): Promise<ScrapedCompany[]> {
  const response = await publicFetch(GENESIS_PORTFOLIO_URL, {
    headers: {
      "User-Agent": "siliconharbour.dev/1.0 (Community Directory Import)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Genesis portfolio: ${response.status}`);
  }

  const html = await response.text();
  const { document } = parseHTML(html);

  const companies: ScrapedCompany[] = [];
  const cards = document.querySelectorAll(".card.portfolio.w-dyn-item");

  for (const card of cards) {
    try {
      const company = parseGenesisCard(card);
      if (company) {
        companies.push(company);
      }
    } catch (e) {
      console.error("Failed to parse Genesis card:", e);
    }
  }

  return companies;
}

function parseGenesisCard(card: Element): ScrapedCompany | null {
  // Get company name from modal
  const nameElement = card.querySelector(".pop-card h2");
  const name = nameElement?.textContent?.trim() || "";
  if (!name) return null;

  // Get description from modal
  const descElement = card.querySelector(".pop-card .paragraph");
  const description = descElement?.textContent?.trim() || null;

  // Get website from modal
  const websiteLink = card.querySelector(".pop-card a[href]");
  let website = websiteLink?.getAttribute("href") || null;
  // Clean up website (some have "Visit Website >" text)
  if (website && !website.startsWith("http")) {
    website = null;
  }

  // Get logo URL
  const logoImg = card.querySelector(".logo-container .image-2");
  const logoUrl = logoImg?.getAttribute("src") || null;

  // Get sector from hidden field
  const sectorField = card.querySelector("[fs-list-field='sector']");
  const sector = sectorField?.textContent?.trim() || "";
  const categories = sector ? [sector] : [];

  // Get status (Current vs Alumni)
  const statusField = card.querySelector("[fs-list-field='status']");
  const status = statusField?.textContent?.trim() || "";
  if (status) {
    categories.push(status);
  }

  // Generate a simple source ID from the name
  const sourceId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    name,
    description,
    website,
    email: null, // Genesis doesn't expose emails
    logoUrl,
    categories,
    sourceUrl: GENESIS_PORTFOLIO_URL,
    sourceId,
  };
}

const BOUNCE_COMPANIES_URL = "https://bounceinnovation.ca/companies/";

/**
 * Fetch and parse company data from Bounce Health Innovation
 */
export async function scrapeBounce(): Promise<ScrapedCompany[]> {
  const response = await publicFetch(BOUNCE_COMPANIES_URL, {
    headers: {
      "User-Agent": "siliconharbour.dev/1.0 (Community Directory Import)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Bounce companies: ${response.status}`);
  }

  const html = await response.text();
  const { document } = parseHTML(html);

  // Company links are in h2 > a elements pointing to /company/{slug}/
  const companyLinks = document.querySelectorAll('h2 > a[href*="/company/"]');
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const link of companyLinks) {
    try {
      const name = (link.textContent || "").trim();
      const href = link.getAttribute("href") || "";
      if (!name || !href.includes("/company/")) continue;

      // Deduplicate — the page renders each company twice (card + expanded)
      const slug = href.replace(/.*\/company\//, "").replace(/\/$/, "");
      if (seen.has(slug)) continue;
      seen.add(slug);

      const company = await parseBounceCompanyDetail(name, href, slug);
      if (company) companies.push(company);
    } catch (e) {
      console.error("Failed to parse Bounce company:", e);
    }
  }

  return companies;
}

async function parseBounceCompanyDetail(
  name: string,
  detailUrl: string,
  slug: string,
): Promise<ScrapedCompany | null> {
  try {
    const response = await publicFetch(detailUrl, {
      headers: {
        "User-Agent": "siliconharbour.dev/1.0 (Community Directory Import)",
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const { document } = parseHTML(html);

    // Website link: elementor button with "Website" text
    let website: string | null = null;
    const buttons = document.querySelectorAll("a.elementor-button");
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim();
      if (text === "Website") {
        website = btn.getAttribute("href") || null;
        break;
      }
    }

    // Industry: h5 element text
    const industryEl = document.querySelector("h5");
    const industry = industryEl ? (industryEl.textContent || "").trim() : null;
    const categories = industry ? [industry] : [];

    // Description: longest paragraph that isn't boilerplate
    let description: string | null = null;
    const allParagraphs = document.querySelectorAll("p");
    let bestDesc = "";
    for (const p of allParagraphs) {
      const text = (p.textContent || "").trim();
      // Skip short, boilerplate, or social media text
      if (text.length < 30) continue;
      if (text.startsWith("©") || text.includes("Facebook") || text.includes("Instagram")) continue;
      if (text.includes("Bounce helps HealthTech")) continue; // site boilerplate
      if (text.length > bestDesc.length) bestDesc = text;
    }
    if (bestDesc) description = bestDesc.slice(0, 500);

    // Logo: first wp-content image
    let logoUrl: string | null = null;
    const images = document.querySelectorAll("img");
    for (const img of images) {
      const src = img.getAttribute("src") || "";
      if (
        src.includes("wp-content/uploads") &&
        !src.includes("Logo.webp") &&
        !src.includes("bounce-logo")
      ) {
        logoUrl = src;
        break;
      }
    }

    return {
      name,
      description,
      website,
      email: null,
      logoUrl,
      categories,
      sourceUrl: detailUrl,
      sourceId: slug,
    };
  } catch {
    return null;
  }
}
