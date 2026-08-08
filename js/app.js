// DOM wiring only — all logic lives in engine.js / store.js where node can test it.

import {
  applyQuery, availableTiers, defaultQuery, groupResults, isFiltering, milestone,
  tierProgress,
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

let data = { tiers: [], sprites: [], slots: [] };
let slots = [];
let owned = loadOwned();
let query = defaultQuery();

async function boot() {
  const res = await fetch("data/slots.json");
  data = await res.json();
  slots = data.slots;

  buildFilterChips();
  buildTierLegend();
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
  renderGroups();
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

function tile(slot, isOwned) {
  const tint = slot.tier ? TIER_VARS[slot.tier] ?? "--unknown" : RARITY_VARS[slot.rarity];
  const label = slot.tier ? cap(slot.tier) : "Base";
  return `<div class="vt-col">
    <button class="vt ${isOwned ? "owned" : ""}" data-id="${slot.id}"
      style="--tint: var(${tint})" aria-pressed="${isOwned}"
      aria-label="${slot.name}, ${isOwned ? "caught" : "not caught"}">
      <span class="vt-in"><img src="assets/sprites/${slot.id}.png" alt="" loading="lazy"
        onerror="this.style.visibility='hidden'"></span>
    </button>
    <span class="vt-label" aria-hidden="true">${label}</span>
  </div>`;
}

function renderGroups() {
  const groups = groupResults(query, data, owned);
  const container = $("groups");

  if (!groups.length) {
    container.innerHTML = `<div class="empty">Nothing matches those filters.</div>`;
    return;
  }

  container.innerHTML = groups.map((group) => {
    const total = group.slots.length;
    const have = group.slots.filter((s) => owned.has(s.id)).length;
    const full = have === total;
    const ribbon = group.rarity === "unknown" ? "?" : group.rarity.toUpperCase();
    return `<article class="srow ${full ? "full" : ""}"
      style="--rtint: var(${RARITY_VARS[group.rarity]})">
      <header class="srow-head">
        <img class="srow-hero" src="assets/sprites/${group.id}.png" alt="" loading="lazy"
          onerror="this.style.visibility='hidden'">
        <div class="srow-title">
          <span class="srow-name">${group.name}</span>
          ${group.power ? `<span class="srow-power">${group.power}</span>` : ""}
        </div>
        <span class="srow-rarity">${ribbon}</span>
        <span class="srow-count">${have}/${total}</span>
        <button class="srow-all" data-group="${group.id}"
          aria-label="${full ? "Uncatch all" : "Catch all"} ${group.name}">
          ${full ? "✓ All" : "All"}
        </button>
      </header>
      <div class="vt-row">${group.slots.map((s) => tile(s, owned.has(s.id))).join("")}</div>
    </article>`;
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

function buildTierLegend() {
  $("tierLegend").innerHTML = data.tiers
    .filter((t) => t.id !== "special")
    .map((t) => `<div class="legend-row">
      <span class="legend-dot" style="background:${t.color}"></span>
      <b>${t.name}</b><span>${t.effect}</span></div>`)
    .join("");
}

// --- Events ----------------------------------------------------------------

function wireEvents() {
  $("groups").addEventListener("click", (e) => {
    const all = e.target.closest(".srow-all");
    if (all) {
      // Catch every slot in the sprite; a second tap on a full row releases them.
      const group = data.sprites.find((g) => g.id === all.dataset.group);
      const next = new Set(owned);
      const full = group.slots.every((id) => next.has(id));
      group.slots.forEach((id) => (full ? next.delete(id) : next.add(id)));
      owned = next;
      $("storageWarning").hidden = saveOwned(owned);
      if (navigator.vibrate) navigator.vibrate(12);
      render();
      return;
    }
    const tileBtn = e.target.closest(".vt");
    if (!tileBtn) return;
    const result = toggle(owned, tileBtn.dataset.id);
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
