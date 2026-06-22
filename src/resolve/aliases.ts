// Seed alias map for the stub. Keys are lowercased tokens that appear in place
// strings; values are present-day countries. This deliberately includes the hard
// historical names so the stub's *limitation* is visible: it maps "Lemberg" to its
// MODERN country (Ukraine), whereas the real temporal resolver will map it to the
// polity at the event date (Austria-Hungary in 1881). That gap is the whole point
// of stage 3 — and these entries are the start of your golden test set.

export const COUNTRY_ALIASES: Record<string, string> = {
  // historical / renamed places -> modern country
  prussia: 'Germany',
  bavaria: 'Germany',
  saxony: 'Germany',
  'königsberg': 'Russia',
  koenigsberg: 'Russia',
  danzig: 'Poland',
  breslau: 'Poland',
  christiania: 'Norway',
  kristiania: 'Norway',
  'åbo': 'Finland',
  abo: 'Finland',
  bohemia: 'Czechia',
  moravia: 'Czechia',
  lemberg: 'Ukraine',
  'lwów': 'Ukraine',
  lwow: 'Ukraine',
  pressburg: 'Slovakia',
  constantinople: 'Turkey',
  // plain modern country names
  usa: 'United States',
  'united states': 'United States',
  norway: 'Norway',
  sweden: 'Sweden',
  finland: 'Finland',
  denmark: 'Denmark',
  germany: 'Germany',
  poland: 'Poland',
  ukraine: 'Ukraine',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  ireland: 'Ireland',
};

// Cultural-region preview (real version comes from historical-basemaps PARTOF).
export const CULTURAL_REGION: Record<string, string> = {
  Norway: 'Nordic',
  Sweden: 'Nordic',
  Finland: 'Nordic',
  Denmark: 'Nordic',
  'United Kingdom': 'British Isles',
  Ireland: 'British Isles',
};
