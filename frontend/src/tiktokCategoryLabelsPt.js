/**
 * Nomes de categoria em PT-BR (sitemap TikTok Shop + aliases de slug).
 *
 * 1) Tabela explícita (LOOKUP) — categorias conhecidas.
 * 2) Normalização de slugs possessivos do BR (`women-s-*` → `womens-*`, e "Women S *" no texto).
 * 3) Fallback por palavras (TOKEN_PT) para slugs futuros / não mapeados — mantém palavras sem tradução em EN.
 *
 * Para novas categorias: prefira acrescentar uma linha em `regBlock` com o slug exacto da URL;
 * o fallback cobre o resto de forma aproximada.
 */

/** @type {Map<string, string>} */
const LOOKUP = new Map();

/**
 * @param {string[]} keys
 * @param {string} pt
 */
function reg(keys, pt) {
  for (const raw of keys) {
    const k = String(raw).trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    LOOKUP.set(lower, pt);
    LOOKUP.set(lower.replace(/-/g, " "), pt);
    LOOKUP.set(lower.replace(/\s+/g, "-"), pt);
  }
}

/** @param {Array<[string[], string]>} blocks */
function regBlock(blocks) {
  for (const [keys, pt] of blocks) reg(keys, pt);
}

regBlock([
  [["womenswear-underwear", "womenswear underwear"], "Roupas femininas e roupas íntimas femininas"],
  [
    [
      "womens-underwear-and-lingerie",
      "womens underwear and lingerie",
      "women-underwear",
      "women underwear",
      "women-s-underwear",
      "women s underwear",
      "womens-underwear",
      "panties"
    ],
    "Roupas íntimas femininas"
  ],
  [
    [
      "womens-suits-and-sets",
      "womens suits and sets",
      "womens-suits",
      "women-clothing-sets",
      "women-s-suits-and-sets",
      "women s suits and sets"
    ],
    "Ternos e macacões femininos"
  ],
  [
    ["womens-dresses", "womens dresses", "dresses", "women-s-dresses", "women s dresses"],
    "Vestidos femininos"
  ],
  [
    ["womens-tops", "womens tops", "women-tops", "women-s-tops", "women s tops"],
    "Peças femininas para parte superior"
  ],
  [
    ["womens-sleepwear-and-loungewear", "womens sleepwear and loungewear", "women-sleepwear"],
    "Moda feminina de dormir e lazer"
  ],
  [["womens-bottoms", "womens bottoms", "women-bottoms", "women-s-bottoms"], "Peças femininas para parte inferior"],
  [["womens-special-clothing", "womens special clothing", "women-special-clothing"], "Roupas especiais para mulheres"],

  [["phones-electronics", "phones electronics", "phones and electronics"], "Telefones e eletrônicos"],
  [
    ["phone-accessories", "phone accessories", "cellphone-accessories", "mobile-phone-accessories"],
    "Acessórios para telefone"
  ],
  [["audio-and-video", "audio video", "audio-video"], "Áudio e vídeo"],
  [
    ["smart-and-wearable-devices", "smart wearable devices", "smart-wearable-devices", "wearable-devices"],
    "Dispositivos inteligentes e vestíveis"
  ],
  [["cameras-and-photography", "cameras photography", "cameras-photography"], "Câmeras e fotografia"],
  [["universal-accessories", "universal accessories"], "Acessórios universais"],
  [["games-and-consoles", "games consoles", "games-consoles"], "Jogos e consoles"],
  [["phones-and-tablets", "phones tablets", "phones-tablets"], "Telefones e tablets"],
  [
    [
      "tablet-and-laptop-accessories",
      "tablet laptop accessories",
      "tablet-computer-accessories",
      "computer-accessories"
    ],
    "Acessórios para tablets e computadores"
  ],
  [["refurbished-electronics", "refurbished electronics"], "Eletrônicos recondicionados"],
  [["educational-devices", "education-devices", "educational devices"], "Dispositivos de educação"],

  [["fashion-accessories", "fashion accessories"], "Acessórios de moda"],
  [["glasses", "eyewear"], "Óculos"],
  [["hair-accessories", "hair accessories"], "Acessórios para cabelos"],
  [["costume-jewelry-and-accessories", "costume jewelry", "fashion-jewelry", "jewelry"], "Bijuterias e acessórios"],
  [["hair-extensions-and-wigs", "hair extensions", "wigs", "hair-extensions"], "Extensões de cabelo e perucas"],
  [["clothing-accessories", "clothing accessories", "apparel-accessories"], "Acessórios para roupas"],
  [["watches-and-accessories", "watches accessories", "watches"], "Relógios e acessórios"],
  [["fabric-and-textiles", "fabric textiles", "fabrics-sewing"], "Tecidos para costura"],
  [["wedding-accessories", "wedding accessories"], "Acessórios de casamento"],

  [["menswear-underwear", "menswear underwear"], "Roupas masculinas e roupas íntimas masculinas"],
  [
    ["mens-tops", "mens tops", "men-tops", "men-s-tops", "men s tops"],
    "Peças masculinas para parte superior"
  ],
  [["mens-bottoms", "mens bottoms", "men-bottoms", "men-s-bottoms"], "Peças masculinas para parte inferior"],
  [["mens-suits-and-sets", "mens suits", "men-suits", "men-s-suits"], "Ternos e macacões masculinos"],
  [
    ["mens-underwear", "mens underwear", "men-underwear", "men-s-underwear", "men s underwear"],
    "Roupas íntimas masculinas"
  ],
  [["mens-sleepwear-and-loungewear", "mens sleepwear", "men-sleepwear"], "Moda masculina de dormir e lazer"],

  [["toys-hobbies", "toys and hobbies", "toys collectibles"], "Brinquedos e passatempos"],
  [["classic-and-novelty-toys", "classic novelty toys", "classic-toys"], "Brinquedos clássicos e inovadores"],
  [["dolls-and-stuffed-toys", "dolls stuffed toys", "dolls"], "Bonecas e ursos de pelúcia"],
  [["games-and-puzzles", "games puzzles", "puzzles"], "Jogos e quebra-cabeças"],
  [["sports-and-outdoor-play", "sports outdoor", "outdoor-play"], "Esportes e brincadeiras ao ar livre"],
  [["learning-and-education", "educational-toys", "learning toys"], "Brinquedos educativos"],
  [["diy-and-crafting", "diy crafting", "arts-crafts"], "Bricolage e artesanato"],
  [["electric-and-remote-control-toys", "electric toys", "rc-toys"], "Brinquedos elétricos e de controle remoto"],
  [["musical-instruments-and-accessories", "musical instruments", "instruments"], "Instrumentos musicais e acessórios"],

  [["automotive-motorcycle", "automotive motorcycle", "automotive"], "Automotivo e moto"],
  [["car-interior-accessories", "car interior", "vehicle-interior"], "Acessórios interiores de veículos"],
  [["car-washing-and-maintenance", "car washing", "car-care"], "Lavagem e manutenção de carros"],
  [["car-repair-tools", "car repair", "vehicle-repair-tools"], "Ferramentas de reparo de veículos"],
  [["car-electronic-systems", "vehicle-electronics"], "Sistema eletrônico de veículos"],
  [["car-lights", "vehicle-lights", "auto-lights"], "Luzes do veículo"],
  [["car-exterior-accessories", "car exterior", "vehicle-exterior"], "Acessórios exteriores de veículos"],
  [["motorcycle-accessories-and-parts", "motorcycle accessories", "moto-accessories"], "Acessórios e peças para motos"],
  [["atv-rv-boats", "atv rv boats", "atv-rv"], "Quadriciclos, motorhomes e barcos"],
  [["automotive-replacement-parts", "auto parts", "car-replacement-parts"], "Peças de reposição automotivas"],
  [["motorcycle-parts", "moto-parts"], "Peças de motos"],

  [["kids-fashion", "kids fashion", "baby-kids-fashion"], "Moda para crianças"],
  [["girls-footwear", "girls shoes", "girls-s-footwear"], "Calçados para meninas"],
  [["boys-clothing", "boys clothes", "boys-s-clothing"], "Roupas para meninos"],
  [["girls-clothing", "girls clothes", "girls-s-clothing"], "Roupas para meninas"],
  [["kids-fashion-accessories", "kids accessories fashion"], "Acessórios de moda infantil"],
  [["boys-footwear", "boys shoes", "boys-s-footwear"], "Calçados para meninos"],

  [["kitchen-dining", "kitchen dining", "kitchen"], "Utensílios de cozinha"],
  [["drinkware", "drinks-utensils"], "Utensílios para bebidas"],
  [["kitchen-appliances", "kitchen appliances utensils", "cooking-appliances"], "Utensílios e aparelhos de cozinha"],
  [["bakeware", "baking-utensils"], "Utensílios para forno"],
  [["kitchen-knives", "kitchen knives", "knives"], "Facas de cozinha"],
  [["cooking-utensils", "cooking utensils"], "Utensílios para cozinhar"],
  [["bar-and-wine-tools", "bar wine", "wine-tools"], "Utensílios para bares e vinhos"],
  [["tableware", "dinnerware"], "Talheres e serviços de mesa"],
  [["bbq", "barbecue"], "Churrasco"],
  [["tea-and-coffee-utensils", "tea coffee"], "Utensílios para chá e café"],

  [["home-improvement", "home improvement"], "Reformas residenciais"],
  [["bathroom-accessories", "bathroom"], "Acessórios de banheiro"],
  [["garden-supplies", "gardening", "garden"], "Artigos de jardinagem"],
  [["lights-and-lighting", "lights lighting", "lighting"], "Luzes e Iluminação"],
  [["building-materials", "construction-materials"], "Materiais de construção"],
  [["kitchen-fixtures", "kitchen hardware"], "Acessórios de cozinha"],
  [["electrical-equipment-and-supplies", "electrical supplies", "electrical-equipment"], "Equipamentos e suprimentos elétricos"],
  [["security-and-protection", "security protection"], "Segurança e proteção"],
  [["smart-home-systems", "smart home"], "Sistemas domésticos inteligentes"],
  [["solar-and-wind-energy", "solar wind", "renewable-energy"], "Energia solar e eólica"],

  [["food-beverages", "food beverages", "food and beverages"], "Alimentos e bebidas"],
  [["instant-food", "instant food"], "Comida instantânea"],
  [["beverages", "drinks"], "Bebidas"],
  [["snacks", "snack-foods"], "Lanches"],
  [["cooking-essentials", "cooking essentials", "pantry"], "Produtos básicos e essenciais para cozinhar"],
  [["baking", "bakery-ingredients"], "Panificação"],
  [["milk-and-dairy", "dairy", "milk dairy"], "Leite e laticínios"],
  [["fresh-and-frozen-food", "fresh frozen"], "Alimentos frescos e congelados"],
  [["beer-wine-and-spirits", "beer wine", "alcoholic-beverages"], "Cerveja, vinho e destilados"],

  [["muslim-fashion", "muslim fashion"], "Moda muçulmana"],
  [["hijabs", "hijab"], "Hijabs"],
  [["muslim-women-clothing", "muslim women", "islamic-women"], "Roupas islâmicas femininas"],
  [["muslim-men-clothing", "muslim men", "islamic-men"], "Roupas islâmicas masculinas"],
  [["muslim-accessories", "islamic-accessories"], "Acessórios islâmicos"],
  [["prayer-clothing-equipment", "prayer"], "Traje e equipamento de oração"],
  [["muslim-sportswear", "islamic-sportswear"], "Roupas esportivas islâmicas"],
  [["outerwear", "coats-jackets"], "Agasalhos"],
  [["muslim-kids-clothing", "islamic-kids"], "Roupas islâmicas infantis"],
  [["umrah-equipment", "umrah"], "Equipamento para umra"],

  [["books-mags-and-audio", "books mags audio", "books magazines"], "Livros, revistas e áudios"],
  [["humanities-and-social-sciences", "humanities social", "social-sciences"], "Ciências humanas e sociais"],
  [["lifestyle-and-hobbies", "lifestyle hobbies"], "Estilo de vida e hobbies"],
  [["literature-and-arts", "literature arts"], "Literatura e arte"],
  [["education-and-schooling", "education schooling"], "Educação e escolarização"],
  [["baby-and-kids-books", "kids books", "children-books"], "Livros para bebês e infantis"],
  [["business-and-economics", "economics management", "business"], "Economia e gestão"],

  // —— Mais categorias de nível 1 / frequentes no TikTok Shop (ampliar aqui quando necessário)
  [["beauty-personal-care", "beauty personal care"], "Beleza e cuidados pessoais"],
  [["makeup", "make-up"], "Maquiagem"],
  [["skin-care", "skincare"], "Cuidados com a pele"],
  [["bath-body-care", "bath body care"], "Banho e cuidados corporais"],
  [["hand-feet-care", "hand feet care"], "Cuidados com mãos e pés"],
  [["mens-care", "men s care"], "Cuidados masculinos"],
  [["womens-care", "women s care"], "Cuidados femininos"],
  [["nails", "nail-care"], "Unhas"],
  [["hair-care-and-styling", "hair care styling"], "Cuidados e penteados capilares"],
  [["fine-jewellery", "fine jewelry"], "Joias"],
  [["luggage-and-bags", "luggage bags"], "Malas e bolsas"],
  [["women-shoes", "women-s-shoes"], "Calçados femininos"],
  [["men-shoes", "men-s-shoes"], "Calçados masculinos"],
  [["shoes", "footwear"], "Calçados"],
  [["sports-and-outdoor", "sports outdoor"], "Esportes e ar livre"],
  [["mens-sportswear", "men s sportswear"], "Roupas esportivas masculinas"],
  [["womens-sportswear", "women s sportswear"], "Roupas esportivas femininas"],
  [["maternity-supplies", "maternity supplies"], "Suprimentos de maternidade"],
  [["baby-and-maternity", "baby maternity"], "Bebê e maternidade"],
  [["pet-supplies", "pet supplies"], "Artigos para animais"],
  [["household-essentials", "household essentials"], "Essenciais para o lar"],
  [["household-appliances", "household appliances"], "Eletrodomésticos"],
  [["furniture", "home-furniture"], "Móveis"],
  [["office-school-supplies", "office school supplies"], "Material escolar e de escritório"],
  [["gaming", "gaming-merch"], "Gaming"],
  [["health-household-supplies", "health household supplies"], "Saúde e produtos domésticos"],
  [["jewellery-accessories", "jewellery accessories"], "Joias e acessórios"],
  [["women-bags-and-luggage", "women s bags luggage"], "Bolsas e malas femininas"],
  [["women-clothing-underwear-and-loungewear", "women s clothing underwear loungewear"], "Roupas e moda casa feminina"],
  [["men-clothing-shirts-and-polos"], "Camisas e polos masculinos"],
  [["men-clothing-hoodies-and-sweatshirts"], "Moletons e suéteres masculinos"],
  [["women-clothing-hoodies-and-sweatshirts"], "Moletons e suéteres femininos"],
  [["women-clothing-shirts-and-blouses"], "Camisas e blusas femininas"],
  [["baby-clothing", "baby clothes"], "Roupas de bebê"],
  [["baby-feeding", "baby feeding"], "Alimentação infantil"],
  [["baby-furniture", "baby furniture"], "Móveis infantis"],
  [["baby-safety", "baby safety"], "Segurança infantil"],
  [["baby-travel-gear", "baby travel"], "Passeio e viagem com bebê"],
  [["children-s-shoes", "children s shoes"], "Calçados infantis"],
  [["children-s-clothing", "children s clothing"], "Roupas infantis"],
  [["pet-food", "pet food"], "Ração e alimentação pet"],
  [["pet-grooming", "pet grooming"], "Higiene pet"],
  [["pet-accessories", "pet accessories"], "Acessórios pet"],
  [["pet-health", "pet health"], "Saúde pet"],
  [["home-textiles", "home textiles"], "Têxteis para casa"],
  [["bedding", "bedding and linens"], "Roupa de cama"],
  [["home-decor", "home decor"], "Decoração"],
  [["storage-and-organisation", "storage organization"], "Organização e armazenamento"],
  [["tools-and-hardware", "tools hardware"], "Ferramentas e ferragens"],
  [["cleaning-supplies", "cleaning supplies"], "Produtos de limpeza"],
  [["laundry-care", "laundry care"], "Lavanderia"],
  [["paper-disposable-goods", "paper disposable"], "Descartáveis"],
  [["sexual-wellness", "sexual wellness"], "Bem-estar sexual"],
  [["adult-clothing", "adult clothing"], "Roupas adulto"],
  [["pre-owned", "preowned"], "Seminovos"],
  [["virtual-products", "virtual products"], "Produtos virtuais"],
  [["collectibles", "collectible"], "Colecionáveis"],
  [["arts-crafts-sewing", "arts crafts sewing"], "Artes, artesanato e costura"],
  [["stationery", "office-stationery"], "Papelaria"],
  [["specialty-stores", "specialty stores"], "Lojas especializadas"]
]);

/** Palavras comuns em slugs EN → PT (fallback; expandir à medida que importarem categorias) */
const TOKEN_PT = Object.freeze({
  women: "mulheres",
  womens: "feminino",
  men: "homens",
  mens: "masculino",
  girls: "meninas",
  boys: "meninos",
  kids: "crianças",
  kid: "infantil",
  baby: "bebê",
  babies: "bebês",
  children: "crianças",
  maternity: "maternidade",
  pet: "pet",
  pets: "pets",
  dog: "cão",
  dogs: "cães",
  cat: "gato",
  cats: "gatos",
  phone: "telefone",
  phones: "telefones",
  mobile: "móvel",
  accessories: "acessórios",
  accessory: "acessório",
  electronics: "eletrônicos",
  electronic: "eletrônico",
  audio: "áudio",
  video: "vídeo",
  smart: "inteligente",
  wearable: "vestível",
  wearables: "vestíveis",
  camera: "câmera",
  cameras: "câmeras",
  photography: "fotografia",
  games: "jogos",
  game: "jogo",
  consoles: "consoles",
  tablet: "tablet",
  tablets: "tablets",
  laptop: "notebook",
  computer: "computador",
  universal: "universal",
  refurbished: "recondicionados",
  educational: "educacional",
  education: "educação",
  toys: "brinquedos",
  toy: "brinquedo",
  hobbies: "passatempos",
  fashion: "moda",
  clothing: "roupas",
  apparel: "vestuário",
  underwear: "roupas íntimas",
  lingerie: "lingerie",
  dress: "vestido",
  dresses: "vestidos",
  tops: "partes superiores",
  bottoms: "partes inferiores",
  sleepwear: "pijamas",
  loungewear: "conforto",
  suits: "ternos",
  sets: "conjuntos",
  kitchen: "cozinha",
  dining: "refeições",
  home: "casa",
  improvement: "reforma",
  automotive: "automotivo",
  motorcycle: "moto",
  car: "carro",
  vehicle: "veículo",
  beauty: "beleza",
  personal: "pessoais",
  care: "cuidados",
  health: "saúde",
  sports: "esportes",
  sportswear: "moda esportiva",
  outdoor: "ar livre",
  shoes: "calçados",
  footwear: "calçados",
  bags: "bolsas",
  luggage: "malas",
  makeup: "maquiagem",
  skincare: "pele",
  skin: "pele",
  hair: "cabelo",
  nails: "unhas",
  bath: "banho",
  body: "corpo",
  furniture: "móveis",
  appliances: "eletrodomésticos",
  household: "lar",
  bedding: "cama",
  decor: "decoração",
  storage: "organização",
  tools: "ferramentas",
  cleaning: "limpeza",
  laundry: "lavanderia",
  office: "escritório",
  school: "escola",
  supplies: "materiais",
  arts: "artes",
  crafts: "artesanato",
  sewing: "costura",
  jewelry: "joias",
  jewellery: "joias",
  watches: "relógios",
  books: "livros",
  food: "alimentos",
  beverages: "bebidas",
  snacks: "lanches",
  safety: "segurança",
  travel: "viagem",
  gear: "equipamento",
  digital: "digital",
  virtual: "virtual",
  products: "produtos",
  pre: "semi",
  owned: "novos",
  collectible: "colecionáveis",
  collectibles: "colecionáveis",
  specialty: "especializada",
  stores: "lojas",
  adult: "adulto",
  sexual: "sexual",
  wellness: "bem-estar",
  paper: "papel",
  disposable: "descartáveis",
  goods: "produtos",
  garden: "jardim",
  gardening: "jardinagem",
  building: "construção",
  materials: "materiais",
  electrical: "elétrico",
  security: "segurança",
  protection: "proteção",
  solar: "solar",
  wind: "eólica",
  energy: "energia",
  lights: "luzes",
  lighting: "iluminação",
  bathroom: "banheiro",
  barbecue: "churrasco",
  diy: "faça você mesmo",
  learning: "aprendizado",
  classic: "clássico",
  novelty: "inovadores",
  electric: "elétrico",
  remote: "remoto",
  control: "controle",
  musical: "musical",
  instruments: "instrumentos",
  interior: "interior",
  exterior: "externo",
  washing: "lavagem",
  maintenance: "manutenção",
  repair: "reparo",
  replacement: "reposição",
  parts: "peças",
  motorhome: "motorhome",
  boats: "barcos",
  instant: "instantâneo",
  cooking: "cozinhar",
  essentials: "essenciais",
  milk: "leite",
  dairy: "laticínios",
  fresh: "frescos",
  frozen: "congelados",
  beer: "cerveja",
  wine: "vinho",
  spirits: "destilados",
  muslim: "islâmica",
  islamic: "islâmica",
  hijab: "hijabs",
  hijabs: "hijabs",
  prayer: "oração",
  umrah: "umra",
  humanities: "humanas",
  social: "sociais",
  sciences: "ciências",
  lifestyle: "estilo de vida",
  literature: "literatura",
  business: "negócios",
  economics: "economia",
  management: "gestão",
  drinkware: "bebidas",
  bakeware: "forno",
  knives: "facas",
  bar: "bar",
  tea: "chá",
  coffee: "café",
  tableware: "mesa",
  hoodies: "moletons",
  sweatshirts: "suéteres",
  shirts: "camisas",
  polos: "polos",
  blouses: "blusas",
  feeding: "alimentação",
  grooming: "higiene",
  organisation: "organização",
  organization: "organização",
  textiles: "têxteis",
  hardware: "ferragens",
  linens: "roupa de cama",
  handbags: "bolsas"
});

