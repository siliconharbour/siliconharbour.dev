import { blockItem } from "./import-blocklist.server";
import { normalizeBlockKey } from "./import-blocklist-key";
import { getAllPeople, deletePerson } from "./people.server";
import { getAllCompanies, deleteCompany } from "./companies.server";
import { getAllEducation, deleteEducation } from "./education.server";
export async function blockImportedIdentity(input: {
  source: string;
  externalId: string;
  name: string;
  reason?: string | null;
  deleteExisting: boolean;
}) {
  const key = normalizeBlockKey(input.source, input.externalId);
  blockItem(input.source, key, input.name, input.reason ?? undefined);
  const deletedIds: number[] = [];
  if (input.deleteExisting) {
    if (input.source === "github") {
      for (const person of await getAllPeople(true))
        if (
          person.externalLinks?.github &&
          normalizeBlockKey("github", person.externalLinks?.github) === key
        ) {
          await deletePerson(person.id);
          deletedIds.push(person.id);
        }
    } else {
      for (const company of await getAllCompanies(true))
        if (normalizeBlockKey(input.source, company.website || company.name) === key) {
          await deleteCompany(company.id);
          deletedIds.push(company.id);
        }
      for (const school of await getAllEducation(true))
        if (normalizeBlockKey(input.source, school.website || school.name) === key) {
          await deleteEducation(school.id);
          deletedIds.push(school.id);
        }
    }
  }
  return { blocked: true as const, key, deletedIds };
}
