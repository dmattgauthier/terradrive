# Terra Drive development

- Work on a feature branch named `codex/<topic>` and open a pull request into
  `main`. Leave it open for the user's Code Review. Do not push directly to
  `main` or merge a PR unless the user explicitly requests it.
- Keep each PR focused. Describe the observed problem, the resulting behavior,
  measured validation and remaining limits. Attach the PR to the Codex chat.
- Preserve the complete browser reference under `TerraDrive-v1.13`, current
  player saves/settings, vehicle upgrades and acquired Epic/Fab assets.
- Commit source, import/build recipes, meaningful tests and concise evidence
  summaries. Exclude generated Content, SourceAssets, Build, Binaries,
  Intermediate, Saved, acquired packs and private app/configuration files.
- Profile the packaged native game before claiming a performance cause.
  Compare matching routes, graphics, clock, physics and frame caps. Use real
  elapsed time for throughput measurements; fixed-clock tests prove function.
- On this 16 GB laptop, serialize compilation, editor/cooker, game and Insights
  jobs. Use bounded offscreen runs with isolated settings, capped frame rates
  and GPU-temperature monitoring. Do not close unrelated user applications.
- Keep terrain detail, physical interactions and collision accuracy unless a
  change is justified explicitly. Test meaningful geometry invariants and the
  affected native behavior, including rollover and ruts after terrain changes.
- Keep failed evidence intact. Record the tested executable/source hashes and
  distinguish new checks from historical or source-equivalent evidence.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the review workflow.
