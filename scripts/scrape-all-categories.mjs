/**
 * Coleta TODAS as subcategorias do TikTok Shop BR — 1 PROCESSO CURTO POR CATEGORIA.
 *
 * ┌─ POR QUE PROCESSO POR CATEGORIA, NÃO 1 NAVEGADOR PARA AS 212 ────────
 * │ Era a versão anterior: um Chrome só, aberto do início ao fim da corrida.
 * │ Na madrugada de 21→22/08/2026 esse Chrome caiu ("navegador desconectado
 * │ — relançando") repetidas vezes durante a coleta desacompanhada — sessão
 * │ viva por horas acumula memória/handles até o processo cair. O
 * │ relançamento automático escondia o sintoma, mas cada queda ainda custava
 * │ minutos, e nada garantia que a próxima não fosse pior.
 * │
 * │ Aqui cada categoria roda em `node src/scrapeCategory.mjs` como processo
 * │ FILHO, isolado, com o seu próprio Chrome — e morre ao terminar (`npm run
 * │ coleta:uma`, já existia para uso manual). Processo que morre limpo pode
 * │ ser repetido para sempre; memória e handles voltam ao SO entre cada
 * │ categoria, em vez de se acumularem por 212 rodadas seguidas. Este
 * │ arquivo (`scrape-all-categories.mjs`) é só o ORQUESTRADOR: fila,
 * │ checkpoint, parada, pausa entre categorias — a captação em si
 * │ (clique em "Ver mais" + interceptação de payload de API) continua 100%
 * │ intacta em `src/scrapeCategory.mjs`.
 * └────────────────────────────────────────────────────────────────────────
 *
 * CHECKPOINT (parar/continuar sem perder nada):
 *   - Após CADA categoria concluída, grava output/scrape-checkpoint.json.
 *   - Ao reiniciar, categorias já concluídas são puladas automaticamente.
 *   - Parada graciosa: se existir output/scrape-all.stop, o loop para ANTES
 *     da próxima categoria (nunca no meio de uma — cada categoria é atômica,
 *     é o processo filho inteiro ou nada). A categoria em curso no momento
 *     da parada apenas será refeita na próxima execução (sem duplicar).
 *
 * HEALTHCHECK: antes de abrir a fila, corre `scripts/check-database-connection.mjs`
 * (mesmo script do `npm run db:check`). Banco fora aborta ali, sem gastar
 * nem um segundo de Chrome — evita descobrir "banco caiu" só no fim, na
 * hora do --depois-importa.
 *
 * ARQUIVOS DE ESTADO (em output/):
 *   scrape-checkpoint.json    → categorias concluídas (fonte da verdade do progresso)
 *   scrape-all-progress.json  → categoria atual + contadores (para a UI)
 *   scrape-all.stop           → flag de parada (a rota da API cria/remove)
 *
 * USO (terminal):
 *   node scripts/scrape-all-categories.mjs             # coleta tudo / continua de onde parou
 *   node scripts/scrape-all-categories.mjs --reset     # zera checkpoint e recomeça
 *   node scripts/scrape-all-categories.mjs --list      # lista categorias e status
 *   node scripts/scrape-all-categories.mjs --only beleza,sapatos   # filtra por substrings
 *
 * VARIÁVEIS DE AMBIENTE:
 *   PAUSE_BETWEEN_CATEGORIES_MS=15000   pausa entre categorias (padrão: 10–15s aleatório)
 *   VIEW_MORE_MAX_CLICKS=30             cliques em "Ver mais" por categoria (padrão do scraper: 8)
 *   PDP_GALLERY=1 / PDP_GALLERY_MAX=25  ativa galeria de PDP
 *   HEADED=1                            navegador visível
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createAntiBanPolicy } from "../src/scrape/anti-ban.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const OUTPUT_ROOT = path.join(ROOT, "output");
export const CHECKPOINT_FILE = path.join(OUTPUT_ROOT, "scrape-checkpoint.json");
export const PROGRESS_FILE = path.join(OUTPUT_ROOT, "scrape-all-progress.json");
export const STOP_FLAG_FILE = path.join(OUTPUT_ROOT, "scrape-all.stop");
export const BASE = "https://shop.tiktok.com";
const Q = "source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";

// ---------------------------------------------------------------------------
// Catálogo de SUBCATEGORIAS (folhas) — 212 categorias, sem duplicar pais.
// ---------------------------------------------------------------------------
export const CATALOG = [
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
// Chaves e checkpoint
// ---------------------------------------------------------------------------

/** Chave única e estável por categoria (sem query string). */
export function keyForCat(cat) {
  return `${BASE}/br/c/${cat.slug}/${cat.id}`;
}

