import type { Route } from "./+types/public-layout";
import { Outlet, useLoaderData } from "react-router";
import { getSectionVisibility, type SectionVisibility } from "~/lib/config.server";
import { Footer } from "~/components/Footer";
import { Header } from "~/components/Header";

export async function loader({}: Route.LoaderArgs) {
  const visibility = await getSectionVisibility();
  return { visibility };
}

export default function PublicLayoutRoute() {
  const { visibility } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col">
      <Header visibility={visibility} />

      <main className="flex-1">
        <Outlet context={{ visibility }} />
      </main>

      <Footer />
    </div>
  );
}

// Hook for child routes to access visibility
export function useVisibility(): SectionVisibility {
  // This will be used by child routes via useOutletContext
  // Import from react-router: useOutletContext
  return {} as SectionVisibility; // Placeholder - actual usage via useOutletContext
}
