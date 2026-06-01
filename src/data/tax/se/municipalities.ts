// Swedish municipalities and their combined (kommunal + regional) tax
// rate, the single biggest lever in the take-home calculation. Confined
// to this folder like every other SE-specific figure.
//
// Source: Skatteverket's published `skattesatser-kommuner-<year>.xlsx`
// ("Skattesatser per kommun"), combined column = kommunalskatt +
// regionskatt (begravningsavgift and kyrkoavgift excluded — church is
// modelled separately via `churchRateDefault`). Ids are the official
// 4-digit SCB kommunkod so they stay stable across renames.
//
// Rates are stored as fractions (0.3237 = 32.37 %). The table below is
// the latest published set; `RATES_BY_YEAR` maps each supported tax
// year to a rate record. Years without a transcribed override fall back
// to the nearest available year via `rateForMunicipality`, so a kommun
// is never left without a rate. To refine a specific year, add that
// year's record to `RATES_BY_YEAR` — the accessor picks it up with no
// other change.

export type Municipality = {
  // Official SCB kommunkod (4 digits), stable across renames.
  id: string;
  name: string;
};

// Average combined rate — the fallback used when a profile references a
// kommun id that isn't in the table (e.g. a future merge). 2026 average
// per Skatteverket is ≈ 32.38 %.
export const MUNICIPALITY_AVG_RATE = 0.3238;

