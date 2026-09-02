import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import ckycRouter from "./ckyc";
import dashboardRouter from "./dashboard";
import ckycDownloadsRouter from "./ckyc-downloads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(ckycRouter);
router.use(ckycDownloadsRouter);
router.use(dashboardRouter);

export default router;
