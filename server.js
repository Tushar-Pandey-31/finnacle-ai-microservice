import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

const app = express();

// CORS: allow only configured origins if provided, otherwise allow all (dev-friendly)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // non-browser or same-origin
    if (allowedOrigins.length === 0) return callback(null, true); // permissive if unset
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

function requireEnv(key) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
  return process.env[key];
}

// Simple request id for logs
app.use((req, _res, next) => {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

// API key middleware for protected endpoints
function apiKeyMiddleware(req, res, next) {
  try {
    const expected = requireEnv("AI_SERVICE_KEY");
    const provided = req.headers["x-api-key"];
    if (!provided || provided !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePortfolioInput(portfolio) {
  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    return "`portfolio` must be a non-empty array";
  }
  for (const item of portfolio) {
    if (!item || typeof item !== "object") return "Each portfolio item must be an object";
    if (!isNonEmptyString(item.symbol)) return "Each item requires a non-empty `symbol`";
    if (
      typeof item.quantity !== "undefined" &&
      (typeof item.quantity !== "number" || Number.isNaN(item.quantity) || item.quantity < 0)
    ) {
      return "`quantity` must be a non-negative number when provided";
    }
  }
  return null;
}

async function fetchPricesForSymbols(symbols, timeoutMs = 8000) {
  const token = requireEnv("FINNHUB_API_KEY");
  const unique = Array.from(new Set(symbols.map((s) => String(s).trim().toUpperCase())));
  const requests = unique.map((symbol) =>
    axios
      .get("https://finnhub.io/api/v1/quote", {
        params: { symbol, token },
        timeout: timeoutMs,
        validateStatus: (s) => s >= 200 && s < 500,
      })
      .then((resp) => [symbol, resp?.data?.c ?? null])
      .catch(() => [symbol, null])
  );
  const settled = await Promise.allSettled(requests);
  const prices = {};
  for (const result of settled) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      const [symbol, price] = result.value;
      prices[symbol] = typeof price === "number" ? price : null;
    }
  }
  return prices;
}

// Analyze portfolio with AI
app.post("/analyze-portfolio", apiKeyMiddleware, async (req, res) => {
  try {
    const { portfolio, includePrices = true } = req.body || {};

    const validationError = validatePortfolioInput(portfolio);
    if (validationError) return res.status(400).json({ error: validationError });

    const symbols = portfolio.map((s) => s.symbol);
    const prices = includePrices ? await fetchPricesForSymbols(symbols) : {};

    const prompt = `You are a senior financial analyst. Analyze the following portfolio.
    Portfolio positions: ${JSON.stringify(portfolio)}
    Latest prices (may be null if unavailable): ${JSON.stringify(prices)}
    Provide:
    - Overall diversification and concentration risks
    - Sector or factor exposures if inferable
    - Notable strengths and weaknesses
    - Risk management suggestions and rebalancing ideas
    - Short, actionable next steps
    Keep it concise and practical for a retail investor.`;

    // OpenAI chat
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful finance assistant. Do not provide personalized investment advice. Provide educational analysis only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 800,
    });

    const analysis = completion?.choices?.[0]?.message?.content || "No analysis available.";
    return res.json({ analysis, prices: includePrices ? prices : undefined });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data || error?.message || "AI analysis failed";
    console.error(`[${req.id}] analyze-portfolio error:`, message);
    return res.status(status).json({ error: typeof message === "string" ? message : "AI analysis failed" });
  }
});

// Health check
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "AI Microservice",
    env: {
      OPEN_AI_KEY: Boolean(process.env.OPEN_AI_KEY),
      FINNHUB_API_KEY: Boolean(process.env.FINNHUB_API_KEY),
      AI_SERVICE_KEY: Boolean(process.env.AI_SERVICE_KEY),
      ALLOWED_ORIGINS: allowedOrigins,
      node_env: process.env.NODE_ENV || null,
    },
  });
});

// Global error handler to ensure JSON response
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err?.status || 500;
  const msg = err?.message || "Server error";
  res.status(status).json({ error: msg });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
