/**
 * Coleta TODAS as subcategorias do TikTok Shop BR em sequência.
 *
 * CHECKPOINT (resume):
 *   Salva progresso em output/scrape-checkpoint.json após cada categoria.
 *   Ao parar e reiniciar, categorias já concluídas são automaticamente puladas.
 *
 * USO:
 *   node scripts/scrape-all-categories.mjs               # coleta tudo (ou continua de onde parou)
 *   node scripts/scrape-all-categories.mjs --reset       # zera checkpoint e começa do zero
 *   node scripts/scrape-all-categories.mjs --list        # lista todas as categorias e status
 *   node scripts/scrape-all-categories.mjs --only beleza,roupas   # filtra por slugs (substrings)
 *
 * VARIÁVEIS DE AMBIENTE:
 *   PAUSE_BETWEEN_CATEGORIES_MS=15000   pausa entre categorias em ms (padrão: 10–15s aleatório)
 *   VIEW_MORE_MAX_CLICKS=30             cliques em "Ver mais" por categoria (padrão: 8)
 *   PDP_GALLERY=1                       ativa coleta de galeria PDP
 *   PDP_GALLERY_MAX=25                  máximo de produtos com PDP
 *   HEADED=1                            abre navegador visível
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { scrapeCategoriesSequentialSharedBrowser } from "../src/scrapeCategory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CHECKPOINT_FILE = path.join(ROOT, "output", "scrape-checkpoint.json");
const Q = "source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";
const BASE = "https://shop.tiktok.com";

// ---------------------------------------------------------------------------
// Catálogo de SUBCATEGORIAS (folhas) — 212 categorias, sem duplicar pais.
// Pais (ex: /womenswear-underwear/601152) foram excluídos propositalmente:
// seus produtos aparecem nas subcategorias, evitando coleta dupla.
// ---------------------------------------------------------------------------
const CATALOG = [
  // ── Roupas femininas e roupas íntimas femininas ──────────────────────────
  { label: "Roupas íntimas femininas",             slug: "women-s-underwear",            id: "842888" },
  { label: "Ternos e macacões femininos",           slug: "women-s-suits-sets",           id: "842760" },
  { label: "Vestidos femininos",                    slug: "women-s-dresses",              id: "842504" },
  { label: "Peças femininas para parte superior",   slug: "women-s-tops",                 id: "842248" },
  { label: "Moda feminina de dormir e lazer",       slug: "women-s-sleepwear-loungewear", id: "843016" },
  { label: "Peças femininas para parte inferior",   slug: "women-s-bottoms",              id: "842376" },
  { label: "Roupas especiais para mulheres",        slug: "women-s-special-clothing",     id: "842632" },

  // ── Telefones e eletrônicos ───────────────────────────────────────────────
  { label: "Acessórios para telefone",                          slug: "mobile-phone-accessories",      id: "909064" },
  { label: "Áudio e vídeo",                                     slug: "audio-video",                   id: "909320" },
  { label: "Dispositivos inteligentes e vestíveis",             slug: "smart-wearable-devices",        id: "909576" },
  { label: "Câmeras e fotografia",                              slug: "cameras-photography",           id: "909192" },
  { label: "Acessórios universais",                             slug: "universal-accessories",         id: "978952" },
  { label: "Jogos e consoles",                                  slug: "gaming-consoles",               id: "909448" },
  { label: "Telefones e tablets",                               slug: "phones-tablets",                id: "995976" },
  { label: "Acessórios para tablets e computadores",            slug: "tablet-computer-accessories",   id: "984584" },
  { label: "Refurbished Electronics",                           slug: "refurbished-electronics",       id: "2109072" },
  { label: "Dispositivos de educação",                          slug: "education-devices",             id: "909704" },
  { label: "Dispositivos inteligentes e tecnologia vestível",   slug: "smart-wearable-devices",        id: "2108944" },

  // ── Acessórios de moda ───────────────────────────────────────────────────
  { label: "Óculos",                       slug: "eyewear",                        id: "905352" },
  { label: "Acessórios para cabelos",      slug: "hair-accessories",               id: "905864" },
  { label: "Bijuterias e acessórios",      slug: "costume-jewelry-accessories",    id: "905608" },
  { label: "Extensões de cabelo e perucas",slug: "hair-extensions-wigs",           id: "810128" },
  { label: "Acessórios para roupas",       slug: "clothes-accessories",            id: "905224" },
  { label: "Relógios e acessórios",        slug: "fashion-watches-accessories",    id: "905480" },
  { label: "Tecidos para costura",         slug: "dressmaking-fabrics",            id: "843144" },
  { label: "Wedding Accessories",          slug: "wedding-accessories",            id: "888592" },

  // ── Roupas masculinas e roupas íntimas masculinas ────────────────────────
  { label: "Peças masculinas para parte superior",  slug: "men-s-tops",                        id: "839944" },
  { label: "Peças masculinas para parte inferior",  slug: "men-s-bottoms",                     id: "840072" },
  { label: "Ternos e macacões masculinos",          slug: "men-s-suits-sets",                  id: "840712" },
  { label: "Roupas íntimas masculinas",             slug: "men-s-underwear-socks",             id: "840456" },
  { label: "Moda masculina de dormir e lazer",      slug: "men-s-sleepwear-loungewear",        id: "840584" },
  { label: "Roupas especiais masculinas",           slug: "men-s-special-occasion-clothing",   id: "840328" },

  // ── Suprimentos domésticos ───────────────────────────────────────────────
  { label: "Suprimentos para cuidados domésticos",        slug: "home-care-supplies",       id: "852232" },
  { label: "Suprimentos para banheiro",                   slug: "bathroom-supplies",        id: "851976" },
  { label: "Organizadores domésticos",                    slug: "home-organizers",          id: "851848" },
  { label: "Decoração de casa",                           slug: "home-decor",               id: "852104" },
  { label: "Artigos festivos e para festas",              slug: "festive-party-supplies",   id: "852488" },
  { label: "Ferramentas e acessórios para lavanderia",    slug: "laundry-tools-accessories",id: "852360" },
  { label: "Variedades para casas",                       slug: "miscellaneous-home",       id: "852616" },

  // ── Beleza e cuidados pessoais ────────────────────────────────────────────
  { label: "Cuidados com as Mãos e os Pés",   slug: "hand-foot-care",           id: "849032" },
  { label: "Cuidados com os olhos e ouvidos", slug: "eye-ear-care",             id: "849544" },
  { label: "Itens de cuidados pessoais",       slug: "personal-care-appliances", id: "849416" },
  { label: "Maquiagem",                        slug: "makeup",                   id: "848648" },
  { label: "Cuidados com a pele",              slug: "skincare",                 id: "848776" },
  { label: "Cuidados com cabelos e penteados", slug: "haircare-styling",         id: "848904" },
  { label: "Cuidados nasais e orais",          slug: "nasal-oral-care",          id: "849672" },
  { label: "Banho e cuidados com o corpo",     slug: "bath-body-care",           id: "849160" },
  { label: "Fragrâncias",                      slug: "fragrance",                id: "856208" },
  { label: "Cuidados pessoais especiais",      slug: "special-personal-care",    id: "981128" },
  { label: "Cuidados masculinos",              slug: "men-s-care",               id: "849288" },
  { label: "Cuidados femininos",               slug: "feminine-care",            id: "849800" },

  // ── Sapatos ──────────────────────────────────────────────────────────────
  { label: "Acessórios para sapatos", slug: "shoe-accessories", id: "900744" },
  { label: "Sapatos femininos",       slug: "women-s-shoes",    id: "900488" },
  { label: "Sapatos masculinos",      slug: "men-s-shoes",      id: "900616" },

  // ── Esportes e atividades ao ar livre ─────────────────────────────────────
  { label: "Acessórios esportivos e para atividades ao ar livre", slug: "sports-outdoor-accessories",           id: "834824" },
  { label: "Roupas esportivas e para atividades ao ar livre",     slug: "sport-outdoor-clothing",               id: "834568" },
  { label: "Equipamento de ginástica",                            slug: "fitness",                              id: "835336" },
  { label: "Traje de banho, de surfe e de natação",              slug: "swimwear-surfwear-wetsuits",            id: "846224" },
  { label: "Calçados esportivos",                                 slug: "sports-footwear",                      id: "834696" },
  { label: "Equipamentos para acampamento e caminhada",           slug: "camping-hiking",                       id: "835464" },
  { label: "Equipamentos para esportes com bola",                 slug: "ball-sports",                          id: "834952" },
  { label: "Equipamentos para esportes aquáticos",                slug: "water-sports",                         id: "835080" },
  { label: "Equipamento de lazer e recreação ao ar livre",        slug: "leisure-outdoor-recreation-equipment", id: "835592" },
  { label: "Equipamentos para esportes de inverno",               slug: "winter-sports",                        id: "835208" },
  { label: "Loja oficial",                                        slug: "fan-shop",                             id: "936712" },
  { label: "Jogos de jardim",                                     slug: "lawn-games",                           id: "2108816" },

  // ── Malas e bolsas ────────────────────────────────────────────────────────
  { label: "Bolsas para mulheres",     slug: "women-s-bags",       id: "902408" },
  { label: "Bolsas para homens",       slug: "men-s-bags",         id: "902536" },
  { label: "Bolsas funcionais",        slug: "functional-bags",    id: "902792" },
  { label: "Malas e bolsas de viagem", slug: "luggage-travel-bags",id: "902664" },
  { label: "Acessórios para bolsas",   slug: "bag-accessories",    id: "902920" },

  // ── Brinquedos e passatempos ──────────────────────────────────────────────
  { label: "Brinquedos clássicos e inovadores",        slug: "classic-novelty-toys",          id: "860296" },
  { label: "Bonecas e ursos de pelúcia",               slug: "dolls-stuffed-toys",            id: "859656" },
  { label: "Jogos e quebra-cabeças",                   slug: "games-puzzles",                 id: "860168" },
  { label: "Esportes e brincadeiras ao ar livre",      slug: "sports-outdoor-play",           id: "859912" },
  { label: "Brinquedos educativos",                    slug: "educational-toys",              id: "859784" },
  { label: "Bricolage e artesanato",                   slug: "diy",                           id: "951560" },
  { label: "Brinquedos elétricos e de controle remoto",slug: "electric-remote-control-toys",  id: "860040" },
  { label: "Instrumentos musicais e acessórios",       slug: "musical-instruments-accessories",id:"860552" },

  // ── Automotivo e moto ─────────────────────────────────────────────────────
  { label: "Acessórios interiores de veículos",    slug: "car-interior-accessories",  id: "930184" },
  { label: "Lavagem e manutenção de carros",       slug: "car-washing-maintenance",   id: "940808" },
  { label: "Ferramentas de reparo de veículos",    slug: "car-repair-tools",          id: "940296" },
  { label: "Sistema eletrônico de veículos",       slug: "car-electronics",           id: "929928" },
  { label: "Luzes do veículo",                     slug: "car-lights",                id: "940424" },
  { label: "Acessórios exteriores de veículos",    slug: "car-exterior-accessories",  id: "930056" },
  { label: "Acessórios e peças para motos",        slug: "motorcycle-accessories",    id: "940936" },
  { label: "Quadriciclos, motorhomes e barcos",    slug: "quads-motorhomes-boats",    id: "940680" },
  { label: "Peças de reposição automotivas",       slug: "auto-replacement-parts",    id: "809488" },
  { label: "Peças de motos",                       slug: "motorcycle-parts",          id: "809616" },

  // ── Moda para crianças ────────────────────────────────────────────────────
  { label: "Calçados para meninas",        slug: "girls-footwear",            id: "806024" },
  { label: "Roupas para meninos",          slug: "boys-clothes",              id: "802312" },
  { label: "Roupas para meninas",          slug: "girls-clothes",             id: "803592" },
  { label: "Acessórios de moda infantil",  slug: "kids-fashion-accessories",  id: "806792" },
  { label: "Calçados para meninos",        slug: "boys-footwear",             id: "805128" },

  // ── Utensílios de cozinha ─────────────────────────────────────────────────
  { label: "Utensílios para bebidas",          slug: "drinkware",               id: "859400" },
  { label: "Utensílios e aparelhos de cozinha",slug: "kitchen-utensils-gadgets",id: "859528" },
  { label: "Utensílios para forno",            slug: "bakeware",                id: "859016" },
  { label: "Facas de cozinha",                 slug: "kitchen-knives",          id: "858632" },
  { label: "Utensílios para cozinhar",         slug: "cookware",                id: "859144" },
  { label: "Utensílios para bares e vinhos",   slug: "bar-wine-utensils",       id: "858888" },
  { label: "Talheres e serviços de mesa",      slug: "cutlery-tableware",       id: "859272" },
  { label: "Churrasco",                        slug: "barbecue",                id: "858760" },
  { label: "Utensílios para chá e café",       slug: "tea-coffeeware",          id: "858504" },

  // ── Computadores e equipamentos de escritório ─────────────────────────────
  { label: "Artigos de papelaria e suprimentos para escritório", slug: "office-stationery-supplies",       id: "831112" },
  { label: "Armazenamento de dados e software",                  slug: "data-storage-software",            id: "828168" },
  { label: "Periféricos e acessórios",                           slug: "computer-accessories",             id: "826760" },
  { label: "Equipamentos de escritório",                         slug: "office-equipment",                 id: "830344" },
  { label: "Componentes para desktop e laptop",                  slug: "desktop-laptop-components",        id: "825352" },
  { label: "Componentes de rede",                                slug: "network-components",               id: "829192" },
  { label: "Computadores desktop, laptops e tablets",            slug: "desktop-computers-laptops-tablets",id: "824840" },

  // ── Bebê e maternidade ────────────────────────────────────────────────────
  { label: "Cuidados com bebê e saúde",                  slug: "baby-care-health",        id: "879112" },
  { label: "Roupas e sapatos para bebês",                slug: "baby-clothing-shoes",     id: "877320" },
  { label: "Móveis para bebês",                          slug: "baby-furniture",          id: "878216" },
  { label: "Suprimentos para maternidade",               slug: "maternity-supplies",      id: "880008" },
  { label: "Brinquedos para bebês",                      slug: "baby-toys",               id: "878984" },
  { label: "Segurança de bebês",                         slug: "baby-safety",             id: "878600" },
  { label: "Artigos essenciais para viagens de bebês",   slug: "baby-travel-gear",        id: "877576" },
  { label: "Acessórios fashion para bebês",              slug: "baby-fashion-accessories",id: "961928" },
  { label: "Enfermagem e alimentação",                   slug: "nursing-feeding",         id: "877832" },

  // ── Ferramentas e hardware ────────────────────────────────────────────────
  { label: "Ferramentas de medição",       slug: "measuring-tools",      id: "871816" },
  { label: "Ferramentas elétricas",        slug: "power-tools",          id: "871560" },
  { label: "Ferramentas de jardim",        slug: "garden-tools",         id: "871944" },
  { label: "Hardware",                     slug: "hardware",             id: "872328" },
  { label: "Equipamento de solda",         slug: "soldering-equipment",  id: "872072" },
  { label: "Ferramentas manuais",          slug: "hand-tools",           id: "871688" },
  { label: "Bombas e encanamento",         slug: "pumps-plumbing",       id: "980488" },
  { label: "Organizadores de ferramentas", slug: "tool-organizers",      id: "872200" },

  // ── Têxteis e móveis ──────────────────────────────────────────────────────
  { label: "Roupas de cama",                    slug: "bedding-and-linens",    id: "808328" },
  { label: "Têxteis domésticos",                slug: "household-textiles",    id: "809992" },
  { label: "Tecidos e suprimentos de costura",  slug: "fabrics-sewing-supplies",id:"811016" },

  // ── Suprimentos para animais de estimação ─────────────────────────────────
  { label: "Adestramento de cães e gatos",              slug: "dog-cat-grooming",              id: "816392" },
  { label: "Areia para cães e gatos",                   slug: "dog-cat-litter",                id: "815624" },
  { label: "Acessórios para cães e gatos",              slug: "dog-cat-accessories",           id: "818696" },
  { label: "Peixes e suprimentos aquáticos",            slug: "fish-aquatic-supplies",         id: "819848" },
  { label: "Saúde para cães e gatos",                   slug: "dog-cat-healthcare",            id: "818184" },
  { label: "Suprimentos para animais pequenos",         slug: "small-animal-supplies",         id: "822792" },
  { label: "Roupas para cães e gatos",                  slug: "dog-cat-clothing",              id: "813960" },
  { label: "Comida para cães e gatos",                  slug: "dog-cat-food",                  id: "812168" },
  { label: "Suprimentos para animais de fazenda e aves",slug: "farm-animal-poultry-supplies",  id: "1001992" },
  { label: "Móveis para cães e gatos",                  slug: "dog-cat-furniture",             id: "812808" },
  { label: "Suprimentos para pássaros",                 slug: "bird-supplies",                 id: "821896" },
  { label: "Suprimentos para répteis e anfíbios",       slug: "reptile-amphibian-supplies",    id: "821000" },

  // ── Reformas residenciais ─────────────────────────────────────────────────
  { label: "Acessórios de banheiro",             slug: "bathroom-fixtures",             id: "873096" },
  { label: "Artigos de jardinagem",              slug: "garden-supplies",               id: "873352" },
  { label: "Luzes e Iluminação",                 slug: "lights-lighting",               id: "872456" },
  { label: "Materiais de construção",            slug: "building-supplies",             id: "872968" },
  { label: "Acessórios de cozinha",              slug: "kitchen-fixtures",              id: "872712" },
  { label: "Equipamentos e suprimentos elétricos",slug:"electrical-equipment-supplies", id: "872584" },
  { label: "Segurança e proteção",               slug: "security-safety",               id: "873224" },
  { label: "Sistemas domésticos inteligentes",   slug: "smart-home-systems",            id: "872840" },
  { label: "Energia solar e eólica",             slug: "solar-wind-power",              id: "808208" },

  // ── Alimentos e bebidas ───────────────────────────────────────────────────
  { label: "Comida instantânea",                         slug: "pantry-food",               id: "914952" },
  { label: "Bebidas",                                    slug: "drinks",                    id: "914824" },
  { label: "Lanches",                                    slug: "snacks",                    id: "915336" },
  { label: "Produtos básicos e essenciais para cozinhar",slug: "staples-cooking-essentials",id: "915080" },
  { label: "Panificação",                                slug: "baking",                    id: "915208" },
  { label: "Leite e laticínios",                         slug: "milk-dairy",                id: "809744" },
  { label: "Alimentos frescos e congelados",             slug: "fresh-frozen-food",         id: "915464" },
  { label: "Cerveja, vinho e destilados",                slug: "beer-wine-spirits",         id: "914696" },

  // ── Moda muçulmana ────────────────────────────────────────────────────────
  { label: "Hijabs",                        slug: "hijabs",                  id: "601304" },
  { label: "Roupas islâmicas femininas",    slug: "women-s-islamic-clothing",id: "601310" },
  { label: "Roupas islâmicas masculinas",   slug: "men-s-islamic-clothing",  id: "601325" },
  { label: "Acessórios islâmicos",          slug: "islamic-accessories",     id: "601343" },
  { label: "Traje e equipamento de oração", slug: "prayer-attire-equipment", id: "601348" },
  { label: "Roupas esportivas islâmicas",   slug: "islamic-sportswear",      id: "838920" },
  { label: "Agasalhos",                     slug: "outerwear",               id: "601331" },
  { label: "Roupas islâmicas infantis",     slug: "kids-islamic-clothing",   id: "601339" },
  { label: "Equipamento para umra",         slug: "umroh-equipment",         id: "839176" },

  // ── Livros, revistas e áudios ─────────────────────────────────────────────
  { label: "Ciências humanas e sociais",  slug: "humanities-social-sciences", id: "927112" },
  { label: "Estilo de vida e hobbies",    slug: "lifestyle-hobbies",          id: "992392" },
  { label: "Literatura e arte",           slug: "literature-art",             id: "986760" },
  { label: "Educação e escolarização",    slug: "education-schooling",        id: "992904" },
  { label: "Livros para bebês e infantis",slug: "children-s-infants-books",   id: "989704" },
  { label: "Economia e gestão",           slug: "economics-management",       id: "989320" },
  { label: "Ciências e tecnologia",       slug: "science-technology",         id: "990216" },
  { label: "Revistas e jornais",          slug: "magazines-newspapers",       id: "985736" },
  { label: "Vídeo e música",              slug: "video-music",                id: "997384" },

  // ── Eletrodomésticos ──────────────────────────────────────────────────────
  { label: "Eletrodomésticos",             slug: "home-appliances",       id: "844808" },
  { label: "Utensílios de cozinha (elet)", slug: "kitchen-appliances",    id: "844168" },
  { label: "Eletrodomésticos grandes",     slug: "large-home-appliances", id: "845064" },
  { label: "Eletrodomésticos comerciais",  slug: "commercial-appliances", id: "845320" },

  // ── Saúde ─────────────────────────────────────────────────────────────────
  { label: "Suplementos alimentares",                    slug: "nutrition-wellness",                    id: "700646" },
  { label: "Medicamentos e tratamentos alternativos",    slug: "alternative-medications-treatments",    id: "950792" },
  { label: "Suprimentos médicos",                        slug: "medical-supplies",                      id: "924424" },

  // ── Móveis ────────────────────────────────────────────────────────────────
  { label: "Móveis comerciais",             slug: "commercial-furniture", id: "871432" },
  { label: "Móveis para ambientes externos",slug: "outdoor-furniture",    id: "871176" },
  { label: "Móveis para ambientes internos",slug: "indoor-furniture",     id: "871048" },
  { label: "Móveis para crianças",          slug: "children-s-furniture", id: "871304" },
  { label: "Home Furniture",                slug: "home-furniture",       id: "604454" },

  // ── Joias, acessórios e derivados ─────────────────────────────────────────
  { label: "Cristal natural",             slug: "natural-crystal",        id: "955400" },
  { label: "Pedras preciosas artificiais",slug: "artificial-gemstones",   id: "964360" },
  { label: "Platina e ouro quilate",      slug: "platinum-carat-gold",    id: "954888" },
  { label: "Prata",                       slug: "silver",                 id: "955144" },
  { label: "Cristal artificial",          slug: "non-natural-crystal",    id: "961800" },
  { label: "Jade",                        slug: "jade",                   id: "963848" },
  { label: "Pedras semipreciosas",        slug: "semiprecious-stones",    id: "964232" },
  { label: "Pérola",                      slug: "pearl",                  id: "964488" },
  { label: "Melita",                      slug: "mellite",                id: "964744" },
  { label: "Âmbar",                       slug: "amber",                  id: "964616" },
  { label: "Ouro",                        slug: "gold",                   id: "955016" },
  { label: "Diamante",                    slug: "diamond",                id: "955272" },
  { label: "Rubi, safira e esmeralda",    slug: "ruby-sapphire-emerald",  id: "964104" },

  // ── Colecionáveis ─────────────────────────────────────────────────────────
  { label: "Cartões e acessórios colecionáveis",   slug: "trading-cards-accessories",id: "810000" },
  { label: "Colecionáveis esportivos",             slug: "sports-collectibles",      id: "937736" },
  { label: "Entretenimento",                       slug: "entertainment",            id: "953352" },
  { label: "Colecionáveis de cultura contemporânea",slug:"cultural-items",           id: "809872" },

  // ── Pre-Owned ─────────────────────────────────────────────────────────────
  { label: "Footwear (Pre-Owned)",             slug: "footwear",                    id: "857360" },
  { label: "Pre-Loved Luggage & Bags",         slug: "pre-loved-luggage-bags",      id: "857232" },
  { label: "Fashion Accessories (Pre-Owned)",  slug: "fashion-accessories",         id: "857104" },
  { label: "Luggage & Travel (Pre-Owned)",     slug: "luggage-travel",              id: "864656" },
  { label: "Collectible Trading Cards",        slug: "collectible-trading-cards",   id: "856976" },
  { label: "Refurbished Phones & Electronics", slug: "refurbished-phones-electronics",id:"857744" },
];

// ---------------------------------------------------------------------------
// Funções de checkpoint
// ---------------------------------------------------------------------------

async function loadCheckpoint() {
  try {
    const raw = await fs.readFile(CHECKPOINT_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      completed: new Set(Array.isArray(data.completed) ? data.completed : []),
      startedAt: data.startedAt ?? new Date().toISOString(),
    };
  } catch {
    return { completed: new Set(), startedAt: new Date().toISOString() };
  }
}

async function saveCheckpoint(completed, startedAt) {
  await fs.mkdir(path.dirname(CHECKPOINT_FILE), { recursive: true });
  await fs.writeFile(
    CHECKPOINT_FILE,
    JSON.stringify(
      {
        startedAt,
        lastUpdatedAt: new Date().toISOString(),
        completedCount: completed.size,
        totalCount: CATALOG.length,
        completed: [...completed],
      },
      null,
      2
    ),
    "utf8"
  );
}

async function resetCheckpoint() {
  try { await fs.unlink(CHECKPOINT_FILE); } catch { /* ok */ }
  console.log("[checkpoint] Resetado. Começando do zero.");
}

