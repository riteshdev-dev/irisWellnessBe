import { Router } from "express";
import {
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  resetPasswordController,
  sendOtpController,
  signupController,
  updateProfileController,
  verifyOtpController,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../middleware/rateLimit.js";

const authRouter = Router();
const fifteenMinutes = 15 * 60 * 1000;

authRouter.post("/signup", rateLimit("signup", 10, fifteenMinutes), signupController);
authRouter.post("/register", rateLimit("signup", 10, fifteenMinutes), signupController);
authRouter.post("/login", rateLimit("login", 12, fifteenMinutes), loginController);
authRouter.post("/send-otp", rateLimit("send-otp", 10, fifteenMinutes), sendOtpController);
authRouter.post("/resend-otp", rateLimit("send-otp", 10, fifteenMinutes), sendOtpController);
authRouter.post("/verify-otp", rateLimit("verify-otp", 20, fifteenMinutes), verifyOtpController);
authRouter.post("/forgot-password", rateLimit("forgot-password", 8, fifteenMinutes), forgotPasswordController);
authRouter.post("/reset-password", rateLimit("reset-password", 10, fifteenMinutes), resetPasswordController);
authRouter.get("/me", authenticate, meController);
authRouter.patch("/me", authenticate, updateProfileController);
authRouter.post("/logout", logoutController);

export default authRouter;
