// Game data: materials, junk types, machines, upgrades and tuning values.

export const CELL = 1.0;               // size of one pile cell in metres
export const DAY_SECONDS = 24 * 60;    // one in-game day lasts 24 real minutes
export const START_HOUR = 7.25;
export const START_MONEY = 300;
export const TICKET_PRIZE = 4_200_000;
export const MIXED_PRICE = 1.0;        // $ per kg of unsorted junk

export const PILE = {
  size: 64,        // columns per side
  maxH: 28,        // max cells per column
  radius: 27,      // metres from centre to the foot of the heap
  peak: 17,        // height of the main summit in cells (shoulders add more)
};

export const YARD = { minX: -60, maxX: 60, minZ: -56, maxZ: 76 };

// fuel: energy in kW·s per kg; burn: seconds per kg in the firebox
export const MATERIALS = {
  metal:       { name: 'Scrap metal', short: 'Metal',     price: 3,    fuel: 1.2, burn: 0.5, color: '#9aa3ab', key: 1 },
  electronics: { name: 'Electronics', short: 'E-waste',   price: 12,   fuel: 6,   burn: 0.8, color: '#3fb37f', key: 2 },
  glass:       { name: 'Glass',       short: 'Glass',     price: 4,    fuel: 0.6, burn: 0.5, color: '#7fd3e6', key: 3 },
  plastic:     { name: 'Plastic',     short: 'Plastic',   price: 2,    fuel: 40,  burn: 0.6, color: '#e8c547', key: 4 },
  rubber:      { name: 'Rubber',      short: 'Rubber',    price: 2,    fuel: 48,  burn: 2.0, color: '#4a4440', key: 5 },
  wood:        { name: 'Wood',        short: 'Wood',      price: 1.25, fuel: 22,  burn: 2.0, color: '#b07a45', key: 6 },
  cardboard:   { name: 'Cardboard',   short: 'Cardboard', price: 1,    fuel: 18,  burn: 0.4, color: '#c9a36b', key: 7 },
};
export const MATERIAL_KEYS = Object.keys(MATERIALS);

