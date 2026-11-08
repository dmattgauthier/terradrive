# Grave Digger and Impreza 22B photo pass

This follow-up to PR #12 compares the stock game models with side, front, rear,
three-quarter, and detail photos. Both vehicles retain their simulated axle
centers, drivetrain parameters, and factory tire diameters.

## Grave Digger

The 2024 track photos show a narrow, rolled hood with a small red lamp at
each fender end, an open front beneath the fiberglass, and a cropped rear
shell that exposes the suspension and cage. The new shell follows those
outlines with a higher, curved rear opening in place of the previous
square panel. The lower quarters sweep over the rear tires. Open side apertures show the braced cab, central
seat, instruments, and steering wheel. The tail shows the cross bracing,
cooler, and suspension. [Monster Jam gallery](https://www.monsterjam.com/en-us/truck/grave-digger/),
[front three-quarter](https://www.monsterjam.com/wp-content/uploads/2024/10/2023-07-01_14-14-37.jpg),
[rear three-quarter](https://www.monsterjam.com/wp-content/uploads/2024/10/GD-2024-2.jpg).

The 66-by-43-inch tires have curved chevrons with rounded shoulders, sidewall
molding and stencils. The green 25-inch beadlocks surround a deeper wheel
bowl. The V8, blower, header pipes, reservoirs, and tapering chassis use
the competition hardware close-ups as a guide. The roof and side artwork
is redrawn on the curved panels, including the red-edged hood stripe,
roof lettering and crossbones, spectral face, moon, and cemetery details.
Truck-specific chassis dimensions and the artwork are interpreted from photos. [Overhead track photo](https://www.monsterjam.com/wp-content/uploads/2024/10/Grave-Digger-Arlington.jpg),
[hardware photos](https://www.popularmechanics.com/cars/trucks/how-to/g2500/the-ultimate-monster-truck-take-an-inside-look-at-grave-digger/).

## 1998 Subaru Impreza 22B STI

The stock #005 gallery gives a side profile (010 and 018), front views
(002, 020 and 021), and rear views (011 to 014). These establish the
falling bonnet, the narrower crowned roof, the glass rake and taper, the
long door and its rounded rear quarter window, and the higher rear deck.
The wheelbase remains 99.2 inches. The factory body measures 171.9 by 69.7
by 54.7 inches. [STI heritage specifications](https://www.sti.jp/brand/heritage/1998/impreza-22b/),
[stock #005 photo gallery](https://sterlingsackey.com/portfolio/1998-subaru-impreza-22b-sti/).

The front now has rounded bumper corners, recessed main and side openings,
layered fluted lamps, smaller inboard fog covers, and a low intercooler
scoop with an open mouth. The fog cover lettering follows each curved
cover and the arches have closed inner wheelhouses. The scoop rises
2.66 inches above the bonnet at its center. The deck and rear bumper have a recessed plate pocket, red and
clear lamp bands, a left-side exhaust, and a molded wing with curved
uprights and a lower bridge. The cabin has the wheel on the right-hand
side, and the stock 17-inch alloys have dished split spokes.
[Factory model announcement](https://www.subaru.co.jp/news/archives/98_1_3/3_16_1.html),
[rear detail photo](https://sterlingsackey.com/wp-content/uploads/2024/08/1998-Subaru-22B-STi-GC8067072-013-scaled.jpeg).

## Verification

The packaged Windows build passed **450 native checks** with zero
runtime errors. Peak sampled GPU temperature was 61.85 C.
Ten matching angles of each stock vehicle were reviewed against the prior
game build and the photo references. The final cook incorporates the roof
lettering orientation and fog-cover lettering corrections found in the first
native review.

| Suite | Passing checks | Coverage |
| --- | ---: | --- |
| Grave Digger and 22B art | 22 | Twenty fresh front, side, rear, three-quarter, and close detail captures |
| Grave Digger real-time rollover | 59 | Nine poses, buried apron rejection, and exposed loop support |
| 22B rollover with 50-inch tires | 91 | Ten poses, including oblique impacts |
| Expanded roster | 278 | Driving, braking, recovery, large tire fit and camera clearance |

The source checks passed 92 focused geometry assertions,
327 tire-fit assertions, all twelve body checks, and all sixteen
running-gear meshes. The ten changed OBJ hashes belong to the two revised
vehicles. The body collision hulls, ground probes and tire witnesses were
rebaked from the revised geometry.

The tested executable SHA-256 is
c1664da1f12f8a56eff1840d31a843ae338ba8236ce8fa43e5b51fd3ca8ff133.
The native record binds the tests to that executable, the cooked containers,
and the source inputs. The 20 FPS cap applies to these verification runs.
[Native record](grave-digger-22b-photo-native.json).
