import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREAS, LIFE_AREA_NAMES, LIFE_AREA_DARK, LIFE_AREA_LIGHT } from '../data.js';

const UNASSIGNED_LIFE_AREA = '__unassigned__';

function slugId(label, prefix='item') {
  const base = String(label||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return base || `${prefix}_${Date.now()}`;
}

function tagColors(seed) {
  const palette = [
    ['rgba(251,207,232,.22)','#fbcfe8','#fce7f3','#9d174d'],
    ['rgba(254,202,202,.22)','#fecaca','#fee2e2','#991b1b'],
    ['rgba(254,215,170,.22)','#fed7aa','#ffedd5','#9a3412'],
    ['rgba(254,240,138,.22)','#fef08a','#fef9c3','#854d0e'],
    ['rgba(187,247,208,.22)','#bbf7d0','#dcfce7','#166534'],
    ['rgba(153,246,228,.22)','#99f6e4','#ccfbf1','#115e59'],
    ['rgba(186,230,253,.22)','#bae6fd','#e0f2fe','#075985'],
    ['rgba(199,210,254,.22)','#c7d2fe','#e0e7ff','#3730a3'],
    ['rgba(221,214,254,.22)','#ddd6fe','#ede9fe','#5b21b6'],
    ['rgba(226,232,240,.20)','#cbd5e1','#f1f5f9','#475569'],
  ];
  const n = String(seed||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const p = palette[n % palette.length];
  return { dark:{bg:p[0],fg:p[1]}, light:{bg:p[2],fg:p[3]} };
}

function lifeAreaPalette(id, theme='dark') {
  const pal = theme==='dark' ? LIFE_AREA_DARK : LIFE_AREA_LIGHT;
  return pal[id] || pal.admin || tagColors(id || 'life-area')[theme];
}

function syncTaxonomyGlobals(taxonomy) {
  const contexts = taxonomy?.contexts?.length ? taxonomy.contexts : PROJ;
  const tags = taxonomy?.tags?.length ? taxonomy.tags : ALL_TAGS.map(id=>({id,label:TAG_NAMES[id]||id,...tagColors(id)}));
  const lifeAreas = taxonomy?.lifeAreas?.length ? taxonomy.lifeAreas : LIFE_AREAS.map(id=>({
    id,
    label:LIFE_AREA_NAMES[id]||id,
    color:(LIFE_AREA_LIGHT[id]||tagColors(id).light).fg,
    dark:LIFE_AREA_DARK[id]||tagColors(id).dark,
    light:LIFE_AREA_LIGHT[id]||tagColors(id).light,
  }));
  PROJ.splice(0, PROJ.length, ...contexts.map(c=>({id:c.id,label:c.label,color:c.color})));
  ALL_TAGS.splice(0, ALL_TAGS.length, ...tags.map(t=>t.id));
  LIFE_AREAS.splice(0, LIFE_AREAS.length, ...lifeAreas.map(a=>a.id));
  Object.keys(TAG_NAMES).forEach(k=>delete TAG_NAMES[k]);
  Object.keys(LIFE_AREA_NAMES).forEach(k=>delete LIFE_AREA_NAMES[k]);
  tags.forEach(t=>{ TAG_NAMES[t.id]=t.label; });
  lifeAreas.forEach(a=>{ LIFE_AREA_NAMES[a.id]=a.label; });
  tags.forEach(t=>{
    const fallback = tagColors(t.id);
    TAG_DARK[t.id] = t.dark || fallback.dark;
    TAG_LIGHT[t.id] = t.light || fallback.light;
  });
  lifeAreas.forEach(a=>{
    const fallback = tagColors(a.id);
    LIFE_AREA_DARK[a.id] = a.dark || fallback.dark;
    LIFE_AREA_LIGHT[a.id] = a.light || fallback.light;
  });
}

const NICE_SWATCH_GROUPS = [
  {name:'Pastel', colors:[
    ['Blush','#fce7f3','#9d174d'],['Petal','#ffe4e6','#9f1239'],['Shell','#ffe4dc','#9f2d14'],
    ['Peach','#ffedd5','#9a3412'],['Apricot','#ffead0','#a0440e'],['Cream','#fef3c7','#92400e'],
    ['Butter','#fef9c3','#854d0e'],['Lemon','#fef08a','#713f12'],['Pear','#ecfccb','#3f6212'],
    ['Pistachio','#dcfce7','#166534'],['Mint','#d1fae5','#065f46'],['Seafoam','#ccfbf1','#115e59'],
    ['Aqua Wash','#cffafe','#155e75'],['Sky','#e0f2fe','#075985'],['Powder','#dbeafe','#1e40af'],
    ['Periwinkle','#e0e7ff','#3730a3'],['Lavender','#ede9fe','#5b21b6'],['Wisteria','#f3e8ff','#6b21a8'],
    ['Lilac','#fae8ff','#86198f'],['Candy','#fce7f3','#be185d'],['Oat','#f5efe6','#6f4e37'],
    ['Linen','#faf3e8','#7c4a1d'],['Fog','#f3f4f6','#4b5563'],['Mist','#f1f5f9','#475569'],
  ]},
  {name:'Soft', colors:[
    ['Rose','#fda4af','#be123c'],['Salmon','#fca5a5','#b91c1c'],['Coral','#fdba74','#c2410c'],
    ['Tangerine','#fed7aa','#c2410c'],['Honey','#fde68a','#a16207'],['Marigold','#fcd34d','#92400e'],
    ['Chartreuse','#d9f99d','#4d7c0f'],['Sage','#bef264','#4d7c0f'],['Meadow','#86efac','#15803d'],
    ['Clover','#6ee7b7','#047857'],['Teal','#5eead4','#0f766e'],['Lagoon','#99f6e4','#0f766e'],
    ['Aqua','#67e8f9','#0e7490'],['Ice','#a5f3fc','#155e75'],['Blue','#93c5fd','#1d4ed8'],
    ['Cornflower','#bfdbfe','#1d4ed8'],['Violet','#c4b5fd','#6d28d9'],['Iris','#ddd6fe','#6d28d9'],
    ['Orchid','#f0abfc','#a21caf'],['Pink','#f9a8d4','#be185d'],['Raspberry','#f9a8d4','#9d174d'],
    ['Blue Grey','#cbd5e1','#475569'],['Warm Grey','#d6d3d1','#57534e'],['Slate','#b6c2d1','#334155'],
  ]},
  {name:'Earthy', colors:[
    ['Clay','#d6a17a','#7c2d12'],['Adobe','#c98b68','#7c2d12'],['Terracotta','#f2a37b','#9a3412'],
    ['Rust','#d8895f','#7c2d12'],['Canyon','#e1b07e','#854d0e'],['Sand','#e7d8ad','#765d16'],
    ['Straw','#ddd093','#5f520e'],['Olive','#b7c58b','#4d5f12'],['Moss','#a8b879','#3f6212'],
    ['Fern','#9cc7a4','#166534'],['Pine Wash','#8fbca0','#14532d'],['Eucalyptus','#9ac7bd','#115e59'],
    ['Juniper','#86b6ad','#134e4a'],['Rain','#9dbfca','#164e63'],['Denim','#9bb8d8','#1e3a8a'],
    ['Dusk','#afa7cf','#4c1d95'],['Heather','#c4a7c9','#6b216f'],['Mauve','#d8a9c5','#831843'],
    ['Cocoa','#b89b86','#5b3425'],['Mocha','#a78b7a','#4b2e22'],['Walnut','#917567','#3f2a20'],
    ['Stone','#b8b4aa','#57534e'],['Smoke','#a8a29e','#44403c'],['Ink','#94a3b8','#334155'],
  ]},
  {name:'Vivid', colors:[
    ['Red','#ef4444','#991b1b'],['Cherry','#dc2626','#7f1d1d'],['Orange','#f97316','#9a3412'],
    ['Tangerine','#fb923c','#9a3412'],['Amber','#f59e0b','#92400e'],['Gold','#eab308','#854d0e'],
    ['Lime','#84cc16','#3f6212'],['Grass','#65a30d','#365314'],['Green','#22c55e','#166534'],
    ['Emerald','#10b981','#047857'],['Jade','#14b8a6','#0f766e'],['Teal','#0d9488','#115e59'],
    ['Cyan','#06b6d4','#0e7490'],['Azure','#0ea5e9','#0369a1'],['Sky','#38bdf8','#075985'],
    ['Blue','#3b82f6','#1d4ed8'],['Royal','#2563eb','#1e3a8a'],['Indigo','#6366f1','#4338ca'],
    ['Violet','#8b5cf6','#6d28d9'],['Purple','#a855f7','#7e22ce'],['Fuchsia','#d946ef','#a21caf'],
    ['Magenta','#ec4899','#be185d'],['Pink','#f43f5e','#be123c'],['Crimson','#e11d48','#9f1239'],
  ]},
  {name:'Neutral', colors:[
    ['White','#fafafa','#404040'],['Pearl','#f5f5f4','#44403c'],['Cloud','#e5e7eb','#4b5563'],
    ['Ash','#e7e5e4','#57534e'],['Silver','#d4d4d8','#52525b'],['Pewter','#c7c7c7','#404040'],
    ['Slate','#94a3b8','#334155'],['Blue Slate','#9ca3af','#374151'],['Taupe','#a8a29e','#57534e'],
    ['Greige','#bbb2a6','#57534e'],['Graphite','#737373','#404040'],['Charcoal','#525252','#262626'],
    ['Night','#334155','#e2e8f0'],['Ink','#1f2937','#f3f4f6'],['Black','#111827','#f9fafb'],
  ]},
  {name:'Candy Pastel', colors:[
    ['Cotton Candy','#ffd6e8','#9d174d'],['Bubblegum','#ffc9de','#9f1239'],['Sorbet','#ffd0c2','#9a3412'],
    ['Creamsicle','#ffd8a8','#9a3412'],['Vanilla','#fff0b8','#854d0e'],['Banana Milk','#fff7a8','#713f12'],
    ['Key Lime','#dff7a8','#3f6212'],['Melon','#c8f7c5','#166534'],['Mint Cream','#bdf7df','#065f46'],
    ['Blue Taffy','#bdf2ff','#155e75'],['Cloud Blue','#cfe6ff','#1e40af'],['Grape Soda','#dbcfff','#5b21b6'],
    ['Marshmallow','#f3dbff','#86198f'],['Sugar Plum','#ffd6f4','#9d174d'],['Macaron','#f7e7d4','#6f4e37'],
    ['Frosting','#f7f1ff','#6b21a8'],['Powder Puff','#f0f7ff','#1e3a8a'],['Confetti','#f8fafc','#475569'],
  ]},
  {name:'Botanical', colors:[
    ['Moss Milk','#dbe8bd','#4d5f12'],['Olive Leaf','#c9d79a','#4d5f12'],['Sagebrush','#c9d7bf','#3f6212'],
    ['Fern Mist','#b8d7b9','#166534'],['Clover Soft','#a9dfbf','#15803d'],['Mint Leaf','#a6e3cf','#047857'],
    ['Eucalyptus','#a7d4ca','#115e59'],['Spruce Wash','#91beb3','#134e4a'],['Lichen','#d2d2a1','#5f520e'],
    ['Bamboo','#e0d99b','#765d16'],['Pollen','#f0d980','#92400e'],['Terrarium','#b6cc8f','#3f6212'],
    ['Aloe','#95d5b2','#166534'],['Sea Grass','#8ed6c4','#0f766e'],['Canopy','#78b88a','#14532d'],
    ['Pine','#5f9672','#f0fdf4'],['Forest','#47755a','#ecfdf5'],['Mushroom','#c9b7a2','#5b3425'],
  ]},
  {name:'Coastal', colors:[
    ['Foam','#d9fbf4','#115e59'],['Sea Glass','#b7efe5','#0f766e'],['Tide Pool','#9ee6df','#0f766e'],
    ['Lagoon','#8bdde8','#0e7490'],['Aqua Haze','#b5edf7','#155e75'],['Shallow','#c6e8ff','#075985'],
    ['Skyline','#afd7ff','#1d4ed8'],['Harbor Blue','#94bde6','#1e3a8a'],['Denim Tide','#7ea5d8','#1e3a8a'],
    ['Shell Pink','#ffd8d2','#9f1239'],['Coral Reef','#f5a992','#9a3412'],['Sand Dollar','#eadfbd','#765d16'],
    ['Driftwood','#c8b7a0','#57534e'],['Pebble','#b9c0bd','#475569'],['Storm','#8197a8','#334155'],
    ['Deep Sea','#3f7284','#e0f2fe'],['Navy Pier','#31506f','#dbeafe'],['Kelp','#6a8f79','#ecfdf5'],
  ]},
  {name:'Sunset', colors:[
    ['Afterglow','#ffe1cc','#9a3412'],['Peach Sky','#ffc9a8','#9a3412'],['Coral Sun','#ffad99','#991b1b'],
    ['Flamingo','#ff9eb5','#9f1239'],['Rose Glow','#f6a2c8','#9d174d'],['Orchid Sky','#d7a6e8','#6b21a8'],
    ['Lavender Hour','#b9a7e8','#4c1d95'],['Blue Hour','#93acd8','#1e3a8a'],['Dusk Blue','#7389bf','#eef2ff'],
    ['Amber Light','#f8c76d','#92400e'],['Honey Gold','#eeb85c','#854d0e'],['Persimmon','#e8875c','#7c2d12'],
    ['Burnt Rose','#d96f7f','#7f1d1d'],['Plum Dust','#aa6d95','#fdf2f8'],['Twilight','#705f95','#ede9fe'],
    ['Cinder','#7b6b73','#f5f5f4'],['Warm Stone','#b59c85','#4b2e22'],['Nightfall','#384260','#e0e7ff'],
  ]},
  {name:'Jewel', colors:[
    ['Ruby','#dc2626','#fee2e2'],['Garnet','#b91c1c','#fee2e2'],['Topaz','#d97706','#fff7ed'],
    ['Citrine','#ca8a04','#fef9c3'],['Peridot','#65a30d','#ecfccb'],['Emerald','#059669','#d1fae5'],
    ['Jade','#0d9488','#ccfbf1'],['Turquoise','#0891b2','#cffafe'],['Sapphire','#2563eb','#dbeafe'],
    ['Cobalt','#1d4ed8','#dbeafe'],['Amethyst','#7c3aed','#ede9fe'],['Violet Gem','#9333ea','#f3e8ff'],
    ['Pink Tourmaline','#db2777','#fce7f3'],['Spinel','#e11d48','#ffe4e6'],['Onyx','#1f2937','#f9fafb'],
    ['Moonstone','#cbd5e1','#334155'],['Opal','#bae6fd','#075985'],['Pearl','#f5f5f4','#44403c'],
  ]},
  {name:'Vintage', colors:[
    ['Faded Rose','#d8a2a8','#7f1d1d'],['Dusty Pink','#d6a3bd','#831843'],['Tea Rose','#e7b7a6','#7c2d12'],
    ['Apricot Jam','#e6b17e','#854d0e'],['Mustard','#d4b45f','#713f12'],['Old Gold','#c7aa57','#5f520e'],
    ['Avocado','#a8a968','#3f6212'],['Sage','#a8b89a','#3f6212'],['Patina','#8fb8aa','#115e59'],
    ['Powder Blue','#9eb8d4','#1e3a8a'],['Faded Denim','#819bc2','#1e3a8a'],['Dusty Violet','#a69ac2','#4c1d95'],
    ['Mauve','#b98cab','#831843'],['Sepia','#9f8068','#4b2e22'],['Parchment','#e8d9ba','#765d16'],
    ['Smoke','#9f9a91','#44403c'],['Charcoal Blue','#5e6a7d','#e0e7ff'],['Library Green','#58735e','#ecfdf5'],
  ]},
  {name:'Cafe', colors:[
    ['Milk','#fbf4e8','#6f4e37'],['Cream','#f4e2c6','#765d16'],['Biscuit','#e8cfa7','#765d16'],
    ['Latte','#d7b996','#5b3425'],['Caramel','#c8955e','#4b2e22'],['Toffee','#b57a48','#fff7ed'],
    ['Mocha','#8f6a56','#fff7ed'],['Cocoa','#72513f','#fef3c7'],['Espresso','#4a3328','#f5efe6'],
    ['Pistachio Gelato','#c8d9a3','#4d5f12'],['Matcha','#9fbf7a','#3f6212'],['Rose Milk','#f0c7c9','#9f1239'],
    ['Blueberry Cream','#b8c6e2','#1e3a8a'],['Lavender Latte','#d1c2e8','#5b21b6'],['Honey Foam','#f6d98f','#854d0e'],
    ['Ceramic','#d8d5cc','#57534e'],['Napkin','#f5f0e8','#57534e'],['Ink Menu','#334155','#f8fafc'],
  ]},
  {name:'High Contrast', colors:[
    ['Signal Red','#ef4444','#ffffff'],['Safety Orange','#f97316','#111827'],['Bright Amber','#facc15','#111827'],
    ['Electric Lime','#a3e635','#111827'],['Action Green','#22c55e','#052e16'],['Mint Pop','#2dd4bf','#042f2e'],
    ['Cyan Pop','#22d3ee','#083344'],['Sky Pop','#38bdf8','#082f49'],['Blue Pop','#3b82f6','#eff6ff'],
    ['Indigo Pop','#6366f1','#eef2ff'],['Violet Pop','#8b5cf6','#f5f3ff'],['Purple Pop','#a855f7','#faf5ff'],
    ['Fuchsia Pop','#d946ef','#fdf4ff'],['Pink Pop','#ec4899','#fdf2f8'],['Rose Pop','#f43f5e','#fff1f2'],
    ['White Hot','#ffffff','#111827'],['Black Hot','#000000','#ffffff'],['Slate Hot','#475569','#f8fafc'],
  ]},
  {name:'Nordic Frost', colors:[
    ['Snowdrift','#eef6fb','#164e63'],['Glacier','#d9edf7','#075985'],['Ice Blue','#c5e4f3','#075985'],
    ['Fjord','#a9cfe3','#1e3a8a'],['Arctic Sky','#b9d7f4','#1d4ed8'],['Blue Mist','#ced9ed','#3730a3'],
    ['Aurora Green','#b7e3d0','#047857'],['Frozen Mint','#c9f1e3','#065f46'],['Pine Frost','#a8c8bb','#14532d'],
    ['Lichen Frost','#d4ddb8','#4d5f12'],['Cold Stone','#c9ced6','#475569'],['Granite','#aeb7c2','#334155'],
    ['Polar Night','#52637b','#f8fafc'],['Deep Fjord','#3c5870','#e0f2fe'],['Aurora Violet','#c9c5ee','#5b21b6'],
    ['Ice Rose','#ead0dd','#9d174d'],['Birch','#e8e0d0','#57534e'],['Graphite Ice','#7f8a99','#f1f5f9'],
  ]},
  {name:'Desert Bloom', colors:[
    ['Dune','#ead7ad','#765d16'],['Sandstone','#dfbd8a','#854d0e'],['Sunbaked','#d89a64','#7c2d12'],
    ['Terracotta Bloom','#c9775e','#fff7ed'],['Cactus Flower','#e59ab1','#9f1239'],['Prickly Pear','#d67eb2','#831843'],
    ['Saguaro','#8fbf87','#166534'],['Agave','#8bb6a5','#115e59'],['Yucca','#c7d5a8','#4d7c0f'],
    ['Desert Sage','#b7b99a','#57534e'],['Adobe Pink','#e9b5a5','#9a3412'],['Clay Path','#b9856b','#5b3425'],
    ['Copper Sky','#e7a66f','#7c2d12'],['Mesa Purple','#a98bb6','#581c87'],['Twilight Sand','#c9a9a0','#7f1d1d'],
    ['Oasis','#75b8ad','#0f766e'],['Mirage Blue','#9cc6df','#075985'],['Night Sand','#7b6c61','#f5efe6'],
  ]},
  {name:'Neon Pastel', colors:[
    ['Neon Blush','#ffb3d1','#9d174d'],['Laser Pink','#ff8fc7','#831843'],['Hot Peach','#ffb08a','#9a3412'],
    ['Glow Orange','#ffc56b','#854d0e'],['Acid Cream','#f7ff8a','#4d7c0f'],['Electric Pear','#d7ff73','#3f6212'],
    ['Lime Glow','#a7f970','#166534'],['Mint Beam','#7af5c9','#047857'],['Aqua Beam','#70f1ed','#0e7490'],
    ['Cyber Sky','#74d9ff','#075985'],['Hyper Blue','#8db8ff','#1d4ed8'],['Pixel Periwinkle','#aaa2ff','#4338ca'],
    ['Ultra Violet','#c792ff','#6d28d9'],['Neon Lilac','#ec9cff','#86198f'],['Synth Pink','#ff8fdf','#9d174d'],
    ['Soft Blacklight','#6266a3','#f5f3ff'],['Chrome Glow','#c9d4e5','#334155'],['White Neon','#fbfbff','#111827'],
  ]},
  {name:'Autumn Orchard', colors:[
    ['Apple Skin','#d65252','#7f1d1d'],['Cranberry','#b8455d','#fff1f2'],['Pumpkin','#d9783d','#7c2d12'],
    ['Persimmon','#e08c52','#854d0e'],['Cider','#d9a44f','#713f12'],['Golden Pear','#ccb84a','#5f520e'],
    ['Olive Grove','#9fa65a','#3f6212'],['Sage Leaf','#9db07d','#365314'],['Fallen Leaf','#b87945','#4b2e22'],
    ['Maple','#bf5f3a','#fff7ed'],['Chestnut','#8d5a3f','#f5efe6'],['Bark','#6e5040','#f5efe6'],
    ['Plum Jam','#895071','#fdf2f8'],['Fig','#756081','#ede9fe'],['Foggy Morning','#b8aca0','#57534e'],
    ['Mushroom','#c2ae98','#57534e'],['Harvest Sky','#98abc9','#1e3a8a'],['Evergreen','#56765d','#ecfdf5'],
  ]},
  {name:'Spring Garden', colors:[
    ['Cherry Blossom','#ffd7e2','#9f1239'],['Tulip Pink','#f8a7bd','#9d174d'],['Peony','#efb4d7','#831843'],
    ['Daffodil','#f7dc6f','#713f12'],['Buttercup','#fff08a','#854d0e'],['New Leaf','#bde77f','#3f6212'],
    ['Fresh Grass','#8ee68e','#166534'],['Garden Mint','#a5f3d0','#047857'],['Bluebell','#b9c9ff','#3730a3'],
    ['Hyacinth','#cdb7ff','#5b21b6'],['Iris','#c6a4e3','#6b21a8'],['Lilac Mist','#ecd5ff','#86198f'],
    ['Pansy','#9a8fd8','#f5f3ff'],['Rain Cloud','#cdd8e4','#475569'],['Morning Sky','#c2e5ff','#075985'],
    ['Seedling','#cde5b0','#4d7c0f'],['Clay Pot','#c98a72','#7c2d12'],['Garden Soil','#7a5b46','#f5efe6'],
  ]},
  {name:'Deep Ocean', colors:[
    ['Abyss','#16324f','#e0f2fe'],['Deep Navy','#1e3a5f','#dbeafe'],['Blue Whale','#28567a','#e0f2fe'],
    ['Pacific','#2d7796','#cffafe'],['Reef Blue','#3aa6b9','#083344'],['Tropical Teal','#42b8ad','#042f2e'],
    ['Kelp Green','#5f9672','#ecfdf5'],['Sea Turtle','#79a889','#14532d'],['Foam Line','#c6f2e7','#115e59'],
    ['Pearl Shell','#eee5d7','#57534e'],['Coral Pink','#f2a0a0','#991b1b'],['Anemone','#e983b5','#831843'],
    ['Urchin Purple','#9278bd','#f5f3ff'],['Storm Wave','#6f8799','#f8fafc'],['Wet Stone','#87939b','#334155'],
    ['Sargasso','#b7b269','#4d5f12'],['Sunlit Water','#8bd3ea','#075985'],['Midnight Tide','#24384c','#f8fafc'],
  ]},
  {name:'Studio Ghibli-ish', colors:[
    ['Meadow Path','#b9d48c','#3f6212'],['Soft Moss','#9fc393','#166534'],['River Mint','#9fd8c5','#115e59'],
    ['Washed Sky','#b8dcf5','#075985'],['Dusty Blue','#93aacd','#1e3a8a'],['Cloud Shadow','#c9d1d8','#475569'],
    ['Totoro Grey','#9da3a0','#44403c'],['Warm Hay','#e8d08b','#765d16'],['Bread Crust','#c99462','#5b3425'],
    ['Tomato Red','#d86d5f','#7f1d1d'],['Radish Pink','#f0a9b6','#9f1239'],['Flower Purple','#b59bd6','#5b21b6'],
    ['Evening Violet','#8f83b7','#f5f3ff'],['Tea Green','#c8d6a0','#4d7c0f'],['Forest Shade','#5f8068','#ecfdf5'],
    ['Clay Roof','#bd745d','#fff7ed'],['Paper Lantern','#f4d596','#854d0e'],['Ink Wash','#5c6873','#f8fafc'],
  ]},
  {name:'Muted Professional', colors:[
    ['Executive Blue','#6f8fb4','#1e3a8a'],['Steel','#7f96aa','#f8fafc'],['Slate Desk','#64748b','#f8fafc'],
    ['Calm Teal','#6aa99f','#0f766e'],['Sage Office','#93aa82','#3f6212'],['Olive Note','#a3a16f','#4d5f12'],
    ['Document Tan','#d8c39e','#765d16'],['Muted Gold','#c6a75d','#713f12'],['Copper Note','#b98568','#5b3425'],
    ['Brick Soft','#b66a63','#7f1d1d'],['Wine Accent','#9a5b73','#fdf2f8'],['Plum Grey','#8b789a','#f5f3ff'],
    ['Soft Purple','#a99bc4','#4c1d95'],['Neutral Grey','#a3a3a3','#404040'],['Warm Grey','#aaa19a','#44403c'],
    ['Charcoal','#475569','#f8fafc'],['Paper','#f3f0e8','#57534e'],['Ink','#1f2937','#f9fafb'],
  ]},
  {name:'Retro Arcade', colors:[
    ['CRT Red','#ff5c5c','#7f1d1d'],['Pixel Orange','#ff9f43','#111827'],['Coin Gold','#ffd166','#111827'],
    ['1-Up Green','#7bd88f','#052e16'],['Toxic Lime','#b8f75a','#111827'],['Terminal Green','#38d97a','#052e16'],
    ['Laser Cyan','#45e0ff','#083344'],['Arcade Blue','#4d96ff','#eff6ff'],['Cabinet Blue','#3566d8','#dbeafe'],
    ['Joystick Purple','#8f63ff','#f5f3ff'],['Vapor Violet','#b15cff','#faf5ff'],['Hot Magenta','#ff4fd8','#831843'],
    ['Bubble Pink','#ff75a8','#831843'],['Screen Glow','#d6fff6','#115e59'],['Plastic Grey','#b9c0c9','#334155'],
    ['Cabinet Black','#171923','#f9fafb'],['Button White','#f8fafc','#111827'],['Score Yellow','#fff36d','#111827'],
  ]},
  {name:'Dreamcore', colors:[
    ['Hazy Pink','#ffd6f0','#9d174d'],['Sleepy Rose','#f6c2d6','#9f1239'],['Peach Cloud','#ffd9c7','#9a3412'],
    ['Moon Cream','#fff1bd','#854d0e'],['Soft Lime','#e7ffc2','#3f6212'],['Dream Mint','#ccffe4','#065f46'],
    ['Pool Light','#c4fbff','#155e75'],['Cloud Blue','#d3e8ff','#1e40af'],['Memory Blue','#bac8ff','#3730a3'],
    ['Lavender Fog','#e2d5ff','#5b21b6'],['Purple Haze','#f1ccff','#86198f'],['Static Pink','#ffd0fb','#9d174d'],
    ['Mirror','#edf2f7','#475569'],['Old Wallpaper','#eee4d2','#6f4e37'],['Faded Carpet','#d4b7c4','#831843'],
    ['Night Lamp','#f7d783','#854d0e'],['Hallway Shadow','#777f93','#f8fafc'],['Soft Void','#3b4258','#f8fafc'],
  ]},
  {name:'Material-ish', colors:[
    ['Red 400','#f87171','#7f1d1d'],['Orange 400','#fb923c','#7c2d12'],['Amber 400','#fbbf24','#78350f'],
    ['Yellow 300','#fde047','#713f12'],['Lime 400','#a3e635','#365314'],['Green 400','#4ade80','#14532d'],
    ['Emerald 400','#34d399','#064e3b'],['Teal 400','#2dd4bf','#134e4a'],['Cyan 400','#22d3ee','#164e63'],
    ['Sky 400','#38bdf8','#075985'],['Blue 400','#60a5fa','#1e3a8a'],['Indigo 400','#818cf8','#312e81'],
    ['Violet 400','#a78bfa','#4c1d95'],['Purple 400','#c084fc','#581c87'],['Fuchsia 400','#e879f9','#701a75'],
    ['Pink 400','#f472b6','#831843'],['Rose 400','#fb7185','#881337'],['Slate 400','#94a3b8','#334155'],
  ]},
];
function taxonomySwatch(color, fg=readableInkFor(color)) {
  return {
    color,
    light: {bg: color, fg},
    dark: {bg: hexToRgba(color, .24), fg: readableGlowFor(color)},
  };
}
function taxonomySchemeSwatches(scheme='Pastel') {
  const groups = scheme === 'All Schemes'
    ? NICE_SWATCH_GROUPS
    : NICE_SWATCH_GROUPS.filter(g => g.name === scheme);
  const source = groups.length ? groups : NICE_SWATCH_GROUPS;
  return source.flatMap(g => g.colors.map(([name,color,fg]) => ({scheme:g.name,name,color,...taxonomySwatch(color,fg)})));
}
function taxonomyAutoSwatches(count=1, seed='', scheme='Pastel') {
  const swatches = taxonomySchemeSwatches(scheme);
  if(!swatches.length) return [];
  const seedValue = hashString(`${scheme}-${seed}-${Date.now()}`);
  const candidates = [...swatches].sort((a,b)=>hashString(`${seedValue}-${a.scheme}-${a.name}`)-hashString(`${seedValue}-${b.scheme}-${b.name}`));
  const selected = [];
  const used = new Set();
  const bucketCounts = new Map();
  const start = seedValue % candidates.length;
  const pick = (idx) => {
    const item = candidates[idx % candidates.length];
    selected.push(item);
    used.add(item.color);
    const bucket = colorBucket(item.color);
    bucketCounts.set(bucket, (bucketCounts.get(bucket)||0) + 1);
  };
  pick(start);
  while(selected.length < count && used.size < candidates.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for(let i=0;i<candidates.length;i++) {
      const c = candidates[i];
      if(used.has(c.color)) continue;
      const bucket = colorBucket(c.color);
      const bucketPenalty = (bucketCounts.get(bucket)||0) * .45;
      const nearest = Math.min(...selected.map(s => colorDistance(c.color, s.color)));
      const jitter = (hashString(`${seedValue}-${selected.length}-${c.color}`) % 1000) / 100000;
      const score = nearest - bucketPenalty + jitter;
      if(score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if(bestIdx < 0) break;
    pick(bestIdx);
  }
  while(selected.length < count) selected.push(swatches[(selected.length + seedValue) % swatches.length]);
  return selected.slice(0, count);
}
function taxonomyAutoSwatch(index=0, seed='', scheme='Pastel') {
  return taxonomyAutoSwatches(index + 1, seed, scheme)[index] || taxonomySchemeSwatches(scheme)[0];
}
function hashString(value='') {
  let h = 2166136261;
  for(const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function colorBucket(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  if(!hsl) return 'unknown';
  if(hsl.s < .12) return `neutral-${Math.round(hsl.l * 4)}`;
  return `hue-${Math.floor(((hsl.h + 15) % 360) / 30)}`;
}
function colorDistance(a, b) {
  const ah = rgbToHsl(hexToRgb(a));
  const bh = rgbToHsl(hexToRgb(b));
  if(!ah || !bh) return 0;
  if(ah.s < .12 && bh.s < .12) return Math.abs(ah.l - bh.l) * .9;
  if(ah.s < .12 || bh.s < .12) return .55 + Math.abs(ah.l - bh.l) * .25 + Math.abs(ah.s - bh.s) * .2;
  const hue = Math.min(Math.abs(ah.h - bh.h), 360 - Math.abs(ah.h - bh.h)) / 180;
  const sat = Math.abs(ah.s - bh.s);
  const light = Math.abs(ah.l - bh.l);
  return hue * .72 + sat * .12 + light * .16;
}
function rgbToHsl(rgb) {
  if(!rgb) return null;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if(d) {
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0)
      : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
    h *= 60;
  }
  return {h,s,l};
}
function readableInkFor(hex) {
  const rgb = hexToRgb(hex);
  if(!rgb) return '#334155';
  const lum = ((rgb.r/255)*.299 + (rgb.g/255)*.587 + (rgb.b/255)*.114);
  return lum > .72 ? '#334155' : '#ffffff';
}
function readableGlowFor(hex) {
  const rgb = hexToRgb(hex);
  if(!rgb) return '#cbd5e1';
  const lum = ((rgb.r/255)*.299 + (rgb.g/255)*.587 + (rgb.b/255)*.114);
  return lum < .28 ? '#e2e8f0' : hex;
}
function hexToRgb(hex) {
  const raw = String(hex||'').replace('#','');
  if(raw.length !== 6) return null;
  return {r:parseInt(raw.slice(0,2),16),g:parseInt(raw.slice(2,4),16),b:parseInt(raw.slice(4,6),16)};
}
function hexToRgba(hex, alpha=.2) {
  const rgb = hexToRgb(hex);
  if(!rgb) return `rgba(148,163,184,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export {
  slugId, tagColors, lifeAreaPalette, UNASSIGNED_LIFE_AREA,
  syncTaxonomyGlobals, NICE_SWATCH_GROUPS,
  taxonomySwatch, taxonomySchemeSwatches, taxonomyAutoSwatches, taxonomyAutoSwatch,
  hashString, colorBucket, colorDistance,
  rgbToHsl, hexToRgb, hexToRgba, readableInkFor, readableGlowFor,
};

