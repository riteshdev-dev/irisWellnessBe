
import cors from "cors";
import express from "express";
import path from "node:path";
import winston from "winston";

import { authenticate } from "./middleware/authenticate.js";
import { documentAccessController } from "./controllers/portal.controller.js";
import { errorHandler } from "./middleware/errorHandler.js";
import adminRouter from "./routes/admin.routes.js";
import authRouter from "./routes/auth.routes.js";
import portalRouter from "./routes/portal.routes.js";
// import aiRoutes from "./routes/ai.routes.js";

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const coursePdfDir = path.resolve("public", "course");
const videoDir = path.resolve("public", "video");
const certificatesDir = path.resolve("public", "certificates");

// Winston Logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  }),
);
console.log("========== APP.TS LOADED ==========");
app.use(express.json({ limit: "256kb" }));
// app.use("/api/ai", aiRoutes);
app.use((req, res, next) => {
  console.log("BACKEND HIT:", req.method, req.originalUrl);
  next();
});

// REQUEST LOGGER - Routes se pehle
app.use((req, res, next) => {
  const startTime = Date.now();

  logger.info(`Request: ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    logger.info(
      `Response: ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${Date.now() - startTime}ms`
    );
  });

  next();
});

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Iris Wellness API is running",
  });
});

app.use("/course", authenticate, express.static(coursePdfDir));
app.use("/video", authenticate, express.static(videoDir));
app.use("/public/course", authenticate, express.static(coursePdfDir));
app.use("/public/video", authenticate, express.static(videoDir));

app.get(["/documents/:userFolder/:filename", "/public/documents/:userFolder/:filename"], authenticate, documentAccessController);

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", portalRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

app.use(errorHandler);

export default app;