/** Chave a partir de uma URL completa (remove query string). */
export function keyForUrl(url) {
  return String(url).split("?")[0];
}

/**
 * Quantas vezes uma categoria pode falhar antes de ser posta de lado.
 *
 * Não pode ser 1 (captcha e queda de rede são passageiros: desistir na
 * primeira perde categoria boa), nem infinito (categoria que falha sempre
 * seguraria a fila para sempre e a coleta nunca terminaria). Ao esgotar as
 * tentativas ela sai da fila com o motivo registado, em vez de desaparecer
 * como se tivesse sido colhida.
 */
export const MAX_TENTATIVAS_POR_CATEGORIA = 3;

/** Código de saída que significa "o TikTok barrou a SESSÃO", não "esta categoria falhou". */
export const CODIGO_CAPTCHA = 2;

/**
 * Decide o que uma falha de categoria significa para a fila e para a corrida.
 *
 * Função PURA de propósito: é a regra que decide se uma categoria boa é
 * descartada para sempre e se a corrida inteira para. Errar aqui é caro e
 * silencioso — a barra de progresso continua a subir enquanto o catálogo
 * encolhe. Sendo pura, dá para testar sem browser, sem banco e sem TikTok.
 *
 * @param {{
 *   code: number,
 *   anterior?: { tentativas?: number, bloqueios?: number } | null,
 *   captchasSeguidos: number,
 *   maxTentativas?: number,
 *   captchasAteParar?: number
 * }} p
 */
export function decidirFalha({
  code,
  anterior,
  captchasSeguidos,
  maxTentativas = MAX_TENTATIVAS_POR_CATEGORIA,
  captchasAteParar = 3
}) {
  const ehBloqueioDeSessao = code === CODIGO_CAPTCHA;
  const tentativasAntes = Number(anterior?.tentativas ?? 0);

  // Captcha não gasta tentativa: o contador de 3 existe para pôr de lado
  // categoria mesmo partida (layout mudou, URL morta). Captcha não diz nada
  // sobre a categoria — diz que a sessão está barrada naquele momento.
  const tentativas = ehBloqueioDeSessao ? tentativasAntes : tentativasAntes + 1;
  const bloqueios = Number(anterior?.bloqueios ?? 0) + (ehBloqueioDeSessao ? 1 : 0);

  // Só captcha conta para o disjuntor. Falha de outro tipo não zera o contador
  // porque bloqueio de sessão também sai como código 1 ("sessão fora do
  // shop.tiktok.com") — zerar aí apagaria o rasto do bloqueio a meio.
  const seguidos = ehBloqueioDeSessao ? captchasSeguidos + 1 : captchasSeguidos;

  return {
    ehBloqueioDeSessao,
    tentativas,
    bloqueios,
    captchasSeguidos: seguidos,
    desistiu: tentativas >= maxTentativas,
    deveParar: seguidos >= captchasAteParar
  };
}

export async function loadCheckpoint() {
  try {
    const raw = await fs.readFile(CHECKPOINT_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      completed: new Set(Array.isArray(data.completed) ? data.completed : []),
      // Checkpoint antigo não tem `failures`/`rendimento`; ausência vira objeto vazio.
      failures: data.failures && typeof data.failures === "object" ? { ...data.failures } : {},
      rendimento: data.rendimento && typeof data.rendimento === "object" ? { ...data.rendimento } : {},
      startedAt: data.startedAt ?? new Date().toISOString(),
    };
  } catch {
    return { completed: new Set(), failures: {}, rendimento: {}, startedAt: new Date().toISOString() };
  }
}

