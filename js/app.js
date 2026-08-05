// DOM wiring only — all logic lives in engine.js / store.js where node can test it.

import {
  applyQuery, availableTiers, defaultQuery, isFiltering, milestone, tierProgress,
} from "./engine.js";
import { clearAll, exportCode, importCode, loadOwned, saveOwned, toggle } from "./store.js";

const TIER_VARS = {
  gold: "--gold", gummy: "--gummy", galaxy: "--galaxy", holofoil: "--holofoil",
  cube: "--cube", quack: "--quack", gem: "--gem", special: "--special",
};
const RARITY_VARS = {
  rare: "--rare", epic: "--epic", legendary: "--legendary",
  mythic: "--mythic", unknown: "--unknown",
};
const RARITIES = ["mythic", "legendary", "epic", "rare", "unknown"];

const $ = (id) => document.getElementById(id);

let slots = [];
let owned = loadOwned();
let query = defaultQuery();

async function boot() {
  const res = await fetch("data/slots.json");
  slots = (await res.json()).slots;

  buildFilterChips();
  wireEvents();
  importFromUrlHash();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// --- Rendering -------------------------------------------------------------

function render() {
  renderHero();
  renderGrid();
  renderMeta();
}

function renderHero() {
  const total = slots.length;
  const have = [...owned].filter((id) => slots.some((s) => s.id === id)).length;
  $("ownedCount").textContent = have;
  $("totalCount").textContent = `/ ${total}`;
  $("milestone").textContent = milestone(total ? have / total : 0);
  $("barFill").style.width = `${total ? (have / total) * 100 : 0}%`;

  const chips = [null, ...availableTiers(slots)].map((tier) => {
    const { total: t, owned: o } = tierProgress(slots, owned, tier);
    if (!t) return "";
    const cssVar = tier ? TIER_VARS[tier] ?? "--unknown" : "--ink";
    const label = tier ? tier[0].toUpperCase() + tier.slice(1) : "Base";
    return `<span class="tier-chip ${o === t ? "done" : ""}" role="listitem"
      style="--chip: var(${cssVar})" aria-label="${label}: ${o} of ${t} caught">
      <span class="dot"></span>${label} ${o}/${t}</span>`;
  });
  $("tierChips").innerHTML = chips.join("");
}

function renderGrid() {
  const results = applyQuery(query, slots, owned);
  const grid = $("grid");

  if (!results.length) {
    grid.innerHTML = `<div class="empty">Nothing matches those filters.</div>`;
    return;
  }

  grid.innerHTML = results.map((slot) => {
    const isOwned = owned.has(slot.id);
    const tint = slot.tier ? TIER_VARS[slot.tier] ?? "--unknown" : RARITY_VARS[slot.rarity];
    const ribbon = slot.rarity === "unknown" ? "?" : slot.rarity.toUpperCase();
    return `<button class="tile ${isOwned ? "owned" : ""}" data-id="${slot.id}"
      style="--tint: var(${tint}); --rtint: var(${RARITY_VARS[slot.rarity]})"
      aria-pressed="${isOwned}"
      aria-label="${slot.name}, ${isOwned ? "caught" : "not caught"}">
      <span class="art"><img src="assets/sprites/${slot.id}.png" alt="" loading="lazy"
        onerror="this.style.visibility='hidden'"></span>
      <span class="ribbon">${ribbon}</span>
      <span class="ring" aria-hidden="true"></span>
      <span class="name">${slot.name}</span>
    </button>`;
  }).join("");
}

function renderMeta() {
  const shown = applyQuery(query, slots, owned).length;
  $("resultCount").textContent = `${shown} of ${slots.length}`;
  $("clearFilters").hidden = !isFiltering(query);
}

// --- Filter chips ----------------------------------------------------------

function buildFilterChips() {
  const rarities = RARITIES.map((r) =>
    `<button class="chip" data-rarity="${r}" style="--chip: var(${RARITY_VARS[r]})"
       aria-pressed="false">${r === "unknown" ? "Unconfirmed" : cap(r)}</button>`);
  const tiers = ["standard", ...availableTiers(slots)].map((t) =>
    `<button class="chip" data-tier="${t}"
       style="--chip: var(${t === "standard" ? "--unknown" : TIER_VARS[t] ?? "--unknown"})"
       aria-pressed="false">${t === "standard" ? "Base" : cap(t)}</button>`);
  $("chipRow").innerHTML =
    rarities.join("") + `<span class="chip-divider"></span>` + tiers.join("");
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// --- Events ----------------------------------------------------------------

function wireEvents() {
  $("grid").addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const result = toggle(owned, tile.dataset.id);
    owned = result.owned;
    $("storageWarning").hidden = result.persisted;
    if (navigator.vibrate) navigator.vibrate(8);
    render();
  });

  $("search").addEventListener("input", (e) => {
    query.search = e.target.value;
    render();
  });

  document.querySelectorAll(".segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      query.ownership = btn.dataset.ownership;
      document.querySelectorAll(".segmented button").forEach((b) => {
        b.classList.toggle("on", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      render();
    });
  });

  $("chipRow").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const list = chip.dataset.rarity ? query.rarities : query.tiers;
    const value = chip.dataset.rarity ?? chip.dataset.tier;
    const at = list.indexOf(value);
    at >= 0 ? list.splice(at, 1) : list.push(value);
    chip.classList.toggle("on", at < 0);
    chip.setAttribute("aria-pressed", String(at < 0));
    render();
  });

  $("sort").addEventListener("change", (e) => {
    query.sort = e.target.value;
    render();
  });

  $("clearFilters").addEventListener("click", () => {
    query = { ...defaultQuery(), sort: query.sort };
    $("search").value = "";
    document.querySelectorAll(".chip.on").forEach((c) => {
      c.classList.remove("on");
      c.setAttribute("aria-pressed", "false");
    });
    document.querySelectorAll(".segmented button").forEach((b) =>
      b.classList.toggle("on", b.dataset.ownership === "all"));
    render();
  });

  // Menu sheet
  $("menuBtn").addEventListener("click", () => $("menu").showModal());
  $("closeMenu").addEventListener("click", () => $("menu").close());

  $("exportBtn").addEventListener("click", async () => {
    const code = exportCode(owned, slots);
    $("exportOut").textContent = code;
    try { await navigator.clipboard.writeText(code); } catch { /* shown on screen anyway */ }
  });

  $("importBtn").addEventListener("click", () => {
    const imported = importCode($("importIn").value, slots);
    if (!imported) {
      $("importMsg").textContent = "That doesn't look like a Spritedex code.";
      return;
    }
    owned = imported;
    $("storageWarning").hidden = saveOwned(owned);
    $("importMsg").textContent = `Imported ${owned.size} catches.`;
    render();
  });

  $("resetBtn").addEventListener("click", () => {
    if (!confirm("Delete every catch on this device? This can't be undone.")) return;
    owned = clearAll();
    render();
  });
}

/// Visiting spritedex…/#c=SDX1.xxxx imports that code — the share-a-link path.
function importFromUrlHash() {
  const match = location.hash.match(/c=([^&]+)/);
  if (!match) return;
  const imported = importCode(decodeURIComponent(match[1]), slots);
  if (imported && imported.size > 0 &&
      confirm(`Import ${imported.size} catches from this link? Your current dex will be replaced.`)) {
    owned = imported;
    saveOwned(owned);
  }
  history.replaceState(null, "", location.pathname);
}

boot();
