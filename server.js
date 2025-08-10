import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY
});

// Example: AI portfolio analysis
app.post("/analyze-portfolio", async (req, res) => {
  try {
    const { portfolio } = req.body;

    // Fetch latest prices from Finnhub (as example)
    const prices = {};
    for (const stock of portfolio) {
      const { data } = await axios.get(
        `https://finnhub.io/api/v1/quote?symbol=${stock.symbol}&token=${process.env.FINNHUB_API_KEY}`
      );
      prices[stock.symbol] = data.c; // current price
    }

    // Prepare prompt
    const prompt = `
    You are a financial analyst. Analyze the following portfolio:
    ${JSON.stringify({ portfolio, prices })}
    Provide risk analysis, diversification insights, and market outlook.
    `;

    // Call AI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful finance assistant." },
        { role: "user", content: prompt }
      ]
    });

    res.json({
      analysis: completion.choices[0].message.content
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("AI Microservice is running 🚀");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
