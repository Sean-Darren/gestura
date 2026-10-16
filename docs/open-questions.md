# Gestura — Open questions and decisions

The AI coding agent reads this file before every step.

- **Answered** rows are decisions: follow them.
- **Default** rows are still open: use the default, say so in the plan and in
  docs/PROGRESS.md, and never invent a different requirement.
- Only the human changes a row's status. When answering a question, change
  "Default" to "Answered" and write the decision.

| # | Question | Status | Decision / default | First step affected |
| --- | --- | --- | --- | --- |
| Q1 | Is there existing code? | Answered | No existing code. Greenfield repo. | P0.2 |
| Q2 | TypeScript + Rust native addon OK? | Default | TypeScript everywhere; Rust only in `native/`. Renderer UI is React + TypeScript (answered). | P0.2 |
| Q3 | Which OS first? | Answered | macOS and Windows 11 from day one. macOS is the main dev machine; a Windows teammate checks every step. | P1.1 |
| Q4 | How does the user give explicit confirmation? | Default | Spoken "confirm" / "確認", or a 1 s held mouth gesture with a visible countdown. Never a blink, wink or dwell. | P0.3 |
| Q5 | Head, gaze, or both drive the cursor? | Default | Head pose for fine control, gaze for coarse jumps; user can switch gaze off. | P2.2 |
| Q6 | Multi-monitor and high-DPI in MVP? | Default | Primary monitor only, DPI/Retina-aware. | P2.2 |
| Q7 | Gesture mapping for left/right/double click and drag? | Default | Long blink (400 ms, tunable) = left click; left wink = right click; dwell as alternative; drag via voice-toggled drag mode. | P2.4 |
| Q8 | How are interaction logs handled? | Default | Local-only, opt-in, user-deletable. Never exported automatically. | P2.5 |
| Q9 | Benchmark sets and baseline? | Default | Plan builds the harnesses; team writes the cases. Baseline = [HEAD MOUSE PRODUCT] + the OS on-screen keyboard. Target sizes 16/24/32/48 px. | P2.5 |
| Q10 | What does "mouth movements" mean? | Default | Both: held jaw-open toggles listening; GenAI requests are spoken. | P3.3 |
| Q11 | Does dictation need confirmation? | Answered | Yes. Everything inserted for the user, dictation included, goes through ActionGate and needs confirmation first. | P3.3 |
| Q12 | Chinese output script and register? | Default | Traditional (zh-HK). Dictation keeps spoken Cantonese characters. | P3.1 |
| Q13 | Excel route? | Default | Office.js add-in, Microsoft 365 Excel on macOS and Windows, confirmed by spike P4.1. | P4.1 |
| Q14 | Cloud LLM provider and region? | Default | Provider-agnostic interface; [LLM PROVIDER] chosen before P4.2. | P4.2 |
| Q15 | What sheet context may leave the device? | Default | Headers, range addresses and data types. Up to 5 sample values per column only behind a visible toggle. | P4.2 |
| Q16 | Local fallback model and its tasks? | Default | Small instruction model via Ollama; offline single-function formulas and intent fallback only. | P4.2 |
| Q17 | MVP GenAI scope? | Default | Excel must reach ≥ 80% first-time and ≥ 95% after one correction before Phase 5 starts. | P5.1 |
| Q18 | User-test participants and ethics approval? | Default | Not assumed. Required before P6.3. | P6.3 |
| Q19 | Deadline and team size? | Default | Not assumed. Plan is sequential. | All |
| Q20 | What is the second challenge in the notes? | Default | Not assumed. | None |

## Other decisions

| Date | Decision |
| --- | --- |
| 2026-10-14 | Renderer UI framework: React + TypeScript (electron-vite template in `apps/desktop`). |
| 2026-10-14 | Package manager: pnpm. Do not use npm or yarn in this repo. |
| 2026-10-14 | UI components: Tailwind + shadcn/ui; 21st.dev components allowed via the 21st-ui skill at development time only, with the AGENTS.md accessibility and no-runtime-network rules. Not used for the overlay. |
| 2026-10-14 | The agent never commits or pushes; the human does (AGENTS.md hard rule 11). |