# ECHO — The Living Realm

> *A world that existed before you, continues without you, remembers what you do, and may never become the same world twice.*

ECHO is a desktop RPG built around one idea: **consequence**. You begin as an ordinary person in a world that is already alive — kingdoms, a religious order, outlaws, monsters, an economy and an ecosystem — and none of it waits for you.

![A town at morning, in 3D](docs/town.png)

**Now in 3D.** Every building, tree, person, beast and boss is a low-poly model built in Blender (`blender/build_assets.py`), drawn with Three.js under a moving sun with real shadows, fog, lanterns and campfires that light the dark, windows that glow at night, crops that thin when vermin eat the fields, and snow in winter. Machines without 3D support fall back to the classic pixel-art view automatically (also switchable in the Esc menu).

![Night falls on a camp](docs/camp-night.png)

## What's in this build

Every system below is real and connected to the others. Nothing is scripted.

**A living world.** Every inhabitant is a persistent person with a name, family, traits, memories and opinions. They work, eat, feud, marry, have children, change trades, migrate when hungry, turn outlaw when desperate, rise through the ranks, and die — whether or not you're watching. Kingdoms collect taxes, pay soldiers, suffer riots, crown usurpers, declare war over hunger, and conquer each other's towns.

**Consequences that chain.** Each region has a food web. The great apex beasts keep the crop-eating vermin down. Kill one and, over the following weeks, the vermin multiply, the fields are stripped (you can see the crops thin), bread prices climb, people go hungry, migrate, riot, turn to banditry, and hungry kingdoms grow warlike. The game never tells you it was your fault.

