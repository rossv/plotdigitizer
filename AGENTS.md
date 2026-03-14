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

## Build Notes
- For subpath hosting, set `BASE_URL` when building, e.g. `BASE_URL=/my-app/ npm run build`.

## TODO
- Confirm whether `npm run test` should be required in CI before Pages deploy.
