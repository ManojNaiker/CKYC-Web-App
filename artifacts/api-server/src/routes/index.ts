import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import ckycRouter from "./ckyc";
import dashboardRouter from "./dashboard";
import ckycDownloadsRouter from "./ckyc-downloads";
import ckycCreateDataRouter from "./ckyc-create-data";
import {
  auditMutationMiddleware,
  requireCurrentUser,
  requireWorkspacePermission,
} from "../middleware/auth";
import accessRouter from "./access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireCurrentUser);
router.use(requireWorkspacePermission);
router.use(auditMutationMiddleware);
router.use(clientsRouter);
router.use(ckycRouter);
router.use(ckycDownloadsRouter);
router.use(ckycCreateDataRouter);
router.use(dashboardRouter);
router.use(accessRouter);

export default router;
