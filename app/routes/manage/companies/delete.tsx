import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getCompanyById, deleteCompany } from "~/lib/companies.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.company?.name || "Company"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "company");

  const company = await getCompanyById(id);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  return { company };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "company");

  await deleteCompany(id);
  return redirect("/manage/companies");
}

export default function DeleteCompany() {
  const { company } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Company"
      message={
        <>
          Are you sure you want to delete <strong>{company.name}</strong>? This action cannot be
          undone.
        </>
      }
    >
      <Form method="post" className="flex gap-gap-4">
        <button
          type="submit"
          className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/companies"
          className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
