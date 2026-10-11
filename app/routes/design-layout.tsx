import { Outlet, useLoaderData } from "react-router";
import { Header } from "~/components/Header";
import { getSectionVisibility } from "~/lib/config.server";
import { ThemeEditor } from "~/theme/editor";

export async function loader() {
  return { visibility: await getSectionVisibility() };
}

export default function DesignLayout() {
  const { visibility } = useLoaderData<typeof loader>();
  return (
    <div className="design-shell">
      <Header visibility={visibility} />
      <div className="design-workspace">
        <main className="design-preview">
          <Outlet />
        </main>
        <ThemeEditor docked />
      </div>
    </div>
  );
}
