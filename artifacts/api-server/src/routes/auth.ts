import { Router, type IRouter } from "express";
import type { CurrentAppUserResponse } from "@workspace/api-zod";
import { toAppUserResponse } from "../lib/app-users";
import type { AppUser } from "@workspace/db";
import {
  authenticateLocal,
  createSession,
  revokeSession,
  resolveSession,
  SESSION_COOKIE,
} from "../lib/local-auth";

const router: IRouter = Router();
export const publicAuthRouter: IRouter = Router();
let authConfigurationWarningLogged = false;

publicAuthRouter.post("/auth/login", async (req, res): Promise<void> => {
  const configured = process.env.CKYC_ADMIN_PASSWORD;
  const adminPasswordPresent = Boolean(configured);
  const sessionSecret = process.env.SESSION_SECRET;
  const sessionSecretPresent = Boolean(sessionSecret);
  const sessionSecretLengthValid = Boolean(sessionSecret && sessionSecret.length >= 32);
  const sessionSecretReady = sessionSecretPresent && sessionSecretLengthValid;
  if (!adminPasswordPresent || !sessionSecretReady) {
    if (!authConfigurationWarningLogged) {
      req.log.warn(
        {
          adminPasswordPresent,
          sessionSecretPresent,
          sessionSecretLengthValid,
        },
        "Local Admin login configuration is incomplete",
      );
      authConfigurationWarningLogged = true;
    }
    res.status(503).json({ error: "Authentication is temporarily unavailable." });
    return;
  }
  try {
    const user = await authenticateLocal(req.body?.username, req.body?.password, req);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }
    // Rotate an existing session before issuing a fresh one.
    if (new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=`).test(req.headers.cookie ?? "")) {
      await revokeSession(req, res);
    }
    await createSession(user, res);
    res.json({ user: toAppUserResponse(user) });
  } catch (error) {
    req.log.error({ err: error }, "Local login failed");
    res.status(503).json({ error: "Authentication is temporarily unavailable." });
  }
});

publicAuthRouter.post("/auth/logout", async (req, res): Promise<void> => {
  try {
    if (
      (req.headers.cookie ?? "").includes(`${SESSION_COOKIE}=`) &&
      !(await resolveSession(req))
    ) {
      res.status(403).json({ error: "CSRF validation failed." });
      return;
    }
    await revokeSession(req, res);
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Local logout failed");
    res.status(503).json({ error: "Authentication is temporarily unavailable." });
  }
});

router.get("/auth/me", (req, res): void => {
  const user = res.locals.appUser as AppUser | undefined;
  if (!user) {
    res.status(401).json({ error: "Sign in to access this workspace." });
    return;
  }
  const response: CurrentAppUserResponse = {
    user: toAppUserResponse(user),
  };
  res.json(response);
});

export default router;