# Linear clone

Issue tracker with a Linear-style interface: inbox, project lists, a Kanban board, and live comments.

- Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Convex for the database, queries, mutations, and auth
- Zod for input validation
- dnd-kit for the board

## Local development

Requires Node.js 22 or newer (Convex 1.49).

```bash
npm install
npx convex dev
npm run dev
```

`npx convex dev` writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local`. The app reads that URL through `ConvexReactClient`.

Email and password sign-in works after the Convex Auth keys exist on the deployment:

```bash
npx @convex-dev/auth --web-server-url http://localhost:3000
```

That sets `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` on the dev deployment.

### Google OAuth

Google is configured in `convex/auth.ts`. Add these on the **Convex** deployment (not in Vercel):

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

In Google Cloud, the authorized redirect URI is:

```text
https://<your-deployment>.convex.site/api/auth/callback/google
```

## Deploy on Vercel

1. Create a project on [Vercel](https://vercel.com) and link this repository.
2. The build command is `npx convex deploy --cmd 'npm run build'` (`vercel.json` and the `vercel-build` script). It deploys Convex, then builds Next.js.
3. In the [Convex dashboard](https://dashboard.convex.dev), open the production deployment → Settings → Deploy keys. Create a key with the `deployment:deploy` permission.
4. In Vercel, add `CONVEX_DEPLOY_KEY` as an environment variable **only for Production**.
5. Run one production deploy so Convex creates the production deployment. Copy its cloud URL (ends in `.convex.cloud`).
6. In Vercel, set `NEXT_PUBLIC_CONVEX_URL` to that production URL and redeploy.
7. On the production Convex deployment, set:
   - `SITE_URL` to the Vercel production URL (for example `https://your-app.vercel.app`)
   - `JWT_PRIVATE_KEY` and `JWKS` (generate them with `npx @convex-dev/auth`, choosing the production deployment)
   - `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` if you want Google sign-in

Preview deployments need `CONVEX_DEPLOY_KEY` as well if you want them to build. The instructions above keep that key on Production only.
