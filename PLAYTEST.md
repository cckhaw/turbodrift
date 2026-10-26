# Real-phone playtest checklist

Automated checks (emulated 360×640 touch phone, 4× CPU throttle, Playwright) cover layout, panel cycling and frame cost. They cannot cover thumb feel, haptics or real GPU/thermal behaviour, so please run this once on a real device (open the production URL, or "Add to Home Screen" for the PWA).

## Controls
- [ ] Drag anywhere to steer; reversing direction mid-drag is instant
- [ ] Hold DRIFT through a corner, release for a boost (meter colours blue → orange → pink)
- [ ] ITEM button is reachable with the right thumb while drifting
- [ ] Tapping the map panels does **not** steer or drift
- [ ] Palm resting on the screen edge doesn't cause phantom steering

## HUD readability (sunlight if you can)
- [ ] Position number, lap timer and speed readable at arm's length
- [ ] Map dots' numbers readable; your glowing dot easy to find
- [ ] Road-ahead callout gives enough warning for hairpins on world 3
- [ ] Compact mode leaves enough road visible; Off + the *Map* chip works

## Performance / battery
- [ ] Steady frame rate for a full 3-lap race (try Battery saver if not)
- [ ] Phone not uncomfortably hot after 3 races
- [ ] Audio starts after first tap; no crackle

## Platform
- [ ] Android Chrome: vibration on drifts/boosts
- [ ] iOS Safari: no rubber-band scroll or pull-to-refresh during play; safe areas respected (notch, home bar)
- [ ] Rotating to landscape doesn't break the layout
- [ ] Offline: load once, airplane mode, relaunch, practice works
- [ ] Practice mode: all three worlds selectable

Report anything odd with the world, seed and device model.
