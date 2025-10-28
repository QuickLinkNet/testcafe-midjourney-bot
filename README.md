# Discord Midjourney Automation

Automate Midjourney prompt execution inside Discord with a polished TestCafe runner, live overlay, and flexible prompt sourcing. This project targets creators who want to batch prompts safely while keeping a human-friendly UI for monitoring progress.

## Highlights
- Automates login, `/imagine` command entry, and upscale button handling (with debounce + retries).
- Injected control overlay featuring pause/resume, worker count, queue stats, and live logs.
- Adjustable concurrency (1–2 parallel jobs) directly from the overlay or `.env`.
- Multiple prompt sources: REST API or local JSON file (`prompts.json` by default).
- Written in TypeScript with strict checks and structured modules for UI, core logic, and utilities.

## Requirements
- Node.js 18+ (for native `fetch` and ES modules).
- Chrome installed locally (default TestCafe target).
- A Discord account plus access to a Discord server where the Midjourney bot is present and can run jobs.
- Midjourney Standard plan or higher if you plan to use relaxed mode (the official limit is three relaxed renders in parallel; this runner defaults to 1–2 for reliability).
- TestCafe (installed via `npm install`).

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create environment config**
   ```bash
   cp .env.example .env
   ```
   Fill in your Discord `EMAIL`, `PASSWORD`, and the `SERVER` (channel URL). Decide how prompts are sourced:
   - Local file: keep `PROMPT_SOURCE=file` and ensure `prompts.json` exists (see below).
   - REST API: set `PROMPT_SOURCE=api` and configure `API` (+ optional `API_SECRET`).

3. **Prepare prompts**
   - **Local file workflow**
     - Copy the sample and edit as needed:
       ```bash
       cp prompts.sample.json prompts.json
       ```
     - Each prompt requires `id`, `prompt`, `expected_runs`, and `successful_runs` counts.
     - The runner automatically updates `successful_runs` in the file after each successful upscale.

   - **API workflow**
     - Expose endpoints compatible with:
       - `GET /prompts/pending?secret=<API_SECRET>&limit=<n>` → `{ success: boolean, data: { prompts: Prompt[] } }`
       - `GET /prompts/:id/increment-success?secret=<API_SECRET>` → increments `successful_runs`
     - Set `API` (base URL) and `API_SECRET` in `.env`. Override `PROMPT_SOURCE=api` if you want to force the API even when the file is present.

4. **Run the automation**
   ```bash
   npx testcafe chrome discord-automation.ts
   ```
   Use `-e` for incognito mode or `chrome:headless` for background runs. The injected overlay provides live feedback and controls.

## Overlay Cheat Sheet
- **Pause / Resume:** Button or `Ctrl+Shift+P`. Paused state keeps active jobs running but queues new prompts.
- **Workers:** Increase/decrease between 1–2 concurrent jobs directly in the overlay. Changes apply immediately. (If your Midjourney plan supports three relaxed slots, feel free to bump the code default—two is the safe default shipping in this repo.)
- **Metrics:** Active jobs, queued jobs, and completed prompts update in real time.
- **Log window:** Shows prompt lifecycle events (start, milestones, button clicks, warnings).

## Project Structure
```
discord-automation.ts        # TestCafe entry point
src/
  config/constants.ts        # Core selectors & timings
  core/
    message-handling.ts      # DOM helpers for Midjourney messages
    prompt-execution.ts      # Prompt execution & progress tracking
    text-input.ts            # Typing/pasting helpers
  ui/overlay.ts              # Overlay rendering and controls
  utils/api.ts               # Prompt sourcing (API or file)
  types/index.ts             # Shared Prompt type
prompts.sample.json          # Example prompt file
.env.example                 # Reference environment variables
```

## Prompt File Schema
Whether stored as a top-level array or `{ "prompts": [...] }`, each prompt requires:
```jsonc
{
  "id": 42,
  "title": "Optional descriptor",
  "prompt": "The text sent to Midjourney",
  "keywords": "comma, separated, tags",
  "expected_runs": 3,
  "successful_runs": 1
}
```
Only prompts where `expected_runs > successful_runs` are scheduled. Successful runs increment the counter automatically.

## Development Tips
- Type check: `npx tsc --noEmit`
- Lint/format: configure Prettier/ESLint as desired (not included by default).
- The legacy scripts (`discord-midjourney-automation*.ts`) are retained for reference but the new overlay-driven runner is the recommended path.

## Roadmap Ideas
- Export run summaries as JSON/CSV.
- Optional Discord webhooks for status notifications.
- CI recipes (GitHub Actions) for lint + type checks.

## License
MIT © Your Name. Contributions welcome via PRs! When publishing, include a screenshot of the overlay in action to highlight the UX polish.
