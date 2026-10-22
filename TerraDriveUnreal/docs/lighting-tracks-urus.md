# Lighting, tire marks and Urus Performante

The native catalog now includes a sixth vehicle: the original V8 Lamborghini
Urus Performante. All six vehicles have brake and reverse light emitters tied
to the native controls. Brake light intensity follows service braking and
descent assist; the clear reverse emitters illuminate whenever reverse is
selected. The garage switches these lights off.

S/Down and gamepad left trigger first brake forward motion. Keep the control
held at a full stop for 0.65 seconds to select reverse; the following frame
can apply reverse torque. W/Up and right trigger act symmetrically when
reversing. Space and the bottom gamepad face button remain dedicated brakes
and suppress gear changes. Simultaneous drive/brake inputs give braking priority.

Soft ground retains its existing finite footprint soil deformation, including
the physical ruts and displaced material. A bounded set of 4,096 tread/rubber
segments adds visible impressions that remain after the vehicle passes.
Marks conform to the current deformed height, and vary between compressed
snow, sand and dark soil. Pavement receives rubber marks only with longitudinal
slip or substantial lateral sliding. Airborne and constructed-surface contacts
do not paint the terrain. Teleports break trail continuity. Backspace repairs
soil and clears the marks. Marks last for the current session; they are not
written into the garage save. Oldest segments are reused at the capacity limit.

The Urus has a separately authored exterior: coupe roof, sculpted bonnet,
carbon inserts and wheel arch lips, angular intake mesh, Y light guides,
rear spoiler, quad exhaust and 22-inch split spoke wheels. Its steel coils,
rear-biased AWD and rear steering are represented with simulator tuning.
The seven upgrade categories work independently for this sixth build too.
The new save format accepts the previous five-vehicle format, preserving its
builds and adding a stock Urus. -TerraGarage="absolute/path.json" provides an
isolated live-test save so testing does not alter the player's garage.

## Manufacturer references

- [Lamborghini original Performante history](https://www.lamborghini.com/en-en/history/urus-performante): original twin-turbo V8 and chassis/design overview.
- [Lamborghini Performante brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf): exterior photographs, 22-inch rim options, steel springs and rated power/dimensions (technical tables pp. 26–27).

The selected configuration represents the 2024 original ICE Performante, not
the later SE hybrid. Factory-rated power is 490 kW, approximately 657 US hp;
666 CV is metric horsepower. The brochure lists 2,157 kg dry weight, which is not operating mass;
the game's 2,250 kg operating mass is an estimate. Suspension rates, CG,
gearing, rear steer blending and tire/soil parameters are estimates. Factory
active roll control, all drive modes and torque vectoring are not fully modeled.
The model is a procedural approximation, not manufacturer CAD. Manufacturer
photographs and brochure copies are local research only and are not distributed.

## Free environment assets actually included

- [Mossy rock set 02](https://polyhaven.com/a/rock_moss_set_02): seven scanned rock shapes with diffuse, normal and roughness textures.
- [Sorrel shrub 01](https://polyhaven.com/a/shrub_sorrel_01): eleven scanned vegetation variants with photographic maps.
- [Kloofendal partly cloudy pure sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky): photographic HDR sky.

[Poly Haven's CC0 license](https://polyhaven.com/license) permits commercial use
and redistribution. Original sources are vendored under Vendor/Environment,
with pinned download URLs, sizes and SHA-256 values. The optional preparation
tool uses the [public API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md);
the packaged game runs offline. Powered by Poly Haven asset data during preparation.

The exporter adds scanned rock/plant instances in ecological patches,
clearing region starts and challenge gates. These supplement the existing
trees, logs and detail scenery. Ground blends now use normals from all three
photographic layers, with wider meadow patches and a real cloud sky. Rocks
are fixed collision scenery; plants are nonblocking. This is a visual and
contact-detail improvement, not a replacement of the terrain with a real-world scan.

[ambientCG](https://docs.ambientcg.com/license/) is another CC0 material source
for future biome expansion. No ambientCG files are included in this release.