// The base combined-rate set (latest published year). `[kommunkod,
// name, combinedRate]`. Kept as a flat tuple list so the ~290 rows stay
// scannable and the id/name/rate triple can't drift apart.
const BASE: ReadonlyArray<readonly [string, string, number]> = [
  ["0114", "Upplands Väsby", 0.3163],
  ["0115", "Vallentuna", 0.3133],
  ["0117", "Österåker", 0.301],
  ["0120", "Värmdö", 0.3201],
  ["0123", "Järfälla", 0.3043],
  ["0125", "Ekerö", 0.3093],
  ["0126", "Huddinge", 0.3214],
  ["0127", "Botkyrka", 0.3223],
  ["0128", "Salem", 0.3213],
  ["0136", "Haninge", 0.3198],
  ["0138", "Tyresö", 0.3148],
  ["0139", "Upplands-Bro", 0.3163],
  ["0140", "Nykvarn", 0.3253],
  ["0160", "Täby", 0.2973],
  ["0162", "Danderyd", 0.2963],
  ["0163", "Sollentuna", 0.3013],
  ["0180", "Stockholm", 0.2982],
  ["0181", "Södertälje", 0.3413],
  ["0182", "Nacka", 0.3066],
  ["0183", "Sundbyberg", 0.3122],
  ["0184", "Solna", 0.2905],
  ["0186", "Lidingö", 0.3053],
  ["0187", "Vaxholm", 0.3253],
  ["0188", "Norrtälje", 0.3253],
  ["0191", "Sigtuna", 0.3273],
  ["0192", "Nynäshamn", 0.3283],
  ["0305", "Håbo", 0.3403],
  ["0319", "Älvkarleby", 0.342],
  ["0330", "Knivsta", 0.336],
  ["0331", "Heby", 0.342],
  ["0360", "Tierp", 0.339],
  ["0380", "Uppsala", 0.3285],
  ["0381", "Enköping", 0.339],
  ["0382", "Östhammar", 0.336],
  ["0428", "Vingåker", 0.3338],
  ["0461", "Gnesta", 0.3338],
  ["0480", "Nyköping", 0.3308],
  ["0481", "Oxelösund", 0.3398],
  ["0482", "Flen", 0.3398],
  ["0483", "Katrineholm", 0.3328],
  ["0484", "Eskilstuna", 0.3318],
  ["0486", "Strängnäs", 0.3258],
  ["0488", "Trosa", 0.3328],
  ["0509", "Ödeshög", 0.3315],
  ["0512", "Ydre", 0.3315],
  ["0513", "Kinda", 0.3305],
  ["0560", "Boxholm", 0.3325],
  ["0561", "Åtvidaberg", 0.3345],
  ["0562", "Finspång", 0.3325],
  ["0563", "Valdemarsvik", 0.3375],
  ["0580", "Linköping", 0.3215],
  ["0581", "Norrköping", 0.3315],
  ["0582", "Söderköping", 0.3325],
  ["0583", "Motala", 0.3325],
  ["0584", "Vadstena", 0.3345],
  ["0586", "Mjölby", 0.3315],
  ["0604", "Aneby", 0.3443],
  ["0617", "Gnosjö", 0.3393],
  ["0642", "Mullsjö", 0.3463],
  ["0643", "Habo", 0.3303],
  ["0662", "Gislaved", 0.3343],
  ["0665", "Vaggeryd", 0.3343],
  ["0680", "Jönköping", 0.3393],
  ["0682", "Nässjö", 0.3443],
  ["0683", "Värnamo", 0.3343],
  ["0684", "Sävsjö", 0.3493],
  ["0685", "Vetlanda", 0.3393],
  ["0686", "Eksjö", 0.3443],
  ["0687", "Tranås", 0.3393],
  ["0760", "Uppvidinge", 0.3493],
  ["0761", "Lessebo", 0.3543],
  ["0763", "Tingsryd", 0.3413],
  ["0764", "Alvesta", 0.3373],
  ["0765", "Älmhult", 0.3293],
  ["0767", "Markaryd", 0.3373],
  ["0780", "Växjö", 0.3243],
  ["0781", "Ljungby", 0.3243],
  ["0821", "Högsby", 0.3503],
  ["0834", "Torsås", 0.3458],
  ["0840", "Mörbylånga", 0.3398],
  ["0860", "Hultsfred", 0.3463],
  ["0861", "Mönsterås", 0.3358],
  ["0862", "Emmaboda", 0.3408],
  ["0880", "Kalmar", 0.3358],
  ["0881", "Nybro", 0.3458],
  ["0882", "Oskarshamn", 0.3358],
  ["0883", "Västervik", 0.3358],
  ["0884", "Vimmerby", 0.3408],
  ["0885", "Borgholm", 0.3398],
  ["0980", "Gotland", 0.336],
  ["1060", "Olofström", 0.3346],
  ["1080", "Karlskrona", 0.3338],
  ["1081", "Ronneby", 0.3346],
  ["1082", "Karlshamn", 0.3346],
  ["1083", "Sölvesborg", 0.3326],
  ["1214", "Svalöv", 0.3169],
  ["1230", "Staffanstorp", 0.3046],
  ["1231", "Burlöv", 0.3169],
  ["1233", "Vellinge", 0.3019],
  ["1256", "Östra Göinge", 0.3169],
  ["1257", "Örkelljunga", 0.3169],
  ["1260", "Bjuv", 0.3169],
  ["1261", "Kävlinge", 0.3019],
  ["1262", "Lomma", 0.3019],
  ["1263", "Svedala", 0.3119],
  ["1264", "Skurup", 0.3169],
  ["1265", "Sjöbo", 0.3169],
  ["1266", "Hörby", 0.3169],
  ["1267", "Höör", 0.3169],
  ["1270", "Tomelilla", 0.3169],
  ["1272", "Bromölla", 0.3146],
  ["1273", "Osby", 0.3169],
  ["1275", "Perstorp", 0.3169],
  ["1276", "Klippan", 0.3169],
  ["1277", "Åstorp", 0.3169],
  ["1278", "Båstad", 0.3119],
  ["1280", "Malmö", 0.3147],
  ["1281", "Lund", 0.3117],
  ["1282", "Landskrona", 0.3169],
  ["1283", "Helsingborg", 0.3107],
  ["1284", "Höganäs", 0.3019],
  ["1285", "Eslöv", 0.3169],
  ["1286", "Ystad", 0.3119],
  ["1287", "Trelleborg", 0.3169],
  ["1290", "Kristianstad", 0.3146],
  ["1291", "Simrishamn", 0.3169],
  ["1292", "Ängelholm", 0.3019],
  ["1293", "Hässleholm", 0.3146],
  ["1315", "Hylte", 0.3335],
  ["1380", "Halmstad", 0.3115],
  ["1381", "Laholm", 0.3135],
  ["1382", "Falkenberg", 0.3135],
  ["1383", "Varberg", 0.3115],
  ["1384", "Kungsbacka", 0.3115],
  ["1401", "Härryda", 0.3265],
  ["1402", "Partille", 0.3295],
  ["1407", "Öckerö", 0.3345],
  ["1415", "Stenungsund", 0.3315],
  ["1419", "Tjörn", 0.3315],
  ["1421", "Orust", 0.3415],
  ["1427", "Sotenäs", 0.3315],
  ["1430", "Munkedal", 0.3415],
  ["1435", "Tanum", 0.3315],
  ["1438", "Dals-Ed", 0.3465],
  ["1439", "Färgelanda", 0.3465],
  ["1440", "Ale", 0.3315],
  ["1441", "Lerum", 0.3315],
  ["1442", "Vårgårda", 0.3415],
  ["1443", "Bollebygd", 0.3365],
  ["1444", "Grästorp", 0.3415],
  ["1445", "Essunga", 0.3415],
  ["1446", "Karlsborg", 0.3415],
  ["1447", "Gullspång", 0.3465],
  ["1452", "Tranemo", 0.3365],
  ["1460", "Bengtsfors", 0.3465],
  ["1461", "Mellerud", 0.3465],
  ["1462", "Lilla Edet", 0.3415],
  ["1463", "Mark", 0.3365],
  ["1465", "Svenljunga", 0.3365],
  ["1466", "Herrljunga", 0.3415],
  ["1470", "Vara", 0.3415],
  ["1471", "Götene", 0.3415],
  ["1472", "Tibro", 0.3415],
  ["1473", "Töreboda", 0.3465],
  ["1480", "Göteborg", 0.329],
  ["1481", "Mölndal", 0.3263],
  ["1482", "Kungälv", 0.3315],
  ["1484", "Lysekil", 0.3415],
  ["1485", "Uddevalla", 0.3315],
  ["1486", "Strömstad", 0.3315],
  ["1487", "Vänersborg", 0.3415],
  ["1488", "Trollhättan", 0.3315],
  ["1489", "Alingsås", 0.3315],
  ["1490", "Borås", 0.3365],
  ["1491", "Ulricehamn", 0.3365],
  ["1492", "Åmål", 0.3465],
  ["1493", "Mariestad", 0.3415],
  ["1494", "Lidköping", 0.3415],
  ["1495", "Skara", 0.3415],
  ["1496", "Skövde", 0.3415],
  ["1497", "Hjo", 0.3415],
  ["1498", "Tidaholm", 0.3415],
  ["1499", "Falköping", 0.3415],
  ["1715", "Kil", 0.337],
  ["1730", "Eda", 0.342],
  ["1737", "Torsby", 0.347],
  ["1760", "Storfors", 0.347],
  ["1761", "Hammarö", 0.332],
  ["1762", "Munkfors", 0.347],
  ["1763", "Forshaga", 0.342],
  ["1764", "Grums", 0.342],
  ["1765", "Årjäng", 0.342],
  ["1766", "Sunne", 0.342],
  ["1780", "Karlstad", 0.332],
  ["1781", "Kristinehamn", 0.342],
  ["1782", "Filipstad", 0.347],
  ["1783", "Hagfors", 0.347],
  ["1784", "Arvika", 0.342],
  ["1785", "Säffle", 0.342],
  ["1814", "Lekeberg", 0.3408],
  ["1860", "Laxå", 0.3458],
  ["1861", "Hallsberg", 0.3408],
  ["1862", "Degerfors", 0.3458],
  ["1863", "Hällefors", 0.3508],
  ["1864", "Ljusnarsberg", 0.3508],
  ["1880", "Örebro", 0.3335],
  ["1881", "Kumla", 0.3358],
  ["1882", "Askersund", 0.3408],
  ["1883", "Karlskoga", 0.3358],
  ["1884", "Nora", 0.3458],
  ["1885", "Lindesberg", 0.3458],
  ["1904", "Skinnskatteberg", 0.3393],
  ["1907", "Surahammar", 0.3393],
  ["1960", "Kungsör", 0.3343],
  ["1961", "Hallstahammar", 0.3393],
  ["1962", "Norberg", 0.3443],
  ["1980", "Västerås", 0.3193],
  ["1981", "Sala", 0.3343],
  ["1982", "Fagersta", 0.3393],
  ["1983", "Köping", 0.3343],
  ["1984", "Arboga", 0.3343],
  ["2021", "Vansbro", 0.3434],
  ["2023", "Malung-Sälen", 0.3434],
  ["2026", "Gagnef", 0.3434],
  ["2029", "Leksand", 0.3384],
  ["2031", "Rättvik", 0.3434],
  ["2034", "Orsa", 0.3434],
  ["2039", "Älvdalen", 0.3434],
  ["2061", "Smedjebacken", 0.3434],
  ["2062", "Mora", 0.3384],
  ["2080", "Falun", 0.3334],
  ["2081", "Borlänge", 0.3384],
  ["2082", "Säter", 0.3434],
  ["2083", "Hedemora", 0.3434],
  ["2084", "Avesta", 0.3384],
  ["2085", "Ludvika", 0.3384],
  ["2101", "Ockelbo", 0.3415],
  ["2104", "Hofors", 0.3415],
  ["2121", "Ovanåker", 0.3365],
  ["2132", "Nordanstig", 0.3415],
  ["2161", "Ljusdal", 0.3415],
  ["2180", "Gävle", 0.3315],
  ["2181", "Sandviken", 0.3365],
  ["2182", "Söderhamn", 0.3415],
  ["2183", "Bollnäs", 0.3365],
  ["2184", "Hudiksvall", 0.3365],
  ["2260", "Ånge", 0.3473],
  ["2262", "Timrå", 0.3373],
  ["2280", "Härnösand", 0.3473],
  ["2281", "Sundsvall", 0.3373],
  ["2282", "Kramfors", 0.3473],
  ["2283", "Sollefteå", 0.3473],
  ["2284", "Örnsköldsvik", 0.3373],
  ["2303", "Ragunda", 0.3452],
  ["2305", "Bräcke", 0.3452],
  ["2309", "Krokom", 0.3402],
  ["2313", "Strömsund", 0.3502],
  ["2321", "Åre", 0.3402],
  ["2326", "Berg", 0.3452],
  ["2361", "Härjedalen", 0.3452],
  ["2380", "Östersund", 0.3352],
  ["2401", "Nordmaling", 0.3433],
  ["2403", "Bjurholm", 0.3483],
  ["2404", "Vindeln", 0.3483],
  ["2409", "Robertsfors", 0.3483],
  ["2417", "Norsjö", 0.3483],
  ["2418", "Malå", 0.3483],
  ["2421", "Storuman", 0.3483],
  ["2422", "Sorsele", 0.3533],
  ["2425", "Dorotea", 0.3533],
  ["2460", "Vännäs", 0.3433],
  ["2462", "Vilhelmina", 0.3533],
  ["2463", "Åsele", 0.3533],
  ["2480", "Umeå", 0.339],
  ["2481", "Lycksele", 0.3483],
  ["2482", "Skellefteå", 0.3383],
  ["2505", "Arvidsjaur", 0.3438],
  ["2506", "Arjeplog", 0.3488],
  ["2510", "Jokkmokk", 0.3438],
  ["2513", "Överkalix", 0.3488],
  ["2514", "Kalix", 0.3388],
  ["2518", "Övertorneå", 0.3438],
  ["2521", "Pajala", 0.3488],
  ["2523", "Gällivare", 0.3388],
  ["2560", "Älvsbyn", 0.3388],
  ["2580", "Luleå", 0.3288],
  ["2581", "Piteå", 0.3338],
  ["2582", "Boden", 0.3388],
  ["2583", "Haparanda", 0.3438],
  ["2584", "Kiruna", 0.3388],
];

