import { createCookieSessionStorage, redirect } from "react-router";
import { validateSession, invalidateSession } from "./auth.server";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function commitSession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.commitSession(session);
}

export async function destroySession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.destroySession(session);
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  const sessionId = session.get("sessionId");

  if (!sessionId) {
    throw redirect("/manage/login");
  }

  const result = await validateSession(sessionId);
  if (!result) {
    throw redirect("/manage/login", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  return result;
}

export async function getOptionalUser(request: Request) {
  const session = await getSession(request);
  const sessionId = session.get("sessionId");

  if (!sessionId) {
    return null;
  }

  return validateSession(sessionId);
}

export async function logout(request: Request) {
  const session = await getSession(request);
  const sessionId = session.get("sessionId");

  if (sessionId) {
    await invalidateSession(sessionId);
  }

  return redirect("/manage/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