// Junk that makes up the heap. size = longest dimension in metres, w = how common.
// comp = material make-up by weight. Items with two materials of 20%+ must be taken apart to hand-sort.
export const JUNK = [
  { key: 'tire',      name: 'Old tyre',          model: 'old_tyre',                  size: 0.85, mass: 9,  comp: { rubber: 1 }, w: 9 },
  { key: 'rim',       name: 'Wheel rim',         model: 'rusted_wheel_rim_02',       size: 0.65, mass: 11, comp: { metal: 1 }, w: 5 },
  { key: 'barrel',    name: 'Oil drum',          model: 'Barrel_01',                 size: 1.0,  mass: 18, comp: { metal: 1 }, w: 6 },
  { key: 'barrel2',   name: 'Rusty drum',        model: 'barrel_03',                 size: 1.0,  mass: 16, comp: { metal: 1 }, w: 5 },
  { key: 'box',       name: 'Cardboard box',     model: 'cardboard_box_01',          size: 0.7,  mass: 2,  comp: { cardboard: 1 }, w: 9 },
  { key: 'crate',     name: 'Wooden crate',      model: 'wooden_crate_01',           size: 0.9,  mass: 9,  comp: { wood: 1 }, w: 6 },
  { key: 'crate2',    name: 'Slatted crate',     model: 'wooden_crate_02',           size: 0.9,  mass: 8,  comp: { wood: 1 }, w: 5 },
  { key: 'milcrate',  name: 'Army crate',        model: 'old_military_crate',        size: 0.95, mass: 12, comp: { wood: 1 }, w: 3 },
  { key: 'tv',        name: 'CRT television',    model: 'Television_01',             size: 0.75, mass: 22, comp: { glass: 0.4, electronics: 0.3, plastic: 0.3 }, w: 4 },
  { key: 'tv2',       name: 'Old TV set',        model: 'television_02',             size: 0.75, mass: 20, comp: { glass: 0.4, electronics: 0.3, plastic: 0.3 }, w: 3 },
  { key: 'microwave', name: 'Microwave',         model: 'vintage_microwave',         size: 0.65, mass: 14, comp: { metal: 0.6, electronics: 0.25, glass: 0.15 }, w: 3 },
  { key: 'pcrate',    name: 'Plastic crate',     model: 'plastic_crate_02',          size: 0.6,  mass: 1.5, comp: { plastic: 1 }, w: 5 },
  { key: 'pjerry',    name: 'Plastic jerrycan',  model: 'plastic_jerrycan',          size: 0.55, mass: 1.2, comp: { plastic: 1 }, w: 4 },
  { key: 'pchair',    name: 'Garden chair',      model: 'plastic_monobloc_chair_01', size: 0.9,  mass: 3,  comp: { plastic: 1 }, w: 5 },
  { key: 'mjerry',    name: 'Metal jerrycan',    model: 'metal_jerrycan_green',      size: 0.55, mass: 4,  comp: { metal: 1 }, w: 4 },
  { key: 'propane',   name: 'Gas bottle',        model: 'propane_tank',              size: 0.75, mass: 14, comp: { metal: 1 }, w: 3 },
  { key: 'wchair',    name: 'Wooden chair',      model: 'painted_wooden_chair_01',   size: 1.0,  mass: 5,  comp: { wood: 1 }, w: 4 },
  { key: 'cabinet',   name: 'Cupboard',          model: 'painted_wooden_cabinet_02', size: 1.25, mass: 22, comp: { wood: 1 }, w: 3 },
  { key: 'nightstand',name: 'Bedside table',     model: 'painted_wooden_nightstand', size: 0.65, mass: 9,  comp: { wood: 1 }, w: 3 },
  { key: 'aircon',    name: 'Air-con unit',      model: 'exterior_aircon_unit',      size: 0.95, mass: 38, comp: { metal: 0.6, electronics: 0.25, plastic: 0.15 }, w: 2 },
  { key: 'trashcan',  name: 'Dustbin',           model: 'metal_trash_can',           size: 0.85, mass: 7,  comp: { metal: 1 }, w: 4 },
  { key: 'trashbag',  name: 'Bin bag',           model: 'trashbag',                  size: 0.75, mass: 5,  comp: { cardboard: 0.6, plastic: 0.4 }, w: 7 },
  { key: 'boombox',   name: 'Boombox',           model: 'boombox',                   size: 0.6,  mass: 4,  comp: { plastic: 0.5, electronics: 0.5 }, w: 2 },
  { key: 'stove',     name: 'Electric cooker',   model: 'electric_stove',            size: 1.05, mass: 48, comp: { metal: 0.7, electronics: 0.2, glass: 0.1 }, w: 2 },
  { key: 'sofa',      name: 'Sofa',              model: 'sofa_02',                   size: 1.7,  mass: 32, comp: { wood: 0.6, plastic: 0.4 }, w: 2 },
  { key: 'armchair',  name: 'Armchair',          model: 'ArmChair_01',               size: 1.05, mass: 18, comp: { wood: 0.6, plastic: 0.4 }, w: 2 },
  { key: 'bottles',   name: 'Bottles',           model: 'wine_bottles_01',           size: 0.45, mass: 3,  comp: { glass: 1 }, w: 5, cluster: 2 },
  { key: 'can',       name: 'Rusty cans',        model: 'can_rusted',                size: 0.3,  mass: 1,  comp: { metal: 1 }, w: 5, cluster: 3 },
  { key: 'gallon',    name: 'Water bottles',     model: 'plastic_bottle_gallon',     size: 0.4,  mass: 0.6, comp: { plastic: 1 }, w: 4, cluster: 3 },
  { key: 'toolbox',   name: 'Toolbox',           model: 'metal_toolbox',             size: 0.6,  mass: 6,  comp: { metal: 1 }, w: 3 },
  { key: 'generator', name: 'Broken generator',  model: 'portable_generator',        size: 0.85, mass: 30, comp: { metal: 0.7, electronics: 0.3 }, w: 1 },
  { key: 'bedframe',  name: 'Bed frame',         model: 'old_bed_frame',             size: 2.0,  mass: 25, comp: { metal: 1 }, w: 1 },
];
JUNK.forEach((j, i) => { j.id = i + 1; j.primary = Object.entries(j.comp).sort((a, b) => b[1] - a[1])[0][0];
  j.composite = Object.values(j.comp).filter(v => v >= 0.2).length > 1; });
export const JUNK_BY_KEY = Object.fromEntries(JUNK.map(j => [j.key, j]));

// Special cell ids
export const CELL_WALLET = 200;
export const CELL_CLUE = 201;   // 201..206
export const CELL_RARE = 220;   // 220..227

export const RARES = [
  { key: 'watch',   name: 'Gold pocket watch', model: 'vintage_pocket_watch',      size: 0.25, value: 1200 },
  { key: 'radio',   name: 'Army radio set',    model: 'vintage_radio_transceiver', size: 0.6,  value: 900 },
  { key: 'console', name: 'Retro games console', model: 'gaming_console',          size: 0.45, value: 1500 },
  { key: 'tape',    name: 'Cassette Walkman',  model: 'cassette_player',           size: 0.3,  value: 600 },
  { key: 'gnome',   name: 'Lucky garden gnome', model: 'garden_gnome',             size: 0.5,  value: 400 },
  { key: 'duck',    name: 'Rubber duck',       model: 'rubber_duck_toy',           size: 0.25, value: 250 },
  { key: 'camcorder', name: '80s camcorder',   model: 'vintage_video_camera',      size: 0.45, value: 1100 },
  { key: 'camera',  name: 'Film camera',       model: 'Camera_01',                 size: 0.3,  value: 2000 },
];

