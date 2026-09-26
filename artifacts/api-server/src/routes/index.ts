import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import ckycRouter from "./ckyc";
import dashboardRouter from "./dashboard";
import ckycDownloadsRouter from "./ckyc-downloads";
import ckycCreateDataRouter from "./ckyc-create-data";
import finfluxRouter from "./finflux";
import authRouter, { publicAuthRouter } from "./auth";
import adminRouter from "./admin";
import { auditApiActivity } from "../middlewares/auditApiMutations";
import {
  authorizeAppUser,
  resolveAppUser,
} from "../middlewares/appAccess";

const router: IRouter = Router();

router.use(healthRouter);
// Login/logout are intentionally public; /auth/me is protected by its own session check.
router.use(publicAuthRouter);
router.use(resolveAppUser);
router.use(auditApiActivity);
router.use(authorizeAppUser);
router.use(authRouter);
router.use(adminRouter);
router.use(clientsRouter);
router.use(ckycRouter);
router.use(ckycDownloadsRouter);
router.use(ckycCreateDataRouter);
router.use(finfluxRouter);
router.use(dashboardRouter);

export default router;
