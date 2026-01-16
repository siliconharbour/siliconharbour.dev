import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getPersonById, updatePerson } from "~/lib/people.server";
import { processAndSaveIconImage, deleteImage } from "~/lib/images.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.person?.name || "Person"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const person = await getPersonById(id);
  if (!person) {
    throw new Response("Person not found", { status: 404 });
  }

  let socialLinks: Record<string, string> = {};
  if (person.socialLinks) {
    try {
      socialLinks = JSON.parse(person.socialLinks);
    } catch {
      // ignore
    }
  }

  return { person, socialLinks };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid ID" };
  }

  const existing = await getPersonById(id);
  if (!existing) {
    return { error: "Person not found" };
  }

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const bio = formData.get("bio") as string;
  const website = (formData.get("website") as string) || null;
  const github = (formData.get("github") as string) || null;
  const twitter = (formData.get("twitter") as string) || null;
  const linkedin = (formData.get("linkedin") as string) || null;

  if (!name || !bio) {
    return { error: "Name and bio are required" };
  }

  let avatar: string | null | undefined = undefined;
  const avatarData = formData.get("avatarData") as string | null;
  const existingAvatar = formData.get("existingAvatar") as string | null;

  if (avatarData) {
    if (existing.avatar) await deleteImage(existing.avatar);
    const base64Data = avatarData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    avatar = await processAndSaveIconImage(buffer);
  } else if (existingAvatar) {
    avatar = existingAvatar;
  } else if (existing.avatar) {
    await deleteImage(existing.avatar);
    avatar = null;
  }

  const socialLinks: Record<string, string> = {};
  if (github) socialLinks.github = github;
  if (twitter) socialLinks.twitter = twitter;
  if (linkedin) socialLinks.linkedin = linkedin;

  await updatePerson(id, {
    name,
    bio,
    website,
    socialLinks: Object.keys(socialLinks).length > 0 ? JSON.stringify(socialLinks) : null,
    ...(avatar !== undefined && { avatar }),
  });

  return redirect("/manage/people");
}

export default function EditPerson() {
  const { person, socialLinks } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/people"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to People
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Person</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <input type="hidden" name="existingAvatar" value={person.avatar ?? ""} />

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-medium text-harbour-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={person.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="bio" className="font-medium text-harbour-700">
              Bio * (Markdown)
            </label>
            <textarea
              id="bio"
              name="bio"
              required
              rows={8}
              defaultValue={person.bio}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="font-medium text-harbour-700">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={person.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="font-medium text-harbour-700">Social Links</h3>
            
            <div className="flex flex-col gap-2">
              <label htmlFor="github" className="text-sm text-harbour-600">GitHub</label>
              <input
                type="url"
                id="github"
                name="github"
                placeholder="https://github.com/username"
                defaultValue={socialLinks.github ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="twitter" className="text-sm text-harbour-600">Twitter</label>
              <input
                type="url"
                id="twitter"
                name="twitter"
                placeholder="https://twitter.com/username"
                defaultValue={socialLinks.twitter ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="linkedin" className="text-sm text-harbour-600">LinkedIn</label>
              <input
                type="url"
                id="linkedin"
                name="linkedin"
                placeholder="https://linkedin.com/in/username"
                defaultValue={socialLinks.linkedin ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Person
          </button>
        </Form>
      </div>
    </div>
  );
}
