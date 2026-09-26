import { Router, type IRouter } from "express";
import type { CurrentAppUserResponse } from "@workspace/api-zod";
import { toAppUserResponse } from "../lib/app-users";
import type { AppUser } from "@workspace/db";

const router: IRouter = Router();

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