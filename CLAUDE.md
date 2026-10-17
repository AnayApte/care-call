# Instructions for Claude Code

Read `shared/contract.md` in full before doing anything. It is the single source of truth. Then read `agents/<your-human>.md` for your role, folders and first tasks.

Schedule: we started at 3 PM Saturday. Push to your branch and merge a small PR to `main` every hour on the hour until the 12:30 AM freeze. Final code freeze is 8 AM Sunday.

Rules:
1. Only edit files in the folders your human owns (contract section 6). Ask your human before touching anything else.
2. Never edit `shared/contract.md` or `shared/fixtures/*`. If the contract is wrong or missing something, append one line to `shared/CONTRACT_REQUESTS.md` and tell your human.
3. Build against the fixtures and mocks in contract section 13 until the real piece exists.
4. Never commit `.env`, `secrets.h`, `node_modules`, `.venv` or model files. Never put API keys in browser or firmware code.
5. Keep it simple. No new libraries without a contract request. No abstractions we do not need. The golden path (contract section 2) comes before any layer.
6. Do not claim this is a medical device in any text, UI or README.
7. After every meaningful chunk of work, update `shared/status/<your-human>.md` (what works, what is blocked, what you need) and append to `shared/changelog/<your-human>.md`.
8. Commit often on your branch with messages like `area: what changed`. `git pull --rebase origin main` before pushing.
9. Python: use a venv and run `python3 -m uvicorn`. Web: Vite 5, Tailwind v4 via `@tailwindcss/vite`.
