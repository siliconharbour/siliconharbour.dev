import { CompanyCard } from "~/components/directory/CompanyCard";
import type { Route } from "./+types/companies";
import { useLoaderData } from "react-router";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getOptionalUser } from "~/lib/session.server";
import { DirectoryListPage } from "~/components/directory/DirectoryListPage";
import { parsePublicListParams } from "~/lib/public-query.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "Tech Companies in St. John's, NL",
    description:
      "Directory of technology companies in St. John's, Newfoundland & Labrador. Find local software companies, startups, and tech employers.",
    url: "/directory/companies",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const { items, total } = await getPaginatedCompanies(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

export default function DirectoryCompanies() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <DirectoryListPage
      isAdmin={isAdmin}
      adminCreateTo="/manage/companies/new"
      adminCreateLabel="New Company"
      searchPlaceholder="Search companies..."
      searchQuery={searchQuery}
      total={total}
      limit={limit}
      offset={offset}
      emptyMessage="No companies listed yet."
      emptySearchMessage="No companies match your search."
      hasItems={items.length > 0}
    >
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gap-4">
          {items.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      </>
    </DirectoryListPage>
  );
}
