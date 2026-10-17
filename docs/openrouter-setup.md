# OpenRouter development setup

1. Open the repository's `.env` file in your editor. It is ignored by Git. If missing, copy `.env.example` to `.env`.
2. Set these values (paste the real key only into the local file):

   ```dotenv
   OPENROUTER_API_KEY=your-key-here
   OPENROUTER_MODEL=openai/gpt-4.1-mini
   ```

3. Quit any running Gestura instance and run `pnpm dev` from the repository root. For the Excel development setup, use `pnpm excel:dev` instead. The existing Excel add-in must be built, trusted and connected to use formula requests.
4. In a disposable workbook, select a target cell and request a formula. Review the proposal and confirm by voice or a held mouth gesture. Blink, wink and dwell cannot confirm a formula.
5. Check an English and a Cantonese request, correction, cancel, pause, and exactly one write after confirmation. A formula request makes a potentially billable OpenRouter call. Starting the app alone does not call the model.

The development app reads `.env` from the repository root in main only. Shell environment values take precedence. Restart after editing. No `VITE_` or `ELECTRON_VITE_` secret variables are used. The key stays in memory after reading; it is not copied into `config.json`, IPC or logs. `.env` is plaintext on your computer: do not share it. Delete the key line to disable the environment override. Existing JSON provider settings, if any, then apply again.

With a non-empty key, the app uses `https://openrouter.ai/api`, model above, and adds exactly `openrouter.ai` to the in-memory network allowlist. Redirects are refused. A missing key leaves existing config unchanged. Sample sheet values remain off unless explicitly enabled. No audio or video is sent to the provider.

Requests include strict JSON Schema, `require_parameters: true`, `data_collection: deny` and `zdr: true`. If no compatible endpoint is available, requests fail rather than relaxing these preferences. These are provider routing controls, not an independent audit of third-party retention policies. See [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs) and [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

For failures, check the key, OpenRouter credits, model access, privacy-compatible endpoint availability, and the existing eight-second formula timeout. Raw provider error bodies are deliberately not shown because they may contain private input. Never paste your key into a bug report.

This setup is for development. Packaged apps read only explicitly supplied environment variables, not a bundled `.env`. OS-encrypted key storage and a settings UI remain follow-ups. The formula benchmark still uses its explicit `--app-config` flow; it does not load this development `.env`.
