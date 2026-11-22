# Junk Mountain

A first-person salvage-yard game. Dig through a mountain of junk, sort it, sell it, and build
conveyor lines, sorters and burners until the yard runs itself. Somewhere in the heap is a
brown wallet holding a $4,200,000 lottery ticket.

## Play

Download the Windows installer from the **Releases** page and run `JunkMountainSetup-x.y.z.exe`.
Windows may say "Windows protected your PC" because the app isn't code-signed: click
**More info → Run anyway**.

## Controls

| Key | Action |
|---|---|
| W A S D, Shift, Space | Move, sprint, jump |
| Left mouse | Dig (hold). When holding an item: hold to charge a throw |
| Right mouse | Pick up loose junk / drop it |
| Q | Take an item out of your backpack to throw |
| E | Use: scale, sorting table, yard computer, hopper, burner |
| B | Build mode (R rotate, X demolish, 1–0 or wheel to choose) |
| 2 / X | Scanner / X-ray goggles (once bought) |
| F | Head torch |
| Tab | Journal: clues, rare finds, stats |
| Esc | Pause |

## Develop

```bash
npm install
npm run dev          # play in the browser at http://localhost:5173
npm run app          # run the desktop app
npm run dist:win     # build the Windows installer into release/
```

`npm run assets` re-downloads and optimizes the 3D models and textures (already included in `public/assets`).

## Credits

3D models and textures from [Poly Haven](https://polyhaven.com), released under CC0.
