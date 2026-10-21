import type { Route } from "./+types/login";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { login } from "~/lib/auth.server";
import { getSession, commitSession } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Login - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const session = await getSession(request);
  if (session.get("sessionId")) {
    return redirect(returnTo);
  }
  return { returnTo };
}

function safeReturnTo(value: FormDataEntryValue | string | null): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/manage";
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const result = await login(email, password);
  if (!result) {
    return { error: "Invalid email or password" };
  }

  const session = await getSession(request);
  session.set("sessionId", result.sessionId);

  return redirect(returnTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const { returnTo } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-pad-4">
      <div className="w-full max-w-sm flex flex-col gap-gap-6">
        <h1 className="text-2xl font-semibold text-center text-heading">Login</h1>

        <Form method="post" className="flex flex-col gap-gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          {actionData?.error && (
            <div className="p-pad-3 bg-red-100 text-red-700 text-sm">{actionData.error}</div>
          )}

          <div className="flex flex-col gap-gap-1">
            <label htmlFor="email" className="text-sm font-medium text-heading">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-gap-1">
            <label htmlFor="password" className="text-sm font-medium text-heading">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              className="px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            className="py-pad-2 px-pad-4 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            Login
          </button>
        </Form>
      </div>
    </div>
  );
}
