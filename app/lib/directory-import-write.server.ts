import {
  directoryRecords,
  matchDirectoryRecord,
  recordDirectoryObservation,
  sourceTrackingFields,
} from "./directory-source-review.server";
import { updateEducation } from "./education.server";
import {
  getAllCompanies,
  getCompanyByName,
  createCompany,
  updateCompany,
} from "./companies.server";
import { fetchPublicImage } from "./public-image-fetch.server";
import { processAndSaveIconImageWithPadding } from "./images.server";
import { deleteUnreferencedImages } from "./entity-images.server";
import { getBlockedExternalIds } from "./import-blocklist.server";
import { normalizeUrl, getExternalId } from "./directory-import";
import { directoryImportConfigs } from "./directory-import-config.server";
import type { ScrapedCompany } from "./scraper.server";
import { NotFoundError } from "~/operations/errors";
export async function importDirectoryCompanies(
  source: keyof typeof directoryImportConfigs,
  companies: ScrapedCompany[],
  downloadLogos: boolean,
  now = new Date(),
) {
  const config = directoryImportConfigs[source];
  const imported: string[] = [];
  const errors: string[] = [];
  const blocked = await getBlockedExternalIds(source);
  const records = await directoryRecords();
  const tracking = sourceTrackingFields(source);
  for (const company of companies) {
    let logo: string | null = null;
    try {
      if (blocked.has(getExternalId(company))) {
        imported.push(`${company.name} (blocked)`);
        continue;
      }
      const match = matchDirectoryRecord(records, source, company);
      if (match) {
        if (match.type === "company")
          await updateCompany(match.row.id, { [config.sourceFlag]: true });
        else await updateEducation(match.row.id, { [config.sourceFlag]: true });
        recordDirectoryObservation(
          { type: match.type, id: match.row.id },
          source,
          company.sourceId,
          now,
        );
        if (company.sourceId) match.row[tracking.externalId] = company.sourceId;
        match.row[tracking.lastSeenAt] = now;
        imported.push(`${match.row.name} (marked ${config.sourceLabel})`);
        continue;
      }
      if (downloadLogos && company.logoUrl)
        logo = await processAndSaveIconImageWithPadding(await fetchPublicImage(company.logoUrl));
      const created = await createCompany({
        name: company.name,
        description: company.description ?? "",
        website: company.website,
        email: company.email,
        location: config.defaultLocation,
        logo,
        [config.sourceFlag]: true,
        visible: false,
      });
      recordDirectoryObservation(
        { type: "company", id: created.id },
        source,
        company.sourceId,
        now,
      );
      records.push({
        type: "company",
        row: {
          ...created,
          [tracking.externalId]: company.sourceId || null,
          [tracking.lastSeenAt]: now,
        },
      });
      imported.push(company.name);
    } catch (error) {
      await deleteUnreferencedImages([logo]);
      errors.push(`${company.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { imported, errors };
}
export async function adoptDirectoryField(input: {
  name: string;
  companyWebsite?: string | null;
  field: "website" | "description" | "email";
  value: string;
}) {
  let company = await getCompanyByName(input.name);
  if (!company && input.companyWebsite) {
    const key = normalizeUrl(input.companyWebsite);
    company =
      (await getAllCompanies(true)).find(
        (row) => row.website && normalizeUrl(row.website) === key,
      ) ?? null;
  }
  if (!company) throw new NotFoundError(`Company "${input.name}" not found`);
  await updateCompany(company.id, { [input.field]: input.value });
  return { name: company.name, field: input.field };
}
