# Preview status

The repository is deploy-ready when all deployment CI jobs are green on the exact head SHA and a real deployment URL has been inspected.

Repository readiness and live deployment are separate states:

- `repository_ready`: Vite build, artifact and config are verified in CI.
- `deployment_ready`: a Vercel deployment exists and reports READY.
- `phone_verified`: the deployed URL has passed the mobile checklist.

Do not report the preview as live until all relevant live checks have actually been observed.
