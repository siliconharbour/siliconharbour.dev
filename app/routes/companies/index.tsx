import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getAllCompanies } from "~/lib/companies.server";
import { PublicLayout } from "~/components/PublicLayout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Companies - siliconharbour.dev" },
    { name: "description", content: "Tech companies in St. John's" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const companies = await getAllCompanies();
  return { companies };
}

export default function CompaniesIndex() {
  const { companies } = useLoaderData<typeof loader>();

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto p-4 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Companies</h1>
            <p className="text-harbour-500">Tech companies in the community</p>
          </div>

          {companies.length === 0 ? (
            <p className="text-harbour-400">No companies listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companies.map((company) => (
                <a
                  key={company.id}
                  href={`/companies/${company.slug}`}
                  className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
                >
                  {company.logo && (
                    <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100">
                      <img
                        src={`/images/${company.logo}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                      {company.name}
                    </h2>
                    {company.location && (
                      <p className="text-sm text-harbour-400">{company.location}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
