# WOD Crew source

This is the source code for the WOD Crew app I built for my friends. You can use it to set up your own crew. The app uses React, TypeScript, Vinext/Vite, Cloudflare Workers, D1 (SQLite), and Drizzle.

## Folder structure

| Folder | What is inside |
| --- | --- |
| [`app/`](app/) | Main page, styling, and server API routes |
| [`app/components/`](app/components/) | Workout builder, timer, crew board, statistics, results, and examples |
| [`lib/`](lib/) | Workout engine, score logic, identity helpers, and public workout catalogs |
| [`db/schema.ts`](db/schema.ts) | Drizzle definitions for workouts, attempts, and crew members |
| [`drizzle/`](drizzle/) | Six ordered SQL schema migrations and migration metadata |
| [`examples/demo-seed.sql`](examples/demo-seed.sql) | Optional fictional crew and workout for a new database |
| [`tests/`](tests/) | Existing regression tests with fictional identities |
| [`public/`](public/) | Icons and static assets |
| [`build/`](build/), [`scripts/`](scripts/) | Sites/Vinext build and local runtime support |
| [`.openai/hosting.json`](.openai/hosting.json) | DB binding and a placeholder for your NEW Site ID |

## Start with ChatGPT Work

Use the prompt in the [main README](../README.md#make-it-yours-with-chatgpt-work). Work from this `source/` directory: the app is not at the repository root.

Ask Work to create a **new Site** and provision a fresh D1 database bound as `DB`. In `.openai/hosting.json`, replace `REPLACE_WITH_YOUR_NEW_SITE_ID` with the Site ID returned by Work. Keep the `d1` binding as it is.

Apply `drizzle/0000_steady_the_hood.sql` through `drizzle/0005_swift_puma.sql`, in filename order, to the new database. These files contain schema only, not a database export. The app can start empty: add your own crew members and workouts through the UI. The optional seed is entirely fictional and should be used only on a fresh demo database.

Have Work check the fresh database, run the tests, build, and preview your copy before publishing.

Once your own Site is published, open its link in Safari on iPhone or Chrome on Android and [add it to your Home Screen](../README.md#pro-tip-put-wod-crew-on-your-home-screen). Your crew gets an icon for quick access while the app remains hosted on ChatGPT Sites; a separate native app is not required.

## Local development

Use **Node.js 24 LTS** for the included tests (`node:sqlite` and TypeScript type stripping) and **pnpm 11.25.0**, matching `packageManager` and the lockfile.

```sh
cd source
pnpm install --frozen-lockfile
pnpm build
```

A clean clone uses the portable runtime automatically. For an isolated local preview, the placeholder Site ID can remain: identity hashing is scoped to that placeholder and Cloudflare simulates `DB` locally. Replace it with a real new Site ID before hosting your copy. Keep any runtime state out of Git.

After the first build, initialize the **fresh local database** by executing each of the following files once, in order, with this command (replace `<migration.sql>` each time):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file <migration.sql>
```

1. `drizzle/0000_steady_the_hood.sql`
2. `drizzle/0001_fast_texas_twister.sql`
3. `drizzle/0002_melted_moira_mactaggert.sql`
4. `drizzle/0003_productive_inhumans.sql`
5. `drizzle/0004_majestic_toxin.sql`
6. `drizzle/0005_swift_puma.sql`

Do not replay these raw SQL migrations on an initialized database. To add fictional demo content, run the same local command with `--file examples/demo-seed.sql` after all migrations. These `--local` commands never initialize a hosted database; let the Sites workflow initialize your newly created hosted instance separately.

```sh
pnpm dev
```

Open the URL printed by the server (normally port 5173). Local previews and production use separate databases. `pnpm start` previews the built Worker locally; it does not deploy it.

In managed ChatGPT Work environments, let the current **Sites skill** select the execution profile, dependency installer, build, database provisioning, and preview workflow. Checkout-local `.sites-runtime/` settings are deliberately not shared.

## Checks

Run from `source/` after installing dependencies:

```sh
node --test tests/*.test.mjs
python3 tests/persistence_test.py
pnpm exec tsc --noEmit
pnpm build
```

The Node and Python database tests use in-memory databases.

## Data and access model

- `crew_members` stores crew names and archive state.
- `workouts` stores workout definitions, creator references, and archive state.
- `attempts` stores scores, workout/member references, notes, and training dates.
- Browser storage holds preferences, favorites, recovery keys, and unsent drafts.

This is a shared, trust-based friends’ app. Selecting a member is not a login and does not prove ownership; anyone with instance access can manage that member’s entries. Use Site access controls for a trusted group. A broader service needs its own server-enforced authentication and authorization.

The shared source contains no private crew data, database files, or production credentials. Test identities and the optional seed are fictional.

## Workout catalog

The collaborative app includes all 411 examples. `lib/catalog.ts` combines 399 benchmarks and 12 daily examples from local snapshots. `lib/wod-examples.ts` provides the shared conversion for the timer and workout imports.

The snapshots retain the workout names, original source links and attribution, movements, repetition counts, loads, and timing. The instructions summarize the prescriptions in factual language. `lib/catalog-review.json` records the positions of wording changes. Daily examples link to monthly archives. Retrieval dates describe the snapshots, and the manifest does not re-fetch or verify the live sources.

Generate or verify the deterministic content/conversion manifest from `source/`:

```sh
node scripts/sync-wod-catalog.mjs
node scripts/sync-wod-catalog.mjs --check
node scripts/sync-wod-catalog.mjs --out /absolute/path/to/another/site
node --test tests/catalog-review.test.mjs tests/wod-examples.test.mjs
```

Exporting copies generated artifacts from this canonical source. Never hand-edit a deployed catalog copy. Both audiences use the `WodExamples` component. The default `crew` audience shows the complete collection. The separate Community Playground demo uses the optional `individual` audience, which excludes 15 partner or team examples, including two without a partner category tag.

WOD Crew is an independent personal project and is not affiliated with or endorsed by CrossFit. Attribution and factual normalization do not establish redistribution permission. CrossFit names/trademarks, compilation rights, source terms, and any remaining third-party material require their own assessment; the MIT code license grants no third-party clearance.

WOD Crew Community gives each visitor an anonymous browser workspace without crew selection or shared results. Its server isolation is specific to the demo. Follow the setup above to build your own collaborative app.

## Example imports and open clocks

Each of the 411 examples has an executable conversion in `lib/conversion-plans.json` and a per-entry summary in `lib/conversion-audit.json`. The offline builder reads the canonical snapshots, applies format rules and explicit boundaries for complex sequences, and generates both artifacts without fetching sources:

```sh
node lib/conversion-review.mjs
node scripts/sync-wod-catalog.mjs
node --test tests/conversion.test.mjs tests/catalog-import-persistence.test.mjs tests/uncapped*.test.mjs
```

Review changed prescriptions and their plans before regenerating. Runtime imports reject unknown or changed prescriptions rather than guessing a generic stopwatch. The plan's source arrays are verification snapshots, not a separately edited editorial catalog. Source text and URLs remain canonical in the existing catalog JSON.

Movements use `name`. Counts, distances, loads, ladders, and section cues use `reps`. Full instructions stay in workout notes. Ordinary For Time rounds use one continuous clock with optional `prescriptionRounds`. Independent efforts with prescribed recovery become work/rest blocks. When a prescription has no time cap, `uncapped: true` keeps the For Time or Stopwatch clock running until the athlete taps **Finished**. The timer ignores the stored finite `duration` in that mode. Prescribed time caps remain finite. The optional fields are stored in existing workout JSON, so no database migration is required. Older saved definitions retain their previous behavior.

Use `durationLabel(workout)` for display: open work has no invented planned duration. `duration(workout)` returns Infinity for unknown totals; runtime phases are reconstructed, never serialized into saved sessions. Elapsed-result input is bounded to 24 hours independently of a source time cap.

Some WODs require manual scoring or athlete-triggered actions, such as logging a lift load, recognizing a broken hold, or cueing an interruption. The example details and workout notes explain what the athlete needs to do.

Each new import creates an independent, editable workout with its own ID and history. Catalog changes leave existing saved workouts and results intact. Reimport an example to start from its current definition.
