import { Router } from "express";
import { adminSessionController } from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const adminRouter = Router();

adminRouter.get("/session", authenticate, authorize("ADMIN"), adminSessionController);

export default adminRouter;
