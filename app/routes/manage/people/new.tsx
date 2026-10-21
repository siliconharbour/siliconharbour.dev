import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { createPerson } from "~/lib/people.server";
import { processAndSaveIconImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Person - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

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

  let avatar: string | null = null;
  const avatarData = formData.get("avatarData") as string | null;

  if (avatarData) {
    const base64Data = avatarData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    avatar = await processAndSaveIconImage(buffer);
  }

  // Store twitter/linkedin in socialLinks, github is now first-class
  const socialLinks: Record<string, string> = {};
  if (twitter) socialLinks.twitter = twitter;
  if (linkedin) socialLinks.linkedin = linkedin;

  await createPerson({
    name,
    bio,
    website,
    github,
    avatar,
    socialLinks: Object.keys(socialLinks).length > 0 ? JSON.stringify(socialLinks) : null,
  });

  return redirect("/manage/people");
}

export default function NewPerson() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/people" className="text-sm text-subtle hover:text-body">
            &larr; Back to People
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Person</h1>

        {actionData?.error && (
          <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ImageUpload
            label="Avatar"
            name="avatarData"
            aspect={1}
            previewStyle="square"
            helpText="Upload avatar (1:1)"
          />

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="name" className="font-medium text-heading">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="bio" className="font-medium text-heading">
              Bio * (Markdown)
            </label>
            <textarea
              id="bio"
              name="bio"
              required
              rows={8}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="website" className="font-medium text-heading">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-4">
            <h3 className="font-medium text-heading">Social Links</h3>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="github" className="text-sm text-body">
                GitHub
              </label>
              <input
                type="url"
                id="github"
                name="github"
                placeholder="https://github.com/username"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="twitter" className="text-sm text-body">
                Twitter
              </label>
              <input
                type="url"
                id="twitter"
                name="twitter"
                placeholder="https://twitter.com/username"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="linkedin" className="text-sm text-body">
                LinkedIn
              </label>
              <input
                type="url"
                id="linkedin"
                name="linkedin"
                placeholder="https://linkedin.com/in/username"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Create Person
          </button>
        </Form>
      </div>
    </div>
  );
}
