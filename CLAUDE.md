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

## Fixtures

`fixtures/README.md` explains how fixtures are produced. `tools/fixtures/build.sh` downloads the
pinned Ren'Py SDKs (6.99.14.3, 7.4.11, 8.3.7, 8.5.3) into `tools/fixtures/.cache` (gitignored) and
rebuilds `fixtures/build`. The 7.4.11 SDK ships a Python 2.7 interpreter
(`lib/linux-x86_64/python`), used to generate Python 2 pickles.

## Oracles

- `tools/oracle/dump_json.py` decodes every fixture script with CPython's own unpickler and writes
  the canonical JSON of `renpy-formats/src/dump/canonical.ts`; `test/rpyc/oracle.test.ts` requires
  an exact match. Keep both implementations of the canonical form in sync.
- `tools/oracle/unrpyc.sh` stores unrpyc's dumps and decompiled sources for human review.
- `tools/oracle/semantic.py` projects unrpyc's view of each statement; `core/test/acl-oracle.test.ts`
  requires the anti-corruption layer to produce the same projection for every SDK.
- Dialogue statistics follow `docs/stats.md`; hand counts live in
  `fixtures/expected/phanes_demo.stats.json`. Change both together.
- Verified format facts (and surprises) are in `docs/formats.md`.