// Tools. dig = seconds per item, radius = extra items around the hit, reach in metres.
export const TOOLS = [
  { key: 'spade',   name: 'Rusty spade',        model: 'rusted_spade_01', price: 0,     dig: 0.55, radius: 0, reach: 3.4, desc: 'It came with the yard. Slow but honest.' },
  { key: 'pickaxe', name: 'Pickaxe',            model: 'picke_dirty_01',  price: 450,   dig: 0.32, radius: 0, reach: 3.6, desc: 'Breaks things loose about twice as fast.' },
  { key: 'sledge',  name: 'Sledgehammer',       model: 'sledgehammer_01', price: 3200,  dig: 0.42, radius: 1, reach: 3.8, desc: 'Each swing knocks loose a small cluster of junk.' },
  { key: 'crowbar', name: 'Hydraulic crowbar',  model: 'crowbar_01',      price: 14000, dig: 0.16, radius: 1, reach: 4.2, desc: 'Pries out junk as fast as you can catch it.' },
];

export const BACKPACKS = [
  { name: 'Shoulder bag', cap: 40, price: 0 },
  { name: 'Duffel bag', cap: 90, price: 180 },
  { name: 'Hiking pack', cap: 180, price: 1100 },
  { name: 'Hauler frame', cap: 400, price: 5200 },
];

export const SCANNERS = [
  { key: 'detector', name: 'Metal detector', price: 1500, range: 9,  desc: 'Beeps faster as you get close to the wallet’s metal zip.' },
  { key: 'deep',     name: 'Deep scanner',   price: 8000, range: 20, desc: 'Longer range, and shows the distance to the wallet.' },
  { key: 'xray',     name: 'X-ray goggles',  price: 25000, range: 12, desc: 'See the wallet and rare finds glowing through the junk.' },
];

export const UPGRADES = [
  { key: 'belt1', name: 'Faster belts I',  price: 1200, desc: 'Belt speed +40%.' },
  { key: 'belt2', name: 'Faster belts II', price: 5000, desc: 'Belt speed +40% more.', req: 'belt1' },
  { key: 'torch', name: 'Brighter head torch', price: 300, desc: 'Lights up the heap twice as far at night.' },
];

// Buildable machines. power: kW drawn (negative = produces). size in cells [w, d].
export const MACHINES = [
  { id: 'belt',     name: 'Conveyor belt',      price: 40,   power: 1,  size: [1, 1], desc: 'Moves junk along. Click and drag to lay a line.' },
  { id: 'hopper',   name: 'Hopper',             price: 250,  power: 2,  size: [1, 1], desc: 'Throw junk in or dump your backpack. Feeds it onto the belt in front.' },
  { id: 'burner',   name: 'Burner',             price: 600,  power: 0,  size: [2, 2], gen: 30, desc: 'Burns anything for power. Rubber and plastic burn best; metal and glass barely burn.' },
  { id: 'pole',     name: 'Power pole',         price: 60,   power: 0,  size: [1, 1], range: 9, desc: 'Connects anything within 9 m. Poles link to each other.' },
  { id: 'battery',  name: 'Battery bank',       price: 900,  power: 0,  size: [1, 1], cap: 15000, rate: 40, desc: 'Stores spare power so the yard keeps running at night.' },
  { id: 'magnet',   name: 'Magnet separator',   price: 800,  power: 5,  size: [1, 1], filter: 'metal', desc: 'Pulls scrap metal off to the left-hand belt. Everything else goes straight on.' },
  { id: 'eddy',     name: 'Copper separator',   price: 1500, power: 6,  size: [1, 1], filter: 'electronics', desc: 'Pulls electronics off to the left.' },
  { id: 'blower',   name: 'Air blower',         price: 1100, power: 4,  size: [1, 1], filter: 'plastic', desc: 'Blows light plastic off to the left.' },
  { id: 'screen',   name: 'Glass screen',       price: 1000, power: 3,  size: [1, 1], filter: 'glass', desc: 'Glass drops through to the left.' },
  { id: 'rubbersep',name: 'Rubber picker',      price: 900,  power: 3,  size: [1, 1], filter: 'rubber', desc: 'Grabs rubber and sends it left.' },
  { id: 'woodsep',  name: 'Fuel picker',        price: 900,  power: 3,  size: [1, 1], filter: ['wood', 'cardboard'], desc: 'Picks out wood and cardboard and sends them left.' },
  { id: 'shredder', name: 'Shredder',           price: 2500, power: 15, size: [1, 1], desc: 'Rips appliances into pure material chunks so the sorters can split them.' },
  { id: 'digger',   name: 'Auto-digger',        price: 3000, power: 10, size: [1, 1], reach: 8, desc: 'Digs the heap by itself and drops junk on the belt in front. Place it near the heap.' },
  { id: 'flood',    name: 'Floodlight',         price: 300,  power: 1,  size: [1, 1], desc: 'Lights up the yard at night.' },
];
export const MACHINE_BY_ID = Object.fromEntries(MACHINES.map(m => [m.id, m]));

export const BELT_HEIGHT = 0.62;
export const BELT_SPEED = 1.3;
export const DEMOLISH_REFUND = 0.75;