**World intelligence.** Factions remember *how* they are being killed. Shoot the Ashfang and they start carrying shields; burn them and they ward against fire; strike at night and they post watches; kill their chiefs and chiefs keep bodyguards. Beasts evolve over generations under the same pressure (ashen wolves that won't burn, ironhide hides that turn blades), and rare mutations appear that may exist in no other world.

**Bosses that learn.** Apex monsters watch which way you dodge and strike where you're going. Turtle behind your guard and they break it. Snipe from cover and they smash the cover. Beaten, they flee — and come back armored against whatever hurt them most, and they remember you.

![A boss returns, armored against what hurt it](docs/boss-returns.png)

**Combat with weight.** Strikes chain into a three-hit combo that ends in a spinning finisher; hold the button for a heavy, guard-breaking blow that staggers whatever it hits. Every hit lands with a beat of hit-stop, sparks, a camera kick and synthesized sound; kills throw bodies back; a perfect guard rings like a bell and slows time for a moment. Foes flash before they strike so you can read them. A dodge-roll and buffered inputs keep it responsive, and loosing an arrow just as the bow reaches full draw makes a perfect shot.

**Walk inside.** Houses, inns, smithies, archives, shrines, temples and keeps can be entered. Each room is laid out and furnished (Blender-built beds, tables, hearths, shelves, thrones), and holds the people who would really be there at that hour: the innkeeper behind the bar and patrons at the tables in the evening, a family asleep at night, the ruler on the throne with guards at the pillars. Rent a bed, kneel at the shrine, read the archive, petition the throne — or slip into a stranger's house at night and search the cupboard, if no one wakes.

![Inside the inn of an evening](docs/interior-inn.png)

**No classes.** You become what you repeatedly do. Eight skills grow by use, and your *tendencies* change how your body fights: aggression quickens your strikes but thins your guard; patience makes guarding cheap; reckless overcasting makes fire mighty and unstable. Your title is a biography of how you played.

**Death makes stories.** Beasts leave you to be found by a named villager, and each fall wears your fate thinner. People take you captive, take your sword, and rise in status for it — you might meet them later as a chieftain carrying your blade. Escape, pay a ransom, or wait for rescue, and come back to a world that moved on without you.

![While you were captive](docs/while-you-were-captive.png)

**Pleas that don't wait.** "Please save my son" has a deadline. Ignore it and someone else may try — and succeed, or die. The captive may escape alone and come home changed, or join the outlaws, or be sold across the sea.

**Legacy.** When fate runs out your character dies for good and enters history. Their house stands, their sword ends up somewhere in the world (perhaps with the one who killed them), statues may rise, children are named after them, and you continue as someone new in the same world — perhaps as their kin, inheriting their house and their reputation.

![An epitaph](docs/epitaph.png)

**Civilization advances.** Kingdoms research their way out of the iron age along a mechanical or arcane path, depending on their people and on how much fire magic is thrown around in their lands. Every invention is credited to a named inventor and changes the world — crossbows, clockwork mills, lit streets at night, faster caravans — until one day the air splits open: **the Rift**, through which you can see the histories of your other worlds.

**Mysteries.** Each world generates its own dead language. Ruins hold tablets you decipher word by word; one of them leads to a sealed vault whose secret differs from world to world.

**News travels.** Rumours spread from town to town at the speed of travellers. You only know what you witnessed or heard; your deeds change how people regard you only once the story reaches them. The archives in each capital keep the full chronicle.

![Night](docs/night.png)

## Play

**Play in the browser:** `npm run build:web` produces one self-contained page at `dist/web/index.html`.

**Download:** grab the latest installer from [Releases](https://github.com/MB-125/ECHO/releases), or the newest build from the [Actions](https://github.com/MB-125/ECHO/actions) tab (open a run → *Artifacts*).

| Platform | File |
|---|---|
| Windows | `ECHO Setup x.y.z.exe` (installer) or `ECHO x.y.z.exe` (portable) |
| macOS | `ECHO-x.y.z.dmg` / `ECHO-x.y.z-arm64.dmg` — unsigned: right-click → *Open* the first time |
| Linux | `ECHO-x.y.z.AppImage` (chmod +x) or `.deb` |

**From source** (Node 18+):

```bash
git clone https://github.com/MB-125/ECHO.git
cd ECHO
npm install
npm start
```

### Controls

| | |
|---|---|
| **WASD** | move |
| **Left mouse** | strike (click in rhythm for a 3-hit combo; hold and release for a heavy blow) |
| **Right mouse** (hold) | draw and loose the bow |
| **Q** (hold) | flame — hold longer for a bigger blast; holding past full *overcharges* it, which is stronger but can turn on you or cost blood when mana runs dry |
| **Shift** | guard (tap just as a blow lands for a perfect guard) |
| **Space** | dodge |
| **R** / middle mouse | lock onto a target — you always face and aim at it; press again to release (switches to the next foe when it falls) |
| **Ctrl** | sneak — also required to strike someone who isn't your enemy |
| **F** (hold) | study a creature or boss |
| **E** | talk / interact / enter and leave buildings |
| **H / G** | eat / use herbs |
| **Tab** · **M** · **K** | journal · map · character |
| **Esc** | menu · **F11** fullscreen |

Worlds are saved automatically (each in-game day and every few minutes) to your user data folder, one file per world. They never reset.

## Build installers yourself

```bash
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

Pushing a tag such as `v0.1.0` makes GitHub Actions build all three platforms and publish a Release automatically.

## Tests

```bash
npm test
```

Runs the world simulation headless: generation, save/load, a year of history, five-year stability, faction adaptation, species evolution, decipherment — and the monster-kill cascade, comparing two identical worlds where only one loses its apex beast.

## How it's built

Plain JavaScript in an Electron shell, rendered with Three.js — no game engine. The 3D models are generated from code in Blender:

```bash
pip install bpy                      # Blender as a Python module (Python 3.11)
python blender/build_assets.py       # builds assets/models/*.glb
node tools/pack-models.js            # packs them into src/js/render/models-data.js
```

![The model set, built in Blender](docs/blender-models.png)

```
main.js, preload.js        Electron window + save files
src/js/core.js             seeded RNG, noise, names, calendar
src/js/world/worldgen.js   terrain, rivers, towns, roads, lairs, ruins
src/js/sim/                the living world (runs with or without the player)
  people.js                lives: aging, family, feuds, trades, crime, migration
  ecology.js               food web, crop damage, evolution, mutations
  economy.js               production, prices, caravans, famine aid
  politics.js              camps, raids, unrest, succession, war, conquest
  intel.js                 faction memory of the player's tactics → doctrines
  plights.js               requests with deadlines, resolved without you
  chronicle.js             history, rumour spread, reputation waves
  civ.js                   eras, inventions, the Rift
  mysteries.js             procedural language, tablets, the vault
  legacy.js                skills, Becoming, permanent death, legends
src/js/game/               real-time layer: player, AI, bosses, combat, capture
src/js/render/renderer3d.js 3D world: terrain, instanced props, animation, lighting
src/js/render/models.js     loads and prepares the Blender models
src/js/render/renderer2d.js classic pixel-art renderer (fallback)
blender/build_assets.py     every 3D model, built from code in Blender
src/js/ui/                 HUD, dialogue, trade, archive, screens
tests/run-tests.js         headless simulation tests
```

## Scope today, and where it can grow

This is a first playable slice of a very large idea. A world here holds a few hundred named people across a handful of towns rather than millions, and other worlds are your own local saves (seen through the Rift) rather than other players' servers. The architecture — a deterministic simulation that runs headless and a thin real-time layer that gives it bodies — is built to grow: bigger maps, more factions and species, multiplayer worlds, and dimensional travel between them.

Fonts: Pixelify Sans and Cormorant Garamond, SIL Open Font License 1.1.