const STOP_TOKEN = new Set([
  "",
  "and",
  "or",
  "the",
  "a",
  "an",
  "for",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "without",
  "from",
  "s",
  "&"
]);

function asciiLower(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** `women-s-foo` (URL BR) ↔ `womens-foo` */
function normalizePossessiveSlug(kebab) {
  return kebab.replace(/^(women|men|girls|boys|children)-s-(?=.)/gi, (_, g) => `${g.toLowerCase()}s-`);
}

/** "women s underwear" ↔ "womens underwear" */
function normalizePossessivePhrase(spaced) {
  return spaced.replace(/\b(women|men|girls|boys|children)\s+s\s+/gi, (_, w) => `${w.toLowerCase()}s `);
}

/** @param {string} spacedLower */
function lookupExplicit(spacedLower) {
  const collapsed = normalizePossessivePhrase(spacedLower.replace(/\s+/g, " ").trim());
  const variants = [
    spacedLower.replace(/\s+/g, " ").trim(),
    collapsed,
    spacedLower.replace(/ /g, "-"),
    collapsed.replace(/ /g, "-"),
    normalizePossessiveSlug(spacedLower.replace(/ /g, "-")),
    normalizePossessiveSlug(collapsed.replace(/ /g, "-"))
  ];
  for (const v of variants) {
    if (!v) continue;
    const hit = LOOKUP.get(v) ?? LOOKUP.get(v.replace(/-/g, " "));
    if (hit) return hit;
  }
  return null;
}

/** @param {string} spacedLower apenas a-z 0-9 espaços */
function tokenFallbackPhrase(spacedLower) {
  const raw = spacedLower.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return null;
  if (/^id\s*\d+$/.test(raw)) return null;

  const parts = raw.split(/[\s_-]+/).filter((p) => p && !STOP_TOKEN.has(p));
  if (parts.length === 0) return null;

  let any = false;
  const pieces = [];
  for (const p of parts) {
    const pt = TOKEN_PT[p];
    if (pt != null && pt !== "") {
      any = true;
      pieces.push(pt.charAt(0).toUpperCase() + pt.slice(1));
    } else {
      pieces.push(p.charAt(0).toUpperCase() + p.slice(1));
    }
  }

  return any ? pieces.join(" ") : null;
}

/**
 * Traduz um segmento único (sem ` · ID`).
 * @param {string} segment
 */
function translateSegment(segment) {
  const raw = String(segment).trim();
  if (!raw) return raw;
  const rl = raw.toLowerCase();
  if (rl === "tiktok shop" || rl === "sem categoria") return raw;

  if (/^\d+$/.test(asciiLower(raw))) return raw;
  if (/^id\s*[·.]?\s*\d+$/i.test(raw.replace(/\u00b7/g, "·"))) return raw;

  const spaced = asciiLower(raw).replace(/\s+/g, " ").trim();
  const hit = lookupExplicit(spaced);
  if (hit) return hit;

  const fb = tokenFallbackPhrase(normalizePossessivePhrase(spaced));
  return fb ?? raw;
}

const ID_TAIL = /\s*[·]\s*(\d+)\s*$/u;

/**
 * Traduz texto de caminho tipo "Kitchen Dining · Womens Tops · 805888".
 * Mantém sufixo numérico do TikTok.
 * @param {string | null | undefined} label
 */
export function translateCategoryPathEnToPt(label) {
  if (label == null || typeof label !== "string") return label ?? "";
  const t = label.trim();
  if (!t || t === "—" || t === "Sem categoria") return t;

  const idMatch = t.match(ID_TAIL);
  const idSuffix = idMatch ? ` · ${idMatch[1]}` : "";
  const body = idMatch ? t.slice(0, idMatch.index).trim() : t;

  const parts = body.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return t;

  const ptParts = parts.map((p) => translateSegment(p));
  const out = ptParts.join(" · ");
  return out + idSuffix;
}

/**
 * Slug TikTok directo (`womenswear-underwear`, `women-s-underwear`) → PT.
 * @param {string | null | undefined} slug
 */
export function translateSlugToPt(slug) {
  if (slug == null || typeof slug !== "string") return "";
  const s0 = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!s0) return "";

  const hit = lookupExplicit(s0.replace(/-/g, " "));
  if (hit) return hit;

  const fb = tokenFallbackPhrase(normalizePossessivePhrase(s0.replace(/-/g, " ")));
  if (fb) return fb;

  return "";
}
