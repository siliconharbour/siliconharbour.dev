import type { Route } from "./+types/login";
import { Form, redirect, useActionData } from "react-router";
import { login } from "~/lib/auth.server";
import { getSession, commitSession } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (session.get("sessionId")) {
    return redirect("/manage");
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const result = await login(email, password);
  if (!result) {
    return { error: "Invalid email or password" };
  }

  const session = await getSession(request);
  session.set("sessionId", result.sessionId);

  return redirect("/manage", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-center text-harbour-700">Login</h1>
        
        <Form method="post" className="flex flex-col gap-4">
          {actionData?.error && (
            <div className="p-3 bg-red-100 text-red-700 text-sm">
              {actionData.error}
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-harbour-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-harbour-700">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent"
            />
          </div>
          
          <button
            type="submit"
            className="py-2 px-4 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            Login
          </button>
        </Form>
      </div>
    </div>
  );
}
