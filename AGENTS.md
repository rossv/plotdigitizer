# Agent Notes

## Repository Workflow
- Install dependencies: `npm install` (local) or `npm ci` (CI).
- Start development server: `npm run dev`.
- Build production assets: `npm run build`.
- Run lint checks: `npm run lint`.
- Run tests: `npm run test`.
- Preview built output locally: `npm run preview`.

## Deployment Workflow
- Manual publish to GitHub Pages branch: `npm run deploy` (runs `predeploy` -> `npm run build` first).
- CI workflow (`.github/workflows/pages.yml`) builds on pushes to `main` and deploys Pages from `dist`.
- CI workflow currently runs `npm ci` and `npm run build` before deploy; it does not run `npm run test`.

## Build Notes
- For subpath hosting, set `BASE_URL` when building, e.g. `BASE_URL=/my-app/ npm run build`.