export const MUNICIPALITIES: ReadonlyArray<Municipality> = BASE.map(
  ([id, name]) => ({ id, name }),
);

// Per-year rate records. Only the latest published set is transcribed
// here; `rateForMunicipality` falls back to the nearest available year
// for the others, so every supported year resolves a rate. Adding a
// year-specific record (e.g. 2024) refines just that year.
const LATEST_YEAR = 2026;

const LATEST_RATES: Record<string, number> = Object.fromEntries(
  BASE.map(([id, , rate]) => [id, rate]),
);

export const RATES_BY_YEAR: Record<number, Record<string, number>> = {
  [LATEST_YEAR]: LATEST_RATES,
};

// Resolve a kommun's combined rate for a tax year. Falls back to the
// nearest year that has a transcribed record, then to the national
// average when the id is unknown entirely. Pure — no clamping of the
// year here; the caller (the calculator) clamps before looking up.
export function rateForMunicipality(
  municipalityId: string,
  year: number,
): number {
  const exact = RATES_BY_YEAR[year]?.[municipalityId];
  if (exact !== undefined) return exact;
  // Nearest available year — pick the closest key, ties favouring the
  // later year (more representative of "now").
  const years = Object.keys(RATES_BY_YEAR)
    .map(Number)
    .sort((a, b) => Math.abs(a - year) - Math.abs(b - year) || b - a);
  for (const y of years) {
    const rate = RATES_BY_YEAR[y][municipalityId];
    if (rate !== undefined) return rate;
  }
  return MUNICIPALITY_AVG_RATE;
}

const MUNICIPALITY_IDS = new Set(MUNICIPALITIES.map((m) => m.id));

export function isKnownMunicipality(id: string): boolean {
  return MUNICIPALITY_IDS.has(id);
}

// Default kommun for a fresh profile — Stockholm, the largest. Pure
// constant so the profile editor seeds a valid id from day one.
export const DEFAULT_MUNICIPALITY_ID = "0180";
