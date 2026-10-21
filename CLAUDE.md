# Phanes — notes for contributors and agents

Browser-only analyzer for Ren'Py games. pnpm monorepo, TypeScript strict, Vite + React, Vitest.

## Commands

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (`tsc -b`), `pnpm test` (Vitest projects), `pnpm build`
- `pnpm phanes <command> <path>`: dev CLI (tsx) — see `apps/cli`
- `pnpm e2e`: Playwright tests for `apps/web`

## Rules

- `packages/renpy-formats` and `packages/core` must stay free of DOM and Node APIs. Their
  `tsconfig.lib.json` uses `lib: ["ES2023"]` and `types: []`; tests live in `test/` with Node types.
- Never execute or import anything described by a game file. The pickle VM builds generic objects;
  Python dicts and object attributes are `Map`s, never plain JS objects keyed by file data.
- Every decoder failure is a `FormatError` turned into a diagnostic; a bad file must never abort the
  whole analysis.
- Read large files by slices (`FileSource.read(start, end)`), never whole archives.
- No network requests at analysis time; no lazy-loaded chunks needed by the analysis.
- Do not copy code from unrpa (GPL-3.0). Ren'Py and unrpyc are MIT: cite them in a header comment
  when adapting logic, and keep NOTICE up to date.
- UI strings are French and live in `apps/web/src/ui/strings.fr.ts`; code, comments and commits are
  English.
