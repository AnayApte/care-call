# Care Call web

Vite 5, React, TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui.

```sh
npm install
npm run dev        # http://localhost:5173/patient
npm run build
```

Pages: `/patient` (training, then live recognition), `/caregiver`, `/beacon`.
`VITE_API_BASE` points at the server (defaults to `http://localhost:8000`).

Design tokens live in `src/styles/tokens.css`. Mockups that the pages are built from: `mockups/index.html`.

Assistive prototype, not a medical device.
