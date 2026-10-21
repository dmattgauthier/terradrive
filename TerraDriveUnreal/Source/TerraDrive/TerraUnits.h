#pragma once

// Simulation remains SI; every player-facing measurement uses these conversions.
namespace TerraUnits {
constexpr float MPH(float metresPerSecond) { return metresPerSecond * 2.2369362921f; }
constexpr float Feet(float metres) { return metres * 3.280839895f; }
constexpr float Inches(float metres) { return metres * 39.37007874f; }
constexpr float Pounds(float kilograms) { return kilograms * 2.204622622f; }
constexpr float PoundsForce(float newtons) { return newtons * .2248089431f; }
}
