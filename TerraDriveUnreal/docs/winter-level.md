# Winter Expedition removed

The separate Winter Expedition destination was retired in pass 16 at the player’s request. Its garage button and 0-key travel binding, map-specific support/travel code, native map validator, preparation/survey helpers and explicit cook entries are removed. The authored IceRoad/IceRoad_Lighting maps, generated WinterExpedition map and WinterGameplay collision assets were removed from active local Content after a recovery checkpoint.

The playable destination is the native proving ground, with all nine regions and nine challenge routes. Its snow region, deformable snow, drifts, slushy fringes, winter rock details and shared scanned snow/pebble/rock maps remain. Automotive Winter Scene’s shared Megascans assets are still a separately acquired build dependency. Removing this destination does not remove the snow biome.

`Tools/validate-proving-ground-only.mjs` checks local source, Content and packaging settings. A fresh full cook is required to remove the old map from an existing Windows package. Do not use `-SkipCook` for this change. Package-level absence and new native verification belong in the current validation record.

The historically named `Tools/verify-winter.ps1` now supports only Detail, Movement and Art checks on the proving ground. `-Mode Winter` is no longer supported. `Tools/verify-model-art.ps1` is the clearer entry point for all-nine-vehicle close views.
