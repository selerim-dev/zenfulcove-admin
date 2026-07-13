# Claude Code MCP setup (Supabase + Vercel)

This repo is wired so Claude Code can reach **this project's** Supabase (read-only)
and Vercel account through MCP. The pattern is per-repo: each repo has its own
`.mcp.json` naming its accounts, so opening Claude in a repo automatically selects the
right account — a "Rolodex" with no manual switching. Because MCP tools are namespaced
`mcp__<server>__<tool>`, two accounts of the same tool never collide.

## Files

- **`.mcp.json`** (git-ignored — holds the token, never commit it) declares two servers:
  - `supabase-zenfulcove` — hosted Supabase MCP, scoped to one project via `project_ref`,
    `read_only=true` (queries run as a read-only Postgres user), limited to the
    `database,debugging,docs` feature groups (no account-management tools). Auth is a
    `Bearer` **personal access token** (`sbp_…`) inline in the `Authorization` header.
  - `vercel-zenfulcove` — hosted Vercel MCP (`https://mcp.vercel.com`), OAuth.
- **`.mcp.json.example`** (committed) is the template to copy when adding a new repo.

## One-time setup

1. `cp .mcp.json.example .mcp.json`
2. In `.mcp.json`, fill in:
   - `project_ref=<your ref>` — Supabase dashboard → Project Settings → General → "Reference ID".
   - `Authorization: Bearer <sbp_… token>` — Supabase → Account →
     [Access Tokens](https://supabase.com/dashboard/account/tokens). Must start with `sbp_`
     (a publishable/anon/`service_role` key is a data-API key and will **not** work here).
   Read-only is enforced by the `&read_only=true` URL flag plus the excluded `account`
   feature group, so this connection can read data + logs but cannot mutate the project.
3. **Restart Claude Code** in this repo (MCP servers load at startup). Approve
   `supabase-zenfulcove` when prompted; authorize `vercel-zenfulcove` via the browser OAuth
   flow (grants your full Vercel account access — review it).
4. Run `/mcp` — both should show `✓ connected`. Test: ask Claude to read a row from
   `access_code_releases` (Supabase) or list recent deployments (Vercel).

Optional — to stop per-query approval prompts for the read-only Supabase tools, add to
`.claude/settings.local.json` (git-ignored):

```json
{ "permissions": { "allow": ["mcp__supabase-zenfulcove__*"] } }
```

Leave Vercel out of the allow-list so deploys/env changes always ask first.

## Adding another repo to the Rolodex

Copy `.mcp.json.example` into the other repo as `.mcp.json`, rename the servers to that
account (`supabase-clientx`, `vercel-clientx`), and fill in that account's ref + token.
Keep `.mcp.json` git-ignored in every repo.

## Security notes

- An LLM-connected database sees every row it queries and is a prompt-injection surface —
  keep the connection read-only (as configured) and be deliberate about which project it
  points at.
- Vercel MCP grants the same access as your Vercel user; anything destructive or
  outward-facing gets an explicit confirmation.
- OAuth MCP (Vercel) needs an interactive `claude` session; the Supabase Bearer-token path
  is the more portable of the two (works headless).