/**
 * Quantos produtos a última coleta desta categoria trouxe.
 *
 * Serve para ordenar a fila: categoria que rende 300 produtos vale mais tempo
 * de navegador do que a que rende 4. Sem isto, a ordem é a do catálogo — uma
 * lista escrita à mão que não sabe nada sobre o que cada categoria produz.
 *
 * @param {string} outputDir pasta de saída da categoria
 * @returns {Promise<number|null>} null quando não há ficheiro legível
 */
export async function contarProdutosColhidos(outputDir) {
  try {
    const bruto = await fs.readFile(path.join(outputDir, "dados_produtos.json"), "utf8");
    const dados = JSON.parse(bruto);
    return Array.isArray(dados?.itens) ? dados.itens.length : null;
  } catch {
    return null;
  }
}

/**
 * Como a paginação desta categoria terminou (ver `paginacao` no ficheiro de
 * saída): a lista acabou, ou fomos nós que parámos no teto de cliques?
 *
 * Guardar isto no checkpoint dá a única leitura honesta de profundidade que o
 * projeto consegue: o TikTok não publica o total por subcategoria, então
 * "colhida até ao fim" vs "cortada" é o que separa uma categoria medida de uma
 * categoria amostrada. Sem isto, 110 produtos numa categoria de 110 e 110 numa
 * categoria de 900 entram na base com a mesma cara.
 *
 * @param {string} outputDir
 * @returns {Promise<{ exaustiva: boolean, motivo: string, cliques: number } | null>}
 */
export async function lerPaginacao(outputDir) {
  try {
    const bruto = await fs.readFile(path.join(outputDir, "dados_produtos.json"), "utf8");
    const p = JSON.parse(bruto)?.paginacao;
    if (!p || typeof p !== "object") return null;
    return {
      exaustiva: Boolean(p.exaustiva),
      motivo: String(p.motivo ?? "desconhecido"),
      cliques: Number.isFinite(Number(p.cliques)) ? Number(p.cliques) : 0
    };
  } catch {
    return null;
  }
}

/** Categoria que esgotou as tentativas: sai da fila, mas fica registada como falha. */
export function desistiuDe(failures, key) {
  const f = failures?.[key];
  return Boolean(f && Number(f.tentativas) >= MAX_TENTATIVAS_POR_CATEGORIA);
}

async function saveCheckpoint(completed, startedAt, failures = {}, rendimento = {}) {
  await fs.mkdir(path.dirname(CHECKPOINT_FILE), { recursive: true });
  const desistidas = Object.keys(failures).filter((k) => desistiuDe(failures, k));
  await fs.writeFile(
    CHECKPOINT_FILE,
    JSON.stringify(
      {
        startedAt,
        lastUpdatedAt: new Date().toISOString(),
        completedCount: completed.size,
        totalCount: CATALOG.length,
        // Falhas ficam fora de `completed` de propósito: só o sucesso conta como
        // colhido. Estes dois números separam "não coletei" de "coletei vazio".
        failedCount: Object.keys(failures).length,
        gaveUpCount: desistidas.length,
        completed: [...completed],
        failures,
        rendimento,
      },
      null,
      2
    ),
    "utf8"
  );
}

async function resetCheckpoint() {
  try { await fs.unlink(CHECKPOINT_FILE); } catch { /* ok */ }
  try { await fs.unlink(PROGRESS_FILE); } catch { /* ok */ }
  console.log("[checkpoint] Resetado. Começando do zero.");
}

