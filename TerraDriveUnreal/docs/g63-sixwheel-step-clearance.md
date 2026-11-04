# G63 6×6 running-board clearance

The pickup inherited the SUV running board beneath its own side step. The
optional armor rail also reached alongside the middle tire, where the old
width-based test missed it. The 6×6 now has one fitted running board per side
with a metal edge and dark tread. The armor rail and its three mounts on each
side fit between the wheel openings. The step shape and its location beneath
the doors follow the [Mercedes-Benz driving gallery](https://mb-live.jp/report/re_6x6_testdrive_150107/).

| Clearance with largest garage tires | Front tire | Middle tire |
| --- | ---: | ---: |
| Running board | 2.8 in | 4.0 in |
| Armor slider and mounts | 4.2 in | 5.4 in |

These modeled gaps apply on both sides. The geometry checks compare complete
longitudinal projections, so the vertical position of the wheel through
suspension travel does not reduce the gap. The front calculation bounds the
steered tire using its full width and radius. The exact board dimensions are
estimates fitted to the in-game vehicle.

The source suite passes 100 checks across the portal G-Class models, including
the five board and rail regressions. Export verification found two changed
meshes and 305 byte-identical mesh inputs. The 6×6 ground probes and collision
hulls were regenerated, and Unreal imported both revised meshes and completed
a full cook with zero errors and 0 warnings.

The Windows package passes 226 fresh checks across SixWheel (35), the
focused 6×6 Rollover run (81), and Art (110). Manual review covers
4 stock 6×6 views from the packaged game. The upgraded slider
clearance comes from the geometry measurements above. The isolated offscreen
runs were capped at 20 FPS, with a peak sampled GPU temperature of 57°C.

The preservation audit matched the complete browser reference, acquired asset
files and eight player-state paths.

| Tested artifact | SHA-256 |
| --- | --- |
| Packaged game executable | `590d2867f6c79270d9c2ddc6afb9045b6e533adfd53c86f89828a2ca21a7fc3a` |
| Tested source manifest (194 files) | `b52e272f02da17e903733e1845794ceabdbf65893f9345865ad69e6dd19b760b` |
| Generated input manifest (319 files) | `80c929974d1e4e09513f2f11ac81cf8e3445009f4d167b40e2c4931fa5ce104e` |
| 6×6 body mesh source | `d1faf115a1f572845df010ae6880766f406f1793f4d823739df1e0b1d5c6c1ed` |
| 6×6 armor mesh source | `3437482da154b2e76660d033bd035f6541a81460a31ab0a27b3f2dc21337f8c9` |
| Cooked game content (.ucas) | `12bd7ccce83b1cdcec40700f27a7704d303c89fd2fac118c78241dfb7b81480e` |
