# Driving status, pause menu and center differential

Native verification is complete: **2,057 native checks**, **1,127 portable checks** and **245 fresh captures actually reviewed**. The interface was checked at 1600×900 and 1280×720. The [native validation record](validation-native.md) identifies the exact executable, reused cooked assets, evidence and practical limits.

## Driving status

The large upper-left information panel and bottom controls panel are replaced by a compact row of status cards at the top of the screen. Each card combines a simple icon, a label and a readable value. Available actions show their current keyboard binding beneath the value; changing a binding updates the driving display.

- Speed uses **mph**; the RPM card shows engine or motor speed and the selected direction/gear.
- Drive mode shows **AWD, 4WD, RWD or FWD** from the axles actually being driven. A permanent drivetrain is marked **FIXED** rather than suggesting that it can be switched off.
- Fitted front, center and rear mechanical locks have separate cards, with **OPEN** or **LOCKED** text and a highlighted active state. Independent wheel motors do not receive fictional mechanical differential icons.
- A part-time transfer case already couples the front and rear shafts in 4H/4L. Its center card shows the automatic coupling associated with selecting four-wheel drive.
- Tire pressure shows front/rear actual **PSI**, with the pressure-adjustment keys nearby. EVs also show battery charge.
- Garage and Pause cards keep their shortcuts visible. Small context lines retain the vehicle, surface, challenge progress and temporary notices without restoring the old panels.

## Default controls

| Action | Primary default | Additional behavior |
| --- | --- | --- |
| Accelerate / forward | W | Up arrow; gamepad right trigger |
| Brake / reverse | S | Down arrow; gamepad left trigger; hold through a stop to select reverse |
| Steer | A / D | Left/right arrows; gamepad left stick |
| Hold brake | Space | Gamepad bottom face button; holds the brake without selecting reverse |
| Garage | V | Tab remains available; stop before entering |
| Pause menu | Esc | Esc also opens this menu from the garage |
| Recover / restart | R | Restarts the active challenge when applicable |
| Next challenge | J | Advances to the next challenge |
| Four-wheel drive | F | Selectable drivetrains; stop before changing |
| Low / high range | L | When equipped; stop before shifting |
| Front / rear lock | U / Z | When fitted; existing engagement interlocks remain |
| Center lock | I | When fitted; stop, release throttle and let wheelspin settle |
| Pressure down / up | - / + | The + legend means the keyboard =/+ key; numpad -/+ also work; each press changes the target by 2 PSI |
| Crawl throttle | Left Shift | Hold while accelerating |
| Descent assist | K | Supported vehicles |
| Tracks | T | Supported vehicles; stop before changing |
| Attach / release winch | X | Q reels while held |
| Orbit / near camera | Right mouse button / C | Hold the orbit control while moving the mouse |
| Rain | P | Toggles rain |
| Reset ground / repair | Backspace | Clears session ground disturbance and repairs the vehicle |
| Regions / terrain challenges | 1–9 | Seven selects the terrain-park challenge; nine selects the rock challenge |

The controls menu contains **33 rebindable primary actions**, including each region action separately. Escape remains the fixed Pause key. Arrow keys, Tab, numpad pressure controls and the listed gamepad controls remain fixed alternates, so a custom keyboard layout retains those fallback controls. Trail hints for crawl throttle and descent assist also use the assigned keys.

## Escape menu and saved settings

Escape opens **Resume, Garage, Controls, Graphics and Exit Game**. The driving session pauses while the menu is open; opening it does not recover the vehicle or deliberately discard its momentum. Resume clears held driving demands before accepting fresh input. Garage entry remains unavailable while the vehicle is moving.

In **Controls**, select a row and press the new key. Escape cancels an unfinished binding change. A conflicting or reserved key leaves the previous assignment intact and shows a message so another key can be chosen. Keyboard actions accept a single key; camera orbit may also use a mouse button. Gamepad axes and buttons retain their standard assignments.

Successful changes save automatically. **Reset Defaults** restores and saves the complete standard keyboard layout. Control settings are independent of the selected vehicle, garage build and graphics preset. Invalid settings data is rejected as a complete layout rather than partially applying it. Escape from a settings page returns to Pause; Escape from the Pause home page resumes play.

**Graphics** uses the same settings page as the garage: Cool at 30 FPS, Balanced at 45 FPS and Quality at 60 FPS. Preset changes apply immediately and save separately from controls. Menus and garage previews are capped at 20 FPS; an unfocused game is capped at 15 FPS. These caps reduce rendering work and do not establish a particular temperature or resolve the existing quarry performance bottleneck.

## Center differential upgrade

The garage adds **CENTER DIFFERENTIAL** to the upgrade list. A compatible retrofit supplies a full-time center case with an open differential and a selectable front/rear shaft lock. With it open, the axles may turn at different speeds. Locking it couples their motion to help use traction on uneven or split-grip ground. It does not add tire grip or activate either axle locker.

| Stage | Garage name | Difference |
| --- | --- | --- |
| I | SELECTABLE | Standard center case and selectable lock; about 77 lb additional hardware |
| II | HEAVY DUTY | Higher center coupling torque capacity and reinforced case; about 106 lb |
| III | EXPEDITION | Highest center coupling torque capacity and high-load case; about 141 lb |

These are game conversion kits. Higher stages increase the coupling's supported load and hardware mass; they do not increase engine output. Stop the vehicle, release the throttle and allow wheelspin to settle before toggling **I**. Open the center lock on firm ground before tight turns.

A two-wheel-drive vehicle needs the four-wheel-drive conversion first. Existing part-time 4H/4L already couples the shafts; adding this center case changes that arrangement to permanent AWD with a selectable lock. The **G63 already has its factory center locker**, alongside its front and rear locks, and does not need a duplicate kit.

Independent axle/wheel motor arrangements—including the stock HUMMER EV and G580 and dual/quad EV swaps—have no mechanical center shaft. Their incompatible upgrade buttons are disabled. A compatible mechanical conversion can make the center case available again. An already installed kit becomes inactive when an incompatible electric layout is selected; its saved upgrade choice is retained. The G63's single-motor donor swap can select rear drive or four-wheel drive; its retained center locker can engage only with both axles selected.

The garage save format appends the new upgrade while retaining older build formats. This interface pass retains all nine vehicle models, the acquired scenery assets and the preserved browser source. The accepted [native validation record](validation-native.md) binds the unchanged assets, browser source and current player files to the tested executable.
