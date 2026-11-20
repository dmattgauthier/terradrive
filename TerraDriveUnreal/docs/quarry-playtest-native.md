# Native quarry playtest

The Windows package `quarry-playtest-m1` was built and tested on the D: checkout with Unreal Engine 5.8.3. The source revision is `ee3ddda007c1f8f7b1bab615c4ff56902e375588`. The native executable SHA-256 is `126b1a8198685e28d0f92bd69b83428e576cb995a0a2024fe4340d2edd536ba1`. All seven receipts matched the deployed executable and staged content hashes.

## Timing and temperature

The RTX 4060 Laptop GPU ran at 1920 × 1080 output with the Cool preset and a 30 FPS driving cap. Cool renders at 65% internally with shorter directional shadow reach. Timing uses the wall clock and includes the 20 FPS menu cap in the sustained result.

| Run | Average FPS | 95th-percentile frame | Peak GPU temperature |
| --- | ---: | ---: | ---: |
| Previous package, 30-second quarry baseline | 29.83 | 34.10 ms | 56.1°C |
| Final package, 30-second quarry benchmark | 29.93 | 33.69 ms | 64.1°C |
| Final package, 600-second session | 29.75 | 33.92 ms | 68.9°C |

The earlier sustained build at 75% render scale reached the 77°C cutoff after 8 minutes 16 seconds from launch. Over seconds 185–485, sampled GPU power averaged 24.46 W in that run and 20.44 W in the final run, with different starting temperatures. The final run had 17,851 measured frames. There were ten frames over 100 ms, including a 521 ms first-use garage hitch and three during the rollover transition. The rollover phase averaged 26.8 FPS.

The native shutdown stack showed Unreal waiting for global compute pipeline precaching. Two repeats on the same prior executable with on-demand global pipeline creation completed in 43.0 and 42.5 seconds overall, after a 148.9-second run with eager global precompilation. The final package uses on-demand global pipelines and completed the 30-second benchmark and shutdown in 50.2 seconds overall.

## Native acceptance

| Run | Passed | Evidence |
| --- | ---: | --- |
| 1080p quarry benchmark | 14 / 14 | 257.1 feet and four gates in 30 seconds. The fixture also checks live terrain deformation, physical contact and repair. |
| Ten-minute native session | 18 / 18 | The stock Urus completed 20 clean gates in 99.4 seconds with zero recoveries. The best was written under the D: test profile and loaded again. Retry, rollover recovery, drive-away, pause restart, and 11 repeated quarry starts passed. The Wrangler crossed 266 feet of deep mud and measured 1.93 inches of rut depth. |
| Urus exterior and cabin | 11 / 11 | Ten native Quality views. The front, profile, rear and oblique views were compared with the original V8 Performante imagery. The side profile still has a blunter nose than the reference, and some small trim and panel intersections are approximated. |
| Slate Rim complete trail and survey | 25 / 25 | The stock Urus drove all 20 gates. Seven survey viewpoints covered the quarry cuts, trail boundaries and material changes. A foreground pine partly obscures the last survey view. |
| Granite driving lines | 22 / 22 | A stock Wrangler in low range stalled at the center notch with the front and rear diffs open. Locking both cleared all six gates. The marked right bench also cleared all six gates with the axle diffs open. |
| Granite Hummer at full steering lock | 4 / 4 | 50-inch tires at 16 PSI, left and right locks on the ledge. The worst sampled tire intrusion was 0.22 inches, within the fixture tolerance. |
| Hummer rollover and recovery | 100 / 100 | Ten side and roof poses with 50-inch tires. In-place recovery and drive-away passed on Pine Ridge. |

The live Windows audio mixer ran during the ten-minute session. The ICE and EV mix responded to propulsion, and the contact cues responded to measured slip and impact. Physical controller vibration still needs a hardware check.

## D: installation and evidence

The original 1.65 GiB milestone package was deployed to `Build/Windows`. Use `Build/Windows/Start Terra Drive.cmd` for the sibling `Build/PlayerData/Saved` profile. Existing garage and graphics settings were copied and hash-checked. The previous package is available in `Saved/QuarryPlaytest/Rollback-before-quarry-playtest-m1/Windows`.

Native logs, receipts, captures and isolated profiles are under `Saved/QuarryPlaytest/release-d-*`. The Unreal Engine copy, generated assets, cook cache and staging all live on D:. Windows and the installed Visual Studio compiler and SDK run from C:. UnrealBuildTool wrote its small system-profile trace there during compilation.

The mesh research and acceptance criteria are in the [quarry playtest plan](quarry-playtest-plan.md).

## PR #19 review follow-up

The updated D: package is `quarry-playtest-pr19-review`, built from `0c11a3f79cbe2949b5957648de217950b9fb53a0`. Its native executable SHA-256 is `a9c8b9248980684068a40d09f2a4dc94428f180362c71dbee50a533d3c475bf6`. All three final receipts match the installed executable and staged content hashes.

- The Windows launcher imported seven legacy files in tests covering a fresh profile, a partly populated profile, and a retry after a copy failure. The fixtures verified retention of existing files and that a completed migration does not restore an intentionally reset setting. The installed update preserved all six existing player files byte for byte.
- The build restored the calling shell’s original environment after success, a missing-engine failure, and a full D: package. The test covered both set and unset variables.
- The 1080p, 15 FPS-cap playtest passed all 22 checks in 184.8 seconds. The Urus completed all 20 gates, saved and loaded a 100.02-second validation record under `Saved/Validation`, and preserved the seeded 0.25-second personal record byte for byte.
- The Windows mixer generated 23,999 PCM samples per second over 94.0 seconds of quarry driving at the 24 kHz source rate. The rollover dispatched an Unreal force-feedback pulse with the trigger at zero. Keyboard input then took over despite analog drift. Physical controller vibration still needs a hardware test.
- The interface suite passed 166 checks. Both 30 FPS-cap quarry benchmarks passed their 14 driving and terrain checks. The updated build measured 24.16 FPS with a 56.30 ms 95th-percentile frame time. The previous build measured 24.39 FPS with a 53.78 ms 95th-percentile frame time under the same test settings.

The updated launcher is at `Build/Windows/Start Terra Drive.cmd`. The previous package is at `Saved/PR19Review/Rollback-before-review-fixes/Windows`. The benchmark and gameplay receipts are in `Saved/PR19Review/Final`. The earlier 10-minute result above identifies the original milestone package.
