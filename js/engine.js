// Pure filter/sort engine over slot value objects — the direct port of the Swift
// SpriteSlotEngine. Kept free of DOM and storage so it runs under `node --test`
// exactly as it runs in the browser.

export const RARITY_RANK = { rare: 0, epic: 1, legendary: 2, mythic: 3, unknown: -1 };

export const TIER_ORDER = [
  "gold", "gummy", "galaxy", "holofoil", "cube", "quack", "gem", "special",
];

export function defaultQuery() {
  return { search: "", ownership: "all", rarities: [], tiers: [], sort: "standard" };
}

export function isFiltering(query) {
  return Boolean(
    query.search.trim() || query.ownership !== "all" ||
    query.rarities.length || query.tiers.length
  );
}

function matchesSearch(slot, needle) {
  const haystacks = [
    slot.name, slot.base, slot.tier ?? "standard", slot.rarity, slot.power ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

export function applyQuery(query, slots, ownedIds) {
  const needle = query.search.trim().toLowerCase();
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);

  const filtered = slots.filter((slot) => {
    if (needle && !matchesSearch(slot, needle)) return false;
    if (query.rarities.length && !query.rarities.includes(slot.rarity)) return false;
    if (query.tiers.length && !query.tiers.includes(slot.tier ?? "standard")) return false;
    if (query.ownership === "owned") return owned.has(slot.id);
    if (query.ownership === "missing") return !owned.has(slot.id);
    return true;
  });

  return sortSlots(filtered, query.sort);
}

// `standard` keeps the catalogue's own order, so a sprite's forms stay adjacent
// instead of "Fire" and "Gold Fire" scattering to opposite ends of the alphabet.
export function sortSlots(slots, sort) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  switch (sort) {
    case "nameAsc": return [...slots].sort(byName);
    case "nameDesc": return [...slots].sort((a, b) => byName(b, a));
    case "rarityDesc":
      return [...slots].sort((a, b) =>
        (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || byName(a, b));
    case "rarityAsc":
      return [...slots].sort((a, b) =>
        (RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]) || byName(a, b));
    case "tier":
      return [...slots].sort((a, b) => {
        const ta = a.tier ?? "", tb = b.tier ?? "";
        return ta === tb ? byName(a, b) : ta.localeCompare(tb);
      });
    default: return slots;
  }
}

// Tiers present in the data, in display order — read from the slots so a new tier
// in the catalogue appears in the UI without a code change.
export function availableTiers(slots) {
  const present = new Set(slots.map((s) => s.tier).filter(Boolean));
  const known = TIER_ORDER.filter((t) => present.has(t));
  const rest = [...present].filter((t) => !TIER_ORDER.includes(t)).sort();
  return [...known, ...rest];
}

export function tierProgress(slots, ownedIds, tier) {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const inTier = slots.filter((s) => (s.tier ?? null) === tier);
  return {
    total: inTier.length,
    owned: inTier.filter((s) => owned.has(s.id)).length,
  };
}

// Display grouping: one entry per sprite, its surviving slots nested, sprites that
// match nothing dropped. Display order comes from data.sprites (catalogue order) and
// never from the slots array, whose order belongs to the share codes.
export function groupResults(query, data, ownedIds) {
  const slotById = new Map(data.slots.map((s) => [s.id, s]));
  const matched = new Set(applyQuery(query, data.slots, ownedIds).map((s) => s.id));
  const groups = data.sprites.map((sprite) => ({
    ...sprite,
    slots: sprite.slots.map((id) => slotById.get(id)).filter((s) => s && matched.has(s.id)),
  })).filter((g) => g.slots.length > 0);
  return sortGroups(groups, query.sort);
}

export function sortGroups(groups, sort) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  switch (sort) {
    case "nameAsc": return [...groups].sort(byName);
    case "nameDesc": return [...groups].sort((a, b) => byName(b, a));
    case "rarityDesc":
      return [...groups].sort((a, b) =>
        (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || byName(a, b));
    case "rarityAsc":
      return [...groups].sort((a, b) =>
        (RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]) || byName(a, b));
    default: return groups;
  }
}

export function milestone(fraction) {
  if (fraction <= 0) return "Tap a sprite to catch it";
  if (fraction < 0.25) return "Just getting started";
  if (fraction < 0.5) return "Warming up";
  if (fraction < 0.75) return "Over halfway!";
  if (fraction < 1) return "So close…";
  return "Full dex. Legend.";
}
