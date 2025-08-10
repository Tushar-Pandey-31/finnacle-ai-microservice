# Finnacle AI Microservice

Express-based microservice providing portfolio analysis via OpenAI, with live quotes from Finnhub.

## Environment variables
Copy `.env.example` to `.env` and fill values:

- `OPEN_AI_KEY`: OpenAI API key
- `FINNHUB_API_KEY`: Finnhub API key
- `AI_SERVICE_KEY`: Shared key required in `x-api-key` header
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS (optional; if empty, all allowed)
- `PORT`: Server port (default 3001)

## Development

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3001/
```

## API

- POST `/analyze-portfolio`
  - Headers: `x-api-key: <AI_SERVICE_KEY>`
  - Body:
    ```json
    {
      "portfolio": [
        { "symbol": "AAPL", "quantity": 5 },
        { "symbol": "MSFT", "quantity": 3 }
      ],
      "includePrices": true
    }
    ```
  - Response:
    ```json
    {
      "analysis": "string",
      "prices": { "AAPL": 190.12, "MSFT": 410.34 }
    }
    ```

Errors return `{ "error": "message" }` with appropriate HTTP status.

## Deployment (Vercel)
- Ensure env vars are configured in the project settings
- `vercel --prod`

## Notes
- Requests are validated; symbols are deduped and fetched in parallel with timeouts
- CORS can be restricted via `ALLOWED_ORIGINS`