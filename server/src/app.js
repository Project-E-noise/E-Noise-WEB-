import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

// Render (and most hosts) put the app behind a proxy. This makes req.ip the
// real visitor IP, which the rate limiter needs.
if (env.isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");

// Security headers. This is a JSON API, so the strict defaults are fine;
// cross-origin is allowed so the Vercel frontend can download CSV files.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS_ORIGIN is a comma-separated list. An entry may use one "*" for
// Vercel preview URLs, e.g. https://enoise-*.vercel.app
function originAllowed(origin) {
  return env.corsOrigins.some(allowed => {
    if (!allowed.includes("*")) return allowed === origin;
    const [start, end] = allowed.split("*");
    return origin.startsWith(start) && origin.endsWith(end) && !origin.slice(start.length, origin.length - end.length).includes("/");
  });
}

app.use(cors({
  // Requests without an Origin header (curl, the uptime pinger) are allowed;
  // browsers from other sites simply get no CORS headers and are blocked.
  origin: (origin, callback) => callback(null, !origin || originAllowed(origin)),
  exposedHeaders: ["Content-Disposition"]
}));

app.use(express.json({ limit: "100kb" }));

// Request logging. Tokens in query strings (email links) are hidden so
// they never end up in log files.
morgan.token("safe-url", req => req.originalUrl.replace(/([?&]token=)[^&]*/gi, "$1[hidden]"));
if (env.nodeEnv !== "test") {
  app.use(morgan(env.isProduction
    ? ':remote-addr ":method :safe-url" :status :res[content-length] - :response-time ms'
    : ":method :safe-url :status :response-time ms"));
}

// Used by the keep-alive pinger. It does not touch the database, so Neon
// can still go to sleep when nobody is using the app.
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