async function writeProgress(patch) {
  try {
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    // O pid permite a quem lê (API, vigias) confirmar se o processo ainda
    // existe — `running: true` com processo morto é o estado fantasma que
    // aparecia quando a coleta era morta sem escrever o fim.
    await fs.writeFile(
      PROGRESS_FILE,
      JSON.stringify({ ...patch, pid: process.pid, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch { /* progresso é best-effort */ }
}

export async function readProgress() {
  try {
    return JSON.parse(await fs.readFile(PROGRESS_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function buildRun(cat) {
  const outputDir = path.join(OUTPUT_ROOT, "categorias", `${cat.slug}-${cat.id}`);
  const url = `${BASE}/br/c/${cat.slug}/${cat.id}?${Q}`;
  return { label: cat.label, OUTPUT_DIR: outputDir, CATEGORY_URL: url };
}

function stopRequested() {
  return existsSync(STOP_FLAG_FILE);
}

// ---------------------------------------------------------------------------
// Modo --list
// ---------------------------------------------------------------------------

async function listCategories() {
  const { completed, failures, rendimento } = await loadCheckpoint();
  console.log(`\nTotal: ${CATALOG.length} categorias\n`);
  let comFalha = 0;
  let desistidas = 0;
  for (let i = 0; i < CATALOG.length; i++) {
    const cat = CATALOG[i];
    const key = keyForCat(cat);
    const done = completed.has(key);
    const f = failures[key];
    const rend = rendimento[key];
    let icone = "⏳";
    let sufixo = "";
    if (done) {
      icone = "✅";
      if (Number.isFinite(rend?.produtos)) {
        sufixo = `  (${rend.produtos} produtos)`;
      }
    } else if (f) {
      comFalha++;
      if (desistiuDe(failures, key)) {
        desistidas++;
        icone = "❌";
        sufixo = `  ← desisti após ${f.tentativas} tentativas: ${f.motivo}`;
      } else {
        icone = "🔁";
        sufixo = `  ← falhou ${f.tentativas}×, volta à fila: ${f.motivo}`;
      }
    }
    console.log(`${icone} [${String(i + 1).padStart(3)}] ${cat.label}${sufixo}`);
  }
  console.log(
    `\n✅ Concluídas: ${completed.size} | 🔁 A repetir: ${comFalha - desistidas} | ` +
    `❌ De fora: ${desistidas} | ⏳ Nunca tentadas: ${CATALOG.length - completed.size - comFalha}`
  );
}

// ---------------------------------------------------------------------------
// Main (CLI)
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await listCategories();
    return 0;
  }

  // Sempre limpa flag de parada de execuções anteriores ao iniciar.
  try { await fs.unlink(STOP_FLAG_FILE); } catch { /* ok */ }

  // Healthcheck ANTES de abrir Chrome nenhum: banco fora é problema de dono
  // diferente de "coleta deu errado", e descobrir isso só no --depois-importa
  // final, depois de horas de coleta, é o pior momento possível para saber.
  console.log("[doctor] conferindo o banco antes de começar…");
  const doctor = spawnSync(process.execPath, ["scripts/check-database-connection.mjs"], {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (doctor.status !== 0) {
    console.log("\n[doctor] o banco não respondeu. Nada a fazer aqui até ele voltar —");
    console.log("[doctor] a coleta não começa para não gastar horas de Chrome à toa.\n");
    await writeProgress({
      running: false, completedCount: 0, totalCount: CATALOG.length,
      lastError: "banco indisponível no healthcheck inicial (npm run db:check)"
    });
    return 1;
  }

  if (args.includes("--reset")) {
    await resetCheckpoint();
  }

  const filterArg = args.find((a) => a.startsWith("--only="))?.slice(7) ??
                    (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined);
  const filters = filterArg ? filterArg.split(",").map((s) => s.trim().toLowerCase()) : null;

  const { completed, failures, rendimento, startedAt } = await loadCheckpoint();

  let catalog = CATALOG;
  if (filters) {
    catalog = catalog.filter((cat) =>
      filters.some((f) => cat.label.toLowerCase().includes(f) || cat.slug.toLowerCase().includes(f))
    );
    console.log(`[filtro] ${catalog.length} categorias correspondem a: ${filters.join(", ")}`);
  }

  // Volta à fila tudo o que não foi colhido com sucesso — inclusive o que
  // falhou nas execuções anteriores — menos aquilo de que já se desistiu.
  const pending = catalog.filter((cat) => {
    const key = keyForCat(cat);
    if (completed.has(key)) return false;
    return !desistiuDe(failures, key);
  });

  if (pending.length === 0) {
    const desistidas = Object.keys(failures).filter((k) => desistiuDe(failures, k));
    console.log("\n✅ Todas as categorias já foram coletadas! Use --reset para recomeçar.\n");
    if (desistidas.length > 0) {
      console.log(`⚠️  ${desistidas.length} categoria(s) ficaram de fora após ${MAX_TENTATIVAS_POR_CATEGORIA} tentativas:`);
      for (const k of desistidas) {
        console.log(`   • ${k} — ${failures[k]?.motivo ?? "motivo não registado"}`);
      }
      console.log("");
    }
    await writeProgress({
      running: false, completedCount: completed.size, totalCount: CATALOG.length,
      remaining: 0, done: true, failedCount: Object.keys(failures).length, gaveUpCount: desistidas.length
    });
    return 0;
  }

  // Ordem da fila: primeiro o que nunca foi colhido (só se descobre o
  // rendimento de uma categoria colhendo-a), depois as historicamente mais
  // produtivas. Numa coleta interrompida a meio, isto garante que o tempo de
  // navegador vai para onde há produto — em vez de seguir a ordem em que
  // alguém escreveu o catálogo à mão.
  const rendimentoDe = (cat) => {
    const r = rendimento[keyForCat(cat)];
    return Number.isFinite(r?.produtos) ? Number(r.produtos) : null;
  };
  pending.sort((a, b) => {
    const ra = rendimentoDe(a);
    const rb = rendimentoDe(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return -1; // nunca medida vem primeiro
    if (rb == null) return 1;
    return rb - ra; // depois, mais produtiva primeiro
  });

  const alreadyDone = catalog.length - pending.length;
  const nuncaMedidas = pending.filter((c) => rendimentoDe(c) == null).length;
  console.log(`\n📋 Categorias: ${catalog.length} total | ${alreadyDone} já concluídas | ${pending.length} restantes`);
  console.log(`🎯 Fila: ${nuncaMedidas} nunca medida(s) primeiro, depois ${pending.length - nuncaMedidas} por rendimento`);
  console.log(`📁 Checkpoint: ${CHECKPOINT_FILE}`);
  console.log(`⏱  Pausa entre categorias: ${process.env.PAUSE_BETWEEN_CATEGORIES_MS ?? "10–15s (padrão)"}\n`);

  const runs = pending.map(buildRun);

  await writeProgress({
    running: true, startedAt, completedCount: completed.size, totalCount: CATALOG.length,
    remaining: pending.length, currentLabel: null, currentIndex: 0, stopping: false
  });

  const MOTIVO_POR_CODIGO = {
    1: "sem produtos ou sessão fora do shop.tiktok.com",
    2: "verificação de segurança do TikTok (captcha)",
    3: "produtos colhidos mas com campos críticos vazios (provável mudança de layout do TikTok)"
  };

  /**
   * Quantos captchas seguidos antes de parar a corrida inteira.
   *
   * Medido em 22/08/2026: entre 02:44 e 04:23 caíram SETE categorias seguidas
   * em captcha (skincare → men-s-care), uma a cada ~17 min, e a corrida seguiu
   * queimando categoria atrás de categoria contra uma sessão já bloqueada — 75
   * captchas no log daquela noite. Insistir contra um bloqueio não o remove;
   * só gasta categoria boa e reforça o padrão que o TikTok está a detectar.
   */
  const CAPTCHAS_SEGUIDOS_PARA_PARAR = Number(process.env.CAPTCHAS_ATE_PARAR) || 3;

  /** "4h20" / "35min" / "50s" — para o ETA não sair em milissegundos. */
  const fmtDuracao = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return "?";
    const s = Math.round(ms / 1000);
    if (s < 90) return `${s}s`;
    const min = Math.round(s / 60);
    if (min < 90) return `${min}min`;
    const h = Math.floor(min / 60);
    return `${h}h${String(min % 60).padStart(2, "0")}`;
  };

  // Mesma janela/limiar de ação usados dentro de cada categoria (ver
  // scrapeCategory.mjs) — só que aqui é o INTERVALO ENTRE categorias, e por
  // isso precisa da própria instância: cada processo filho nasce e morre
  // dentro de uma categoria, então a memória de "quantas ações recentes" só
  // pode viver aqui, no orquestrador, que é quem sobrevive à corrida inteira.
  const antiBanPolicy = createAntiBanPolicy({
    baseMinMs: Number(process.env.ANTI_BAN_MIN_MS) || 1800,
    baseMaxMs: Number(process.env.ANTI_BAN_MAX_MS) || 4500,
    maxDelayMs: Number(process.env.ANTI_BAN_MAX_DELAY_MS) || 20000,
    maxActionsPerWindow: Number(process.env.ANTI_BAN_ACTIONS_PER_WINDOW) || 8,
    windowMs: Number(process.env.ANTI_BAN_WINDOW_MS) || 60000,
  });

  let exitCode = 0;
  /** Captchas seguidos. Zera só quando uma categoria conclui — ver o disjuntor abaixo. */
  let captchasSeguidos = 0;
  let paradoPorBloqueio = false;
  const inicioCorrida = Date.now();

  for (let i = 0; i < runs.length; i++) {
    if (stopRequested()) {
      console.log(`[scrape] parada solicitada — encerrando antes da categoria ${i + 1}/${runs.length}. Progresso preservado.`);
      break;
    }

    const r = runs[i];
    const label = r.label || r.CATEGORY_URL;
    const key = keyForUrl(r.CATEGORY_URL);

    // Cabeçalho pensado para quem está a ver a corrida ao vivo no terminal:
    // onde estamos na fila, onde estamos no catálogo, e quanto falta. Sem isto
    // o log dizia "[3/182]" e mais nada — não dava para saber se valia esperar.
    const feitasNestaCorrida = i;
    const ritmoMs = feitasNestaCorrida > 0 ? (Date.now() - inicioCorrida) / feitasNestaCorrida : null;
    const eta = ritmoMs != null ? fmtDuracao(ritmoMs * (runs.length - i)) : "a medir";
    const ritmoTxt = ritmoMs != null ? ` · ${fmtDuracao(ritmoMs)}/categoria` : "";
    console.log(`\n${"━".repeat(72)}`);
    console.log(`[${i + 1}/${runs.length}] ${label}`);
    console.log(
      `   catálogo ${completed.size}/${CATALOG.length} · faltam ${runs.length - i}` +
      ` · ~${eta} restantes${ritmoTxt}`
    );
    console.log(`${"━".repeat(72)}`);

    await writeProgress({
      running: true, startedAt, completedCount: completed.size, totalCount: CATALOG.length,
      remaining: runs.length - i, currentLabel: label, currentUrl: r.CATEGORY_URL,
      currentIndex: alreadyDone + i + 1, stopping: false
    });

    // A categoria inteira roda num processo Node filho, isolado, com o seu
    // próprio Chrome — nasce, coleta, morre. `spawnSync` de propósito: a
    // corrida é sequencial por design (perfil do Puppeteer é compartilhado
    // pelas categorias, dois ao mesmo tempo seria dois browsers na mesma
    // sessão do TikTok), então não há nada a ganhar rodando em paralelo aqui.
    const child = spawnSync(process.execPath, ["src/scrapeCategory.mjs"], {
      cwd: ROOT,
      env: { ...process.env, CATEGORY_URL: r.CATEGORY_URL, OUTPUT_DIR: r.OUTPUT_DIR },
      stdio: "inherit"
    });
    if (child.error) {
      console.error(`[scrape] falha ao lançar processo da categoria: ${child.error.message}`);
    }
    // status vem null quando o processo morre por sinal (ex.: kill externo)
    // em vez de terminar sozinho — trata como falha genérica, não como sucesso.
    const code = typeof child.status === "number" ? child.status : 1;
    exitCode = Math.max(exitCode, code);

    if (code === 0) {
      completed.add(key);
      // Sucesso limpa o histórico de falhas: a categoria voltou a responder e
      // não deve carregar tentativas velhas para a próxima vez que falhar.
      delete failures[key];
      // Só o sucesso desarma o disjuntor: uma categoria que colheu prova que a
      // sessão voltou. Falha de outro tipo NÃO zera o contador, porque bloqueio
      // de sessão também sai como código 1 ("sessão fora do shop.tiktok.com").
      captchasSeguidos = 0;
      antiBanPolicy.recordSuccess();

      const produtos = await contarProdutosColhidos(r.OUTPUT_DIR);
      const pag = await lerPaginacao(r.OUTPUT_DIR);
      if (produtos != null) {
        rendimento[key] = {
          produtos,
          // `exaustiva: false` = a categoria tem mais e o corte foi nosso.
          // Quem ler o rendimento precisa saber se 110 é o tamanho da categoria
          // ou só o ponto onde parámos.
          ...(pag ? { exaustiva: pag.exaustiva, motivoFim: pag.motivo, cliques: pag.cliques } : {}),
          em: new Date().toISOString()
        };
      }

      await saveCheckpoint(completed, startedAt, failures, rendimento);
      await writeProgress({
        running: true, startedAt, completedCount: completed.size, totalCount: CATALOG.length,
        remaining: runs.length - i - 1, currentLabel: null, currentIndex: completed.size, stopping: false
      });
      const notaProfundidade = pag
        ? pag.exaustiva
          ? " · lista esgotada"
          : ` · CORTADA no teto de ${pag.cliques} clique(s) — tem mais`
        : "";
      console.log(
        `[checkpoint] salvo (${completed.size}/${CATALOG.length} concluídas` +
        `${produtos != null ? `, ${produtos} produto(s)` : ""}${notaProfundidade})`
      );
    } else {
      const motivo = MOTIVO_POR_CODIGO[code] ?? `coleta terminou com código ${code}`;

      // A regra mora em `decidirFalha` (função pura, testada) — aqui só se
      // aplica o que ela decidiu. Ver o comentário dela para o porquê de
      // captcha não gastar tentativa.
      const d = decidirFalha({
        code,
        anterior: failures[key],
        captchasSeguidos,
        captchasAteParar: CAPTCHAS_SEGUIDOS_PARA_PARAR
      });
      const { ehBloqueioDeSessao, tentativas, bloqueios } = d;
      captchasSeguidos = d.captchasSeguidos;

      failures[key] = { tentativas, bloqueios, codigo: code, motivo, em: new Date().toISOString() };
      // NÃO entra em `completed`: na próxima execução volta à fila sozinha.
      await saveCheckpoint(completed, startedAt, failures, rendimento);
      await writeProgress({
        running: true, startedAt, completedCount: completed.size, totalCount: CATALOG.length,
        remaining: runs.length - i - 1, currentLabel: null, currentIndex: completed.size, stopping: false,
        failedCount: Object.keys(failures).length
      });

      if (ehBloqueioDeSessao) {
        antiBanPolicy.recordFailure({ reason: "captcha" });
        console.log(
          `\n  ⚠  CAPTCHA (${captchasSeguidos} seguido${captchasSeguidos > 1 ? "s" : ""}) — o TikTok barrou a SESSÃO, não a categoria.`
        );
        console.log(`     "${label}" volta à fila SEM gastar tentativa.`);
        if (captchasSeguidos < CAPTCHAS_SEGUIDOS_PARA_PARAR) {
          console.log(`     Mais ${CAPTCHAS_SEGUIDOS_PARA_PARAR - captchasSeguidos} e a corrida para sozinha.\n`);
        }
      } else {
        const restantes = MAX_TENTATIVAS_POR_CATEGORIA - tentativas;
        console.log(
          restantes > 0
            ? `  ✗ ${motivo}. Volta à fila (${restantes} tentativa(s) restante(s)).`
            : `  ✗ ${motivo}. ${MAX_TENTATIVAS_POR_CATEGORIA} tentativas sem sucesso: fica de fora até um --reset.`
        );
      }

      // Disjuntor: contra uma sessão bloqueada, insistir não desbloqueia — só
      // queima categoria boa e reforça o padrão que o TikTok está a detectar.
      if (d.deveParar) {
        console.log(`\n${"█".repeat(72)}`);
        console.log(`  PARADO: ${captchasSeguidos} captchas seguidos — a sessão está bloqueada.`);
        console.log(`  Nada foi perdido: ${completed.size}/${CATALOG.length} concluídas, e as categorias`);
        console.log(`  barradas voltam à fila intactas (captcha não gasta tentativa).`);
        console.log(`  Espere um tempo antes de recomeçar; insistir agora só piora.`);
        console.log(`${"█".repeat(72)}\n`);
        paradoPorBloqueio = true;
        break;
      }
    }

    if (i < runs.length - 1) {
      const envPause = Number(process.env.PAUSE_BETWEEN_CATEGORIES_MS);
      const baseDelay = Number.isFinite(envPause) && envPause >= 0 ? envPause : 10_000 + Math.random() * 5_000;
      const delay = Math.max(baseDelay, antiBanPolicy.nextDelay({ reason: "category-gap" }));
      console.log(`[scrape] aguardando ${Math.round(delay / 1000)}s antes da próxima categoria...`);
      // Pausa abortável: verifica parada a cada 500ms para reagir rápido ao botão Parar.
      const step = 500;
      for (let waited = 0; waited < delay; waited += step) {
        if (stopRequested()) break;
        await new Promise((res) => setTimeout(res, Math.min(step, delay - waited)));
      }
    }
  }

  const stopped = stopRequested();
  // "Terminou" = nada mais na fila. Categoria de que se desistiu conta como
  // resolvida para este fim, senão a coleta ficaria eternamente incompleta por
  // causa de uma categoria que nunca responde.
  const desistidas = Object.keys(failures).filter((k) => desistiuDe(failures, k));
  const resolvidas = completed.size + desistidas.length;
  await writeProgress({
    running: false, startedAt, completedCount: completed.size, totalCount: CATALOG.length,
    remaining: CATALOG.length - resolvidas, currentLabel: null, stopping: false,
    stoppedByUser: stopped, done: resolvidas >= CATALOG.length,
    failedCount: Object.keys(failures).length, gaveUpCount: desistidas.length,
    // O painel precisa distinguir "acabou" de "fomos barrados": sem isto a UI
    // mostra uma parada por bloqueio com a mesma cara de uma parada normal, e
    // quem olha não sabe que basta esperar e recomeçar.
    stoppedByBlock: paradoPorBloqueio,
    lastError: paradoPorBloqueio
      ? `Sessão bloqueada pelo TikTok (${captchasSeguidos} captchas seguidos). As categorias barradas voltam à fila sem perder tentativa — espere um tempo e recomece.`
      : ""
  });
  try { await fs.unlink(STOP_FLAG_FILE); } catch { /* ok */ }

  if (paradoPorBloqueio) {
    console.log(`\n🛑 Coleta interrompida por bloqueio de sessão. Concluídas: ${completed.size}/${CATALOG.length}.`);
    console.log(`   Recomece mais tarde: nada se perdeu e nenhuma categoria foi penalizada.`);
  } else if (stopped) {
    console.log(`\n⏸  Coleta pausada a pedido. Concluídas: ${completed.size}/${CATALOG.length}. Reinicie para continuar de onde parou.`);
  } else {
    console.log(`\n🏁 Coleta finalizada (código ${exitCode}). Concluídas: ${completed.size}/${CATALOG.length}`);
    if (desistidas.length > 0) {
      console.log(`⚠️  ${desistidas.length} categoria(s) de fora após ${MAX_TENTATIVAS_POR_CATEGORIA} tentativas (veja "failures" no checkpoint).`);
    }
    if (resolvidas < CATALOG.length) {
      console.log(`   Para continuar: node scripts/scrape-all-categories.mjs`);
    }
  }

  // --depois-importa: consolida e importa AQUI, no próprio processo da coleta.
  //
  // Antes isso morava no handler `close` da API — e a API roda com
  // `node --watch`: qualquer edição num ficheiro do servidor a reinicia, o que
  // MATA os filhos e perde o handler. Foi assim que uma coleta morreu aos
  // 3/212 sem deixar erro nenhum (08/08/2026). Com o pós-processamento aqui, a
  // coleta é dona do próprio ciclo e sobrevive à API inteira.
  if (process.argv.includes("--depois-importa")) {
    console.log("\n[pós] a consolidar categorias…");
    const c1 = spawnSync(process.execPath, ["scripts/consolidate-category-outputs.mjs"], { cwd: ROOT, stdio: "inherit" });
    if (c1.status === 0) {
      console.log("[pós] a importar para a base…");
      const c2 = spawnSync(
        process.execPath,
        ["--import", "./scripts/load-root-env.mjs", "scripts/import-output-to-db.mjs"],
        { cwd: ROOT, stdio: "inherit" }
      );
      console.log(c2.status === 0 ? "[pós] base atualizada." : `[pós] import falhou (código ${c2.status}).`);
    } else {
      console.log(`[pós] consolidação falhou (código ${c1.status}) — import não executado.`);
    }
  }

  return exitCode;
}

// Só executa o main quando chamado diretamente (não em import pela rota da API).
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const code = await main();
  process.exit(typeof code === "number" ? code : 0);
}
