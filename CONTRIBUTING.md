# Contributing to Terra Drive

Use a feature branch and a pull request for every source change. The project
owner reviews the PR in Code Review before merging it into `main`.

1. Fetch the latest repository state and create `codex/<topic>` from `main`.
2. Make a focused change and run checks appropriate to the affected behavior.
3. Review the diff for browser changes, generated assets, settings or secrets.
4. Push the feature branch and open a PR targeting `main`. Keep it as a draft
   while verification is incomplete, then mark it ready for review.
5. Include the problem, resulting behavior, validation and material limits.
   Keep the PR open until the owner approves and requests merging it.

The existing checkout retains large local Unreal dependencies and the complete
historical browser reference. `.gitignore` keeps generated builds, acquired
packs, recovery notes and player state out of normal source commits. Never
force-add them. The published browser source is a preserved reference; native
changes belong in `TerraDriveUnreal/`.

Performance work needs a matching before/after native measurement. Use the same
device, resolution, preset, frame cap, clock, physics and scenario. Report frame
times and spikes as well as average FPS. A capped run cannot establish uncapped
throughput, and fixed-clock validation cannot establish real-time performance.

Build and native verification instructions are in
[the Unreal README](TerraDriveUnreal/README.md). Native verification uses isolated
settings and bounded, temperature-monitored runs. Browser regression checks are
reference evidence and do not establish native acceptance.
