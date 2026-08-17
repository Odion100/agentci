# Agentci — Claude guidelines

## Agent-maintained wiki at `wiki/` — READ IT FIRST

> `wiki/` and `.claude/` are both in `.gitignore` — local agent memory and config, not committed to the repo.

This repo has an **agent-maintained knowledge graph at `wiki/`** — lazy-loaded markdown pages, one concept per file. Different from `docs/` (long-form for humans) and from this CLAUDE.md (always-loaded rules).

**Intent**: the wiki only pays off if future-you READS it before working. Writing alone is documentation theater. The lazy-load discipline IS the value.

### Mandatory first move: grep before you investigate

Before touching any non-trivial area — **`grep wiki/log.md` for the relevant topic**. If it returns any line, Read the linked page. Skipping this is how you re-discover patterns we already wrote down.

Examples of topics to grep: `execution-loop`, `middleware`, `exit-conditions`, `sdk-wrappers`, `multi-agent`, `architecture`.

If grep returns nothing relevant, you're in genuinely new territory — proceed and INGEST your findings.

### Four operations — every time you do one, append a line to `wiki/log.md`

- **INGEST `<YYYY-MM-DD>` `<page>` `<summary>`** — when you learn something a future session would be surprised by if they only read the code. If the git log already tells the story, skip. After INGEST, `grep -r <old-fact> wiki/` and UPDATE any contradicting pages.
- **QUERY `<YYYY-MM-DD>` `<page>` `<why>`** — before touching the execution loop, middleware system, exit conditions, sdk wrappers, or multi-agent composition. Renames/docs/obvious fixes don't need it. Logging surfaces pages that get read often (load-bearing) AND pages that never get read (candidates for LINT/delete).
- **UPDATE `<YYYY-MM-DD>` `<page(s)>` `<what-changed>`** — when a single fact change touches multiple pages. Risk = INGEST one, leave four contradicting. `grep` the wiki for the old fact before considering INGEST complete.
- **LINT `<YYYY-MM-DD>` `<summary>`** — scheduled every 2-4 weeks. **If you do a big refactor between scheduled lints, manually trigger one immediately after.** Procedure in `wiki/lint-workflow.md`. **Prune ruthlessly** — a wrong page is worse than no page.

### Discipline

- **Lazy-load.** Read only relevant pages, not the whole wiki. But DO read them — grep `wiki/log.md` first; if it has a hit, follow the link.
- One concept per page. Title is the concept, not the date.
- Cross-link, don't duplicate.
- The log is grep-able. `grep ^LINT wiki/log.md` for history. `grep middleware wiki/log.md` for everything that touched middleware.
- **Write-then-read failure mode:** documenting an INGEST then re-discovering the same pattern next session because you skipped the QUERY. Course-correct by grepping `wiki/log.md` immediately.

Start by reading `wiki/README.md` if the topic might already be covered. If creating a new page, also update `wiki/README.md` index.

---

## Code style

- ESM modules (`.mjs` for framework files, `.js` for entry points).
- No test framework is configured — ask before adding one.
- No TypeScript — plain JavaScript throughout.
- No comments unless the WHY is non-obvious.
