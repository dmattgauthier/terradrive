# Roster, driving, and terrain realism

The Urus Performante nose rolls down behind the splitter, and the lower rear valance tapers toward the rear wheels. The front intakes, tail optics and exhaust openings still use separate modeled surfaces. The other eleven vehicles have trim-specific lamp changes, including molded optical detail, layered covers and passive reflectors. These are photo-based exterior refinements. [Lamborghini Performante](https://www.lamborghini.com/en-en/history/urus-performante) · [Mercedes-Benz G 580](https://media.mbusa.com/news/the-gelandewagen-electrified) · [Mercedes-AMG G 63 4×4²](https://www.mercedes-amg.com/en/mercedes-amg-g63-4x4-walkaround) · [Mercedes-Benz G 63 6×6](https://mb-live.jp/report/re_6x6_testdrive_150107/) · [EarthCruiser EXP98](https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf) · [STI 22B archive](https://www.sti.jp/brand/heritage/1998/impreza-22b/) · [Monster Jam Grave Digger](https://www.monsterjam.com/en-us/truck/grave-digger/)

Service brakes account for longitudinal load transfer. Equipped vehicles regulate wheel slip during braking in high range with unlocked differentials. Load-sensitive brake distribution tapers in near walking speed. The internal-combustion launch multiplier eases out in both directions, and aerodynamic drag uses the vehicle's drag coefficient and an estimated frontal area. The portable simulation suite passed 833 checks. [NHTSA ABS testing](https://www.nhtsa.gov/sites/nhtsa.gov/files/absperformancefinalreport.pdf) · [NASA drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)

Seven ground materials now show vegetation and exposed soil, worn pavement aggregate, wet mud and wetland edges, weathered stone, dune ripples and wind-packed snow with exposed pebbles. The import generated 30 revised coachwork meshes, including tire-clearance variants, among 381 accepted meshes. The terrain height, surface and transition fields matched the baseline hashes. [USGS dune processes](https://pubs.usgs.gov/gip/deserts/eolian/) · [NSIDC snow science](https://nsidc.org/learn/parts-cryosphere/snow/science-snow) · [NPS rock weathering](https://www.nps.gov/places/geological-trail-station-1.htm)

## Packaged Windows validation

The installed D: package is roster-realism-m2 from source revision 50278b54e52f1bdf8ef9654570f9eea254b86ca0. Its Windows executable SHA-256 is 3eea117849e4709dba6675af04fb2c6f843f9a9768c471894db1c4aa6d9200f3. All five cooked game containers match the full-test candidate byte for byte. The final revision updates the sand validation fixture only.

| Package used | Suites | Passed |
| --- | --- | ---: |
| Installed executable | Electric pressure and drivetrain conversions, real-time quarry benchmark, Urus art, terrain detail | 320 |
| Full-test candidate with identical cooked assets and gameplay code | Roster art, movement, service brakes, Granite crawl lines, 50-inch Hummer fit, in-place rollover recovery, terrain transitions, ruts | 603 |

The roster art suite captured ten native views per vehicle. Front, profile and rear views were reviewed for each model. The final Urus art rerun repeats eleven of the full roster's checks. The Hummer at 16 PSI cleared both steering locks on Granite with 0.22 inches of worst sampled tire intrusion, within the fixture tolerance. Ten rollover poses recovered in place. Both locked and open-axle Granite driving lines passed.

The first sand test could not find a lane because earlier Copper Dunes grading reached beyond the old test's travel window. The corrected fixture checks the drive, overshoot and front tire reach on pure sand and scans the full corridor for obstacles. The paired Wrangler trials sampled 66 points per pressure. The mean contact patch length increased from 3.94 inches at 37 PSI to 4.99 inches at 20 PSI. Both produced continuous bounded ruts. In separate paved tests from matched entry speeds, the Civic stopped in 29.74 feet at 33 PSI and 34.22 feet at 16.5 PSI.

| 1080p Cool quarry run, 30 FPS cap | Average FPS | 95th-percentile frame time | Peak GPU |
| --- | ---: | ---: | ---: |
| Prior installed package | 25.09 | 55.34 ms | 56.51°C |
| First realism candidate | 29.97 | 33.78 ms | 63.23°C |
| Final installed package | 29.85 | 33.97 ms | 60.82°C |

Each run measured 30 seconds of real time. These are short capped samples of one route.

Launch Build/Windows/Start Terra Drive.cmd. All six player profile files matched their pre-install hashes. The previous playable package and the native captures, logs and receipts are under Saved/RosterRealism. Build inputs, the acquired quarry import cache, derived data, test profiles and the installed game are on D:. Windows, the installed Visual Studio tools and system diagnostics are workstation dependencies.
