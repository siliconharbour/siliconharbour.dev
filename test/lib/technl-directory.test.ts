import { afterEach, expect, it, vi } from "vitest";
import { scrapeTechNL } from "~/lib/scraper.server";
import * as network from "~/lib/public-network-fetch.server";

const directory = `<html><body>
  <main><h3>Visible member</h3></main>
  <script>$_TSR.router=($R=>$R[0]={matches:[{l:$R[1]={members:$R[2]=[
    $R[3]={id:"50738",name:"AbbaTek Group Inc",member_type:"Tech Company",website:"https://www.abbatekgroup.com",logo_url:"https://technl.member365.ca/logo.jpg",description:"Research & development"},
    $R[4]={id:"50739",name:"Academy Canada",member_type:"Alliance Partners Membership",website:"https://www.academycanada.com/",logo_url:null,description:null},
    $R[5]={id:"50738",name:"AbbaTek Group Inc",member_type:"Tech Company",website:"https://www.abbatekgroup.com",logo_url:"https://technl.member365.ca/logo.jpg",description:"Research & development"}
  ],fetchedAt:1792804640404,complete:!0},ssr:!0}]})($R["tsr"])</script>
</body></html>`;

afterEach(() => vi.restoreAllMocks());

it("reads all loader members rather than only visible cards, preserving metadata and deduplicating IDs", async () => {
  const fetch = vi.spyOn(network, "publicFetch").mockResolvedValue(new Response(directory));
  expect(await scrapeTechNL()).toEqual([
    {
      name: "AbbaTek Group Inc",
      description: "Research & development",
      website: "https://www.abbatekgroup.com",
      email: null,
      logoUrl: "https://technl.member365.ca/logo.jpg",
      categories: ["Tech Company"],
      sourceUrl: "https://technl.ca/memberdirectory/",
      sourceId: "50738",
    },
    {
      name: "Academy Canada",
      description: null,
      website: "https://www.academycanada.com/",
      email: null,
      logoUrl: null,
      categories: ["Alliance Partners Membership"],
      sourceUrl: "https://technl.ca/memberdirectory/",
      sourceId: "50739",
    },
  ]);
  expect(fetch).toHaveBeenCalledWith("https://directory-display.lovable.app/");
});

it.each([
  ["a failed fetch", "", 503],
  ["a changed page layout", "<main>No loader data</main>", 200],
  ["a partial directory", directory.replace("complete:!0", "complete:!1"), 200],
  ["a missing member identity", directory.replace('id:"50739"', "id:null"), 200],
  [
    "executable values",
    directory.replace("description:null", 'description:fetch("https://example.com")'),
    200,
  ],
] as const)(
  "reports %s instead of returning a successful empty or partial import",
  async (_, html, status) => {
    const fetch = vi
      .spyOn(network, "publicFetch")
      .mockResolvedValue(new Response(html, { status }));
    await expect(scrapeTechNL()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