// ---------------------------------------------------------------------------
// Construção dos runs
// ---------------------------------------------------------------------------

function buildRun(cat) {
  const outputDir = path.join(ROOT, "output", "categorias", `${cat.slug}-${cat.id}`);
  const url = `${BASE}/br/c/${cat.slug}/${cat.id}?${Q}`;
  return { label: cat.label, OUTPUT_DIR: outputDir, CATEGORY_URL: url };
}

// ---------------------------------------------------------------------------
// Modo --list
// ---------------------------------------------------------------------------

async function listCategories() {
  const { completed } = await loadCheckpoint();
  console.log(`\nTotal: ${CATALOG.length} categorias\n`);
  for (let i = 0; i < CATALOG.length; i++) {
    const cat = CATALOG[i];
    const key = `${BASE}/br/c/${cat.slug}/${cat.id}`;
    const done = completed.has(key);
    const status = done ? "✅" : "⏳";
    console.log(`${status} [${String(i + 1).padStart(3)}] ${cat.label}`);
  }
  const remaining = CATALOG.length - completed.size;
  console.log(`\n✅ Concluídas: ${completed.size} | ⏳ Restantes: ${remaining}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--list")) {
  await listCategories();
  process.exit(0);
}

if (args.includes("--reset")) {
  await resetCheckpoint();
}

const filterArg = args.find((a) => a.startsWith("--only="))?.slice(7) ??
                  args[args.indexOf("--only") + 1];
const filters = filterArg ? filterArg.split(",").map((s) => s.trim().toLowerCase()) : null;

const { completed, startedAt } = await loadCheckpoint();

// Filtra o catálogo
let catalog = CATALOG;
if (filters) {
  catalog = catalog.filter((cat) =>
    filters.some((f) => cat.label.toLowerCase().includes(f) || cat.slug.toLowerCase().includes(f))
  );
  console.log(`[filtro] ${catalog.length} categorias correspondem a: ${filters.join(", ")}`);
}

// Remove já concluídas
const pending = catalog.filter((cat) => {
  const key = `${BASE}/br/c/${cat.slug}/${cat.id}`;
  return !completed.has(key);
});

if (pending.length === 0) {
  console.log("\n✅ Todas as categorias já foram coletadas! Use --reset para recomeçar.\n");
  process.exit(0);
}

const alreadyDone = catalog.length - pending.length;
console.log(`\n📋 Categorias: ${catalog.length} total | ${alreadyDone} já concluídas | ${pending.length} restantes`);
console.log(`📁 Checkpoint: ${CHECKPOINT_FILE}`);
console.log(`⏱  Pausa entre categorias: ${process.env.PAUSE_BETWEEN_CATEGORIES_MS ?? "10–15s (padrão)"}\n`);

const runs = pending.map(buildRun);

// Callback de checkpoint: salva após cada categoria concluída
async function onCategoryComplete(url, _code, index, total) {
  // normaliza URL (remove query string) para a chave do checkpoint
  const key = url.split("?")[0];
  completed.add(key);
  await saveCheckpoint(completed, startedAt);
  console.log(`[checkpoint] salvo (${completed.size}/${total + alreadyDone} concluídas)`);
}

const exitCode = await scrapeCategoriesSequentialSharedBrowser(runs, { onCategoryComplete }).catch((e) => {
  console.error(e);
  return 1;
});

console.log(`\n🏁 Coleta finalizada. Código de saída: ${exitCode}`);
console.log(`   Total concluídas: ${completed.size}/${CATALOG.length}`);
if (completed.size < CATALOG.length) {
  console.log(`   Para continuar: node scripts/scrape-all-categories.mjs`);
}

process.exit(exitCode);
