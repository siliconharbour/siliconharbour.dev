import type { Company } from "~/db/schema";

export function CompanyCard({
  company,
}: {
  company: Pick<Company, "slug" | "name" | "logo" | "location">;
}) {
  return (
    <a
      href={`/directory/companies/${company.slug}`}
      className="group flex flex-col gap-gap-3 p-pad-4 card-link"
    >
      {company.logo ? (
        <div className="w-16 h-16 relative overflow-hidden">
          <img
            src={`/images/${company.logo}`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-16 h-16 bg-tint flex items-center justify-center">
          <span className="text-2xl text-subtle">{company.name.charAt(0)}</span>
        </div>
      )}
      <div className="flex flex-col gap-gap-1">
        <h2 className="link-title font-semibold text-heading group-hover:text-body">
          {company.name}
        </h2>
        {company.location && <p className="text-sm text-subtle">{company.location}</p>}
      </div>
    </a>
  );
}
