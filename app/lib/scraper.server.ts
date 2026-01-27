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

// =============================================================================
// TechNL Scraper
// =============================================================================

const TECHNL_DIRECTORY_URL = "https://members.technl.ca/memberdirectory/FindStartsWith?term=%23%21";

/**
 * Fetch and parse company data from TechNL member directory
 */
export async function scrapeTechNL(): Promise<ScrapedCompany[]> {
  const response = await fetch(TECHNL_DIRECTORY_URL, {
    headers: {
      "User-Agent": "siliconharbour.dev/1.0 (Community Directory Import)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch TechNL directory: ${response.status}`);
  }

  const html = await response.text();
  const { document } = parseHTML(html);

  const companies: ScrapedCompany[] = [];
  const cards = document.querySelectorAll(".gz-directory-card");

  for (const card of cards) {
    try {
      const company = parseTechNLCard(card);
      if (company) {
        companies.push(company);
      }
    } catch (e) {
      console.error("Failed to parse TechNL card:", e);
    }
  }

  return companies;
}

function parseTechNLCard(card: Element): ScrapedCompany | null {
  // Get company name
  const nameLink = card.querySelector(".gz-card-title a");
  if (!nameLink) return null;

  const name = nameLink.textContent?.trim() || "";
  if (!name) return null;

  // Get detail URL and hash
  const detailHref = nameLink.getAttribute("href") || "";
  const hash = card.getAttribute("hash") || "";
  const sourceUrl = detailHref.startsWith("//") ? `https:${detailHref}` : detailHref;

  // Get logo URL
  const logoImg = card.querySelector(".card-header img");
  const logoUrl = logoImg?.getAttribute("src") || null;

  // Get website
  const websiteLink = card.querySelector(".gz-card-website a");
  const website = websiteLink?.getAttribute("href") || null;

  // Get categories
  const categoryElements = card.querySelectorAll(".gz-cat");
  const categories: string[] = [];
  for (const cat of categoryElements) {
    const catText = cat.textContent?.trim();
    if (catText) categories.push(catText);
  }

  // TechNL uses contact forms, not direct emails
  // We'd need to scrape individual pages for actual emails
  const email: string | null = null;

  return {
    name,
    description: null, // Would need to fetch detail page for full description
    website,
    email,
    logoUrl,
    categories,
    sourceUrl,
    sourceId: hash,
  };
}

// =============================================================================
// Genesis Scraper
// =============================================================================

const GENESIS_PORTFOLIO_URL = "https://www.genesiscentre.ca/portfolio";

/**
 * Fetch and parse company data from Genesis Centre portfolio
 */
export async function scrapeGenesis(): Promise<ScrapedCompany[]> {
  const response = await fetch(GENESIS_PORTFOLIO_URL, {
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

// =============================================================================
// Image Utilities
// =============================================================================

/**
 * Download an image from a URL and return it as a buffer
 */
export async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "siliconharbour.dev/1.0 (Community Directory Import)",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${url} - ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error(`Error fetching image: ${url}`, e);
    return null;
  }
}
