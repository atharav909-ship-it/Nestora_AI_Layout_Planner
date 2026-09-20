import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const clock = new THREE.Clock();
const state = {
  theme: 'modern_cozy',
  door: 'bottom_left',
  budget: 8500,
  roomLengthFt: 10,
  roomWidthFt: 8,
  plan: null,
  activeDesignIndex: 0,
  activeBundle: [],
  selectedId: null,
  currentView: '2d',
  catalog: [],
  catalogFilter: 'All',
  tile: 'travertine',
  assetStatus: {},
  marbleDesign: 'calacatta',
  tileColor: '#e7dfd2',
  imageAnalysis: {},
  designIntelligence: {users:'2',storage_priority:'medium',bath_preference:'shower',accessibility:'standard',plumbing_flexibility:'limited',circulation_priority:'high'},
};

let scene;
let camera;
let renderer;
let controls;
let threeResizeObserver;
let walkthroughAnimationFrame;

const walkState = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  keys: { forward: false, backward: false, left: false, right: false },
  speed: 2.2,
  eyeHeight: 1.65,
  yaw: 0,
  pitch: 0
};

const modelCache = new Map();
const marbleTextureCache = new Map();
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

const TILES = [
  ['travertine', 'Warm Travertine', 'Natural stone · matte', '#b59b7d', '#d8c9b5', '#756553', 0.34],
  ['terrazzo', 'Cream Terrazzo', 'Soft chips · satin', '#d8d0c4', '#eee8df', '#8d8377', 0.28],
  ['sage', 'Sage Zellige', 'Handmade · glazed', '#78877a', '#b8c0b5', '#596258', 0.20],
  ['slate', 'Charcoal Slate', 'Dark stone · matte', '#41413f', '#575653', '#252523', 0.40],
  ['terracotta', 'Terracotta', 'Earthy clay · matte', '#a86149', '#d0a38e', '#69453a', 0.30],
  ['marble', 'Custom Marble', 'Choose vein design + color', '#e7dfd2', '#f2eee7', '#a59a8d', 0.42],
];
const TILE_PROFILES = Object.fromEntries(TILES.map(([id,name,desc,floor,wall,grout,size]) => [id,{id,name,desc,floor,wall,grout,size}]));

const MARBLE_DESIGNS = [
  ['calacatta', 'Calacatta', 'Bold flowing veins', '#a99c8e'],
  ['statuario', 'Statuario', 'Fine cool veining', '#8f8981'],
  ['arabescato', 'Arabescato', 'Expressive branching veins', '#81786e'],
  ['emperador', 'Emperador', 'Warm dramatic stone', '#59463a'],
];
const MARBLE_COLORS = [
  ['#e7dfd2', 'Ivory'], ['#d8d0c5', 'Sand'], ['#c7d0c8', 'Sage'],
  ['#d6c2c0', 'Rose'], ['#aeb3b8', 'Smoke'], ['#6d6965', 'Charcoal'],
];
const MARBLE_PROFILES = {
  calacatta: {wave: 1.8, detail: 0.8, contrast: 0.9},
  statuario: {wave: 2.8, detail: 1.4, contrast: 0.65},
  arabescato: {wave: 1.15, detail: 2.2, contrast: 0.82},
  emperador: {wave: 1.5, detail: 1.15, contrast: 1.0},
};

function hexToRgb(hex) {
  const h = (hex || '#e7dfd2').replace('#','');
  return {r:parseInt(h.slice(0,2),16)||231, g:parseInt(h.slice(2,4),16)||223, b:parseInt(h.slice(4,6),16)||210};
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function mixHex(a,b,t) {
  const A=hexToRgb(a), B=hexToRgb(b);
  return rgbToHex(A.r+(B.r-A.r)*t,A.g+(B.g-A.g)*t,A.b+(B.b-A.b)*t);
}
function marblePalette() {
  const base = state.tileColor || '#e7dfd2';
  const design = MARBLE_DESIGNS.find(x=>x[0]===state.marbleDesign) || MARBLE_DESIGNS[0];
  return {base, light:mixHex(base,'#ffffff',0.24), shadow:mixHex(base,'#000000',0.22), vein:mixHex(design[3],base,0.18), grout:mixHex(base,'#000000',0.28)};
}
function tileSurfaceColors() {
  if (state.tile === 'marble') { const p=marblePalette(); return {floor:p.base, wall:p.light, grout:p.grout}; }
  const p=TILE_PROFILES[state.tile] || TILE_PROFILES.travertine;
  return {floor:p.floor, wall:p.wall, grout:p.grout};
}

function marbleSeedFor(design) {
  const seeds = { calacatta: 104729, statuario: 1299709, arabescato: 2147483647, emperador: 433494437 };
  return seeds[design] || 982451653;
}

const THEME_PROFILES = {
  modern_cozy:{light:'#ffd5ae',ambient:'#fff0dc',intensity:1.25,wood:'#634028',metal:'#c69b59'},
  scandinavian:{light:'#fff4dc',ambient:'#eef5ff',intensity:1.45,wood:'#cfb591',metal:'#9fa4a6'},
  boho:{light:'#ffd1a0',ambient:'#f4e6d4',intensity:1.18,wood:'#8c6847',metal:'#b58e4f'},
  classic:{light:'#fff3df',ambient:'#f6f6f2',intensity:1.5,wood:'#3b3835',metal:'#d0d4d9'},
  mediterranean:{light:'#ffc28e',ambient:'#f8ead8',intensity:1.2,wood:'#7d4b31',metal:'#ab783e'},
  minimalist:{light:'#f4f0e8',ambient:'#edf0f1',intensity:1.5,wood:'#232220',metal:'#262626'},
  rustic:{light:'#f0b77e',ambient:'#e9d6c1',intensity:1.1,wood:'#4d3322',metal:'#4a3c31'},
  luxury_spa:{light:'#ffd0a4',ambient:'#eadaca',intensity:1.12,wood:'#2c1e17',metal:'#cbb082'}
};
const THEMES = [
  ['modern_cozy', 'Modern Cozy', 'Warm timber & soft glow', 'walnut'],
  ['scandinavian', 'Scandinavian', 'Light wood & clean lines', 'birch'],
  ['boho', 'Boho Organic', 'Earthy texture & greenery', 'earth'],
  ['classic', 'Classic Luxury', 'Stone & timeless symmetry', 'marble'],
  ['mediterranean', 'Mediterranean', 'Terracotta & natural texture', 'terracotta'],
  ['minimalist', 'Minimalist', 'Quiet surfaces & open space', 'chalk'],
  ['rustic', 'Rustic Lodge', 'Smoked timber & stone', 'smoked'],
  ['luxury_spa', 'Luxury Spa', 'Dark wood & refined metal', 'spa'],
];

const THEME_PALETTES = {
  modern_cozy:    { floor: '#70533f', wall: '#efe5d8', wood: '#634028', metal: '#c69b59' },
  scandinavian:  { floor: '#b5a695', wall: '#f4f1ea', wood: '#cfb591', metal: '#9fa4a6' },
  boho:           { floor: '#85644d', wall: '#eee5d8', wood: '#8c6847', metal: '#b58e4f' },
  classic:        { floor: '#d8d5ce', wall: '#f5f5f5', wood: '#3b3835', metal: '#d0d4d9' },
  mediterranean: { floor: '#9c543e', wall: '#f8eee2', wood: '#7d4b31', metal: '#ab783e' },
  minimalist:     { floor: '#8c8c88', wall: '#eae9e6', wood: '#232220', metal: '#262626' },
  rustic:         { floor: '#4a3b32', wall: '#dfd7cc', wood: '#4d3322', metal: '#4a3c31' },
  luxury_spa:     { floor: '#2a221d', wall: '#dcd3c8', wood: '#2c1e17', metal: '#cbb082' },
};

function themeFloor(t) { return tileSurfaceColors().floor || (THEME_PALETTES[t] || THEME_PALETTES.modern_cozy).floor; }
function themeWall(t)  { return tileSurfaceColors().wall || (THEME_PALETTES[t] || THEME_PALETTES.modern_cozy).wall; }
function themeWood(t)  { return (THEME_PALETTES[t] || THEME_PALETTES.modern_cozy).wood; }
function themeMetal(t) { return (THEME_PALETTES[t] || THEME_PALETTES.modern_cozy).metal; }

const ICONS = {
  'Vanity & Basin': '▱',
  'Smart Toilet': '◒',
  'Shower & Tub': '⌁',
  'Lavatory Faucet': '∩',
  'Toiletries & Accessories': '◇',
  'Towel Warmer': '▥',
  'Vanity Mirror / Medicine Cabinet': '◉',
  'Freestanding Tub': '◒',
};

const $ = (id) => document.getElementById(id);
const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function toast(message, type = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function themeInfo(id = state.theme) {
  return THEMES.find(t => t[0] === id) || THEMES[0];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function renderThemeCards() {
  $('themeGrid').innerHTML = THEMES.map(([id, name, desc, material]) => `
    <button class="theme-card ${id === state.theme ? 'selected' : ''}" data-theme="${id}" type="button">
      <div class="theme-visual material-${material}"><div class="theme-room"></div></div>
      <div class="theme-label"><strong>${name}</strong><span>${desc}</span></div>
    </button>
  `).join('');
  document.querySelectorAll('.theme-card').forEach(card => card.addEventListener('click', () => {
    state.theme = card.dataset.theme;
    renderThemeCards();
    $('headerTheme').textContent = themeInfo()[1];
  }));
}

function renderTileCards() {
  const grid = $('tileGrid');
  if (!grid) return;
  grid.innerHTML = TILES.map(([id,name,desc,floor,wall]) => {
    const swatch = id === 'marble' ? marblePalette() : {floor,wall};
    return `<button type="button" class="tile-card ${id === state.tile ? 'selected' : ''}" data-tile="${id}">
      <span class="tile-swatch ${id === 'marble' ? 'marble-swatch' : ''}" style="--tile-floor:${swatch.floor};--tile-wall:${swatch.wall}"></span>
      <span><strong>${name}</strong><small>${desc}</small></span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.tile-card').forEach(card => card.addEventListener('click', () => applyTile(card.dataset.tile)));
  renderMarbleControls();
}

function renderMarbleControls() {
  const panel = $('marbleControls');
  if (!panel) return;
  panel.classList.toggle('hidden', state.tile !== 'marble');
  if (state.tile !== 'marble') return;
  panel.innerHTML = `
    <div class="marble-control-title">Marble design</div>
    <div class="marble-design-grid">${MARBLE_DESIGNS.map(([id,name,desc,vein]) => `
      <button type="button" class="marble-design-card ${id===state.marbleDesign?'selected':''}" data-marble-design="${id}">
        <span class="marble-mini" style="--marble-base:${state.tileColor};--marble-vein:${vein}"></span>
        <span><strong>${name}</strong><small>${desc}</small></span>
      </button>`).join('')}</div>
    <div class="marble-control-title color-title">Marble color</div>
    <div class="marble-color-row">
      ${MARBLE_COLORS.map(([hex,name]) => `<button type="button" class="marble-color" title="${name}" aria-label="${name}" data-marble-color="${hex}" style="--swatch:${hex}"><span></span></button>`).join('')}
      <label class="custom-marble-color" title="Custom marble color"><input id="marbleColorPicker" type="color" value="${state.tileColor}"><span>Custom</span></label>
    </div>
    <div class="marble-current">${MARBLE_DESIGNS.find(x=>x[0]===state.marbleDesign)?.[1] || 'Calacatta'} · ${state.tileColor.toUpperCase()}</div>`;
  panel.querySelectorAll('[data-marble-design]').forEach(btn => btn.addEventListener('click', () => {
    state.marbleDesign = btn.dataset.marbleDesign;
    renderMarbleControls(); renderTileCards(); refreshTilePreview();
  }));
  panel.querySelectorAll('[data-marble-color]').forEach(btn => btn.addEventListener('click', () => applyMarbleColor(btn.dataset.marbleColor)));
  $('marbleColorPicker')?.addEventListener('input', e => applyMarbleColor(e.target.value));
}

function applyMarbleColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  state.tileColor = color;
  if (state.plan) state.plan.tileColor = color;
  renderMarbleControls(); renderTileCards(); refreshTilePreview();
}

function refreshTilePreview() {
  updateStats();
  render2D();
  schedule3DRender();
}

function applyTile(tileId) {
  if (!TILE_PROFILES[tileId]) return;
  state.tile = tileId;
  if (state.plan) state.plan.tile = tileId;
  renderTileCards();
  const select = $('studioTileSelect');
  if (select) select.value = tileId;
  refreshTilePreview();
}

function updateAIBriefPreview() {
  const el=$('aiBriefPreviewText'); if(!el) return;
  const users=$('diUsers')?.value||state.designIntelligence.users;
  const storage=$('diStorage')?.value||state.designIntelligence.storage_priority;
  const bath={shower:'walk-in shower',tub:'bathtub',both:'shower + tub'}[$('diBath')?.value]||'walk-in shower';
  const access={standard:'standard access',step_free:'step-free access',enhanced:'enhanced clearances'}[$('diAccessibility')?.value]||'standard access';
  const plumbing=$('diPlumbing')?.value==='flexible'?'plumbing can move':'keep plumbing close';
  const circulation=$('diCirculation')?.value==='high'?'prioritize open circulation':'balanced circulation';
  el.textContent=`${users} user(s) · ${storage} storage · ${bath} · ${access} · ${plumbing} · ${circulation}.`;
}

function setupInputs() {
  $('budget').addEventListener('input', e => {
    state.budget = Number(e.target.value);
    $('budgetValue').textContent = formatUSD(state.budget);
  });
  $('roomLength').addEventListener('input', e => state.roomLengthFt = Number(e.target.value) || 10);
  $('roomWidth').addEventListener('input', e => state.roomWidthFt = Number(e.target.value) || 8);
  document.querySelectorAll('[data-door]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-door]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.door = btn.dataset.door;
  }));

  ['diUsers','diStorage','diBath','diAccessibility','diPlumbing','diCirculation'].forEach(id => $(id)?.addEventListener('change', updateAIBriefPreview));
  updateAIBriefPreview();

  $('roomPhoto').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('uploadText').textContent = 'Analyzing room photo…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/analyze-image', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Vision request failed');
      const data = await res.json();
      state.imageAnalysis = data;
      if (!data.analysis_available) {
        $('uploadText').textContent = data.error || 'Image analysis unavailable — enter dimensions manually.';
        toast('Vision analysis is not configured or failed. Manual dimensions were left unchanged.', 'error');
        return;
      }
      if (data.dimensions_reliable) {
        $('roomLength').value = data.length_ft;
        $('roomWidth').value = data.width_ft;
        state.roomLengthFt = Number(data.length_ft);
        state.roomWidthFt = Number(data.width_ft);
      }
      if (THEMES.some(t => t[0] === data.suggested_theme)) state.theme = data.suggested_theme;
      if (data.door_position) {
        state.door = data.door_position;
        document.querySelectorAll('[data-door]').forEach(b => b.classList.toggle('selected', b.dataset.door === state.door));
      }
      renderThemeCards();
      $('headerTheme').textContent = themeInfo()[1];
      const pct = Math.round(Number(data.confidence || 0) * 100);
      const dimensionNote = data.dimensions_reliable ? `${data.length_ft} × ${data.width_ft} ft applied` : 'dimensions need manual confirmation';
      $('uploadText').textContent = `Vision ${pct}% · ${dimensionNote} · ${data.notes || ''}`;
      toast(data.dimensions_reliable ? 'Room analysis applied.' : 'Image understood; confirm room dimensions manually.', 'success');
    } catch (err) {
      $('uploadText').textContent = 'Analysis unavailable — manual dimensions still work.';
      toast('Room analysis could not be completed.', 'error');
    }
  });
}

async function generatePlan() {
  state.roomLengthFt = Number($('roomLength').value) || 10;
  state.roomWidthFt = Number($('roomWidth').value) || 8;
  state.budget = Number($('budget').value) || 8500;
  state.designIntelligence = {
    users: $('diUsers').value, storage_priority: $('diStorage').value,
    bath_preference: $('diBath').value, accessibility: $('diAccessibility').value,
    plumbing_flexibility: $('diPlumbing').value, circulation_priority: $('diCirculation').value
  };
  setLoading(true);
  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        roomLengthFt: state.roomLengthFt,
        roomWidthFt: state.roomWidthFt,
        budget: state.budget,
        theme: state.theme,
        tile: state.tile,
        marbleDesign: state.marbleDesign,
        tileColor: state.tileColor,
        doorPosition: state.door,
        designIntelligence: state.designIntelligence,
        imageAnalysis: state.imageAnalysis
      })
    });
    if (!res.ok) throw new Error(await res.text());
    state.plan = await res.json();
    state.tile = state.plan.tile || state.tile;
    state.marbleDesign = state.plan.marbleDesign || state.marbleDesign;
    state.tileColor = state.plan.tileColor || state.tileColor;
    renderTileCards();
    state.activeDesignIndex = 0;
    state.activeBundle = state.plan.bundle.map(x => ({...x}));
    state.selectedId = null;
    enterStudio();
  } catch (err) {
    console.error(err);
    toast('The planner could not generate a layout.', 'error');
  } finally {
    setLoading(false);
  }
}

let loadingTimer=null;
function setLoading(show) {
  const overlay=$('loadingOverlay'); overlay.classList.toggle('hidden', !show);
  clearInterval(loadingTimer);
  if(show){ const steps=['Understanding your design brief…','Generating spatial candidates…','Checking clearances and collisions…','Matching products to budget and fit…','Preparing AI design review…']; let i=0; const label=overlay.querySelector('span'); if(label) label.textContent=steps[0]; loadingTimer=setInterval(()=>{i=Math.min(i+1,steps.length-1);if(label)label.textContent=steps[i];},650); }
}

function enterStudio() {
  $('setupView').classList.add('hidden');
  $('studioView').classList.remove('hidden');
  $('headerSaveBtn').classList.remove('hidden');
  $('studioTitle').textContent = state.plan.themeTitle;
  $('studioNote').textContent = state.plan.themeNote;
  $('headerTheme').textContent = state.plan.themeTitle;
  updateStats();
  const studioTile = $('studioTileSelect');
  if (studioTile) studioTile.value = state.tile;
  renderLayoutChoices();
  renderFixtureList();
  selectDesign(0);
  if (state.currentView === '3d') switchView('3d'); else switchView('2d');
}

function updateStats() {
  $('roomStat').textContent = `${state.plan.roomLInches / 12} × ${state.plan.roomWInches / 12} ft`;
  $('budgetStat').textContent = formatUSD(state.plan.budget);
  $('costStat').textContent = formatUSD(state.activeBundle.reduce((s, i) => s + Number(i.price || 0), 0));
  if ($('tileStat')) $('tileStat').textContent = TILE_PROFILES[state.tile]?.name || state.tile;
  if ($('assistantContext')) $('assistantContext').textContent = `${themeInfo(state.plan.theme)[1]} · ${TILE_PROFILES[state.tile]?.name || 'Tile finish'}`;
}

function renderLayoutChoices() {
  const choices = $('layoutChoices');
  choices.innerHTML = (state.plan.designs || []).map((d, i) => `
    <button type="button" class="layout-choice ${i === state.activeDesignIndex ? 'active' : ''}" data-index="${i}">
      <strong>${escapeHtml(d.name)}</strong>
      <span>Spatial score ${d.score} · ${escapeHtml((d.strategy||'').replaceAll('_',' '))}</span>
    </button>
  `).join('');
  choices.querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectDesign(Number(b.dataset.index))));
}

function hasFloorCollision(a, others) {
  const pad = 2;
  return others.some(b => {
    return !(
      a.x + a.w + pad <= b.x ||
      b.x + b.w + pad <= a.x ||
      a.y + a.h + pad <= b.y ||
      b.y + b.h + pad <= a.y
    );
  });
}

function sanitizeAndResolveCollisions(layout) {
  // The backend is the single source of truth for placement. Older builds rewrote
  // valid server layouts here (including forcing storage toward the doorway), which
  // defeated the constraint solver. Only normalize bounds/rotation on the client.
  if (!layout || !state.plan) return layout;
  const roomL = state.plan.roomLInches, roomW = state.plan.roomWInches;
  for (const entry of layout) {
    entry.rotation = ((Number(entry.rotation) || 0) % 360 + 360) % 360;
    // x/y/w/h are always the AXIS-ALIGNED occupied footprint. Rebuild them from
    // catalog dimensions so a 90/270 degree fixture can never be drawn or dragged
    // beyond the room because of stale pre-rotation dimensions.
    const baseW = Number(entry.item?.widthInches) || Number(entry.w) || 24;
    const baseD = Number(entry.item?.depthInches) || Number(entry.h) || 24;
    const quarterTurn = Math.abs(entry.rotation % 180) === 90;
    entry.w = quarterTurn ? baseD : baseW;
    entry.h = quarterTurn ? baseW : baseD;
    entry.x = clamp(Number(entry.x) || 0, 1.5, Math.max(1.5, roomL - entry.w - 1.5));
    entry.y = clamp(Number(entry.y) || 0, 1.5, Math.max(1.5, roomW - entry.h - 1.5));
  }
  return layout;
}

function selectDesign(index) {
  const design = state.plan.designs[index];
  if (!design) return;
  state.activeDesignIndex = index;
  state.plan.layout = sanitizeAndResolveCollisions(structuredClone(design.layout));
  state.selectedId = null;
  renderLayoutChoices();
  renderFixtureList();
  render2D();
  renderInspector();
  schedule3DRender();
  requestSuggestions();
}

function renderFixtureList() {
  $('fixtureList').innerHTML = state.activeBundle.map(item => {
    const entry = state.plan.layout.find(x => x.item.id === item.id);
    return `<button type="button" class="fixture-row ${entry?.id === state.selectedId ? 'active' : ''}" data-id="${escapeHtml(entry?.id || '')}">
      <div class="fixture-icon">${ICONS[item.category] || '◇'}</div>
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)}</span></div><span>›</span>
    </button>`;
  }).join('');
  $('fixtureList').querySelectorAll('.fixture-row').forEach(row => row.addEventListener('click', () => {
    if (row.dataset.id) selectFixture(row.dataset.id);
  }));
  const strip=$('fixtureStrip');
  if (strip) {
    strip.innerHTML = state.activeBundle.filter(item => state.plan.layout.some(e=>e.item.id===item.id)).map(item => {
      const entry=state.plan.layout.find(e=>e.item.id===item.id);
      return `<button class="fixture-strip-card ${entry?.id===state.selectedId?'active':''}" data-id="${escapeHtml(entry?.id||'')}"><span class="strip-icon">${ICONS[item.category]||'◇'}</span><span><strong>${escapeHtml(shortCategory(item.category))}</strong><small>${formatUSD(item.price)}</small></span></button>`;
    }).join('') + `<button class="fixture-strip-card add" id="stripAdd">＋<span><strong>Add fixture</strong><small>Catalog</small></span></button>`;
    strip.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>selectFixture(b.dataset.id)));
    strip.querySelector('#stripAdd')?.addEventListener('click',()=> $('addFixtureBtn').click());
  }
}

function selectFixture(id) {
  state.selectedId = id;
  render2D();
  renderFixtureList();
  renderInspector();
  schedule3DRender();
}

function selectedEntry() {
  return state.plan?.layout?.find(x => x.id === state.selectedId) || null;
}


function fixturePlacementReason(entry){
  if(!entry||!state.plan) return '';
  const others=state.plan.layout.filter(x=>x.id!==entry.id && !['Lavatory Faucet','Toiletries & Accessories','Towel Warmer','Vanity Mirror / Medicine Cabinet'].includes(x.item.category));
  let nearest=null;
  for(const o of others){ const dx=Math.max(o.x-(entry.x+entry.w),entry.x-(o.x+o.w),0),dy=Math.max(o.y-(entry.y+entry.h),entry.y-(o.y+o.h),0),g=Math.hypot(dx,dy); if(nearest===null||g<nearest.g) nearest={g,o}; }
  const parts=[`Placed at ${entry.x.toFixed(1)}", ${entry.y.toFixed(1)}" with a ${entry.w.toFixed(1)}" × ${entry.h.toFixed(1)}" footprint.`];
  if(nearest) parts.push(`Nearest core fixture: ${escapeHtml(nearest.o.areaLabel)} at about ${nearest.g.toFixed(1)}".`);
  if(Number(entry.item.clearanceFrontInches||0)>0) parts.push(`Product requests ${Number(entry.item.clearanceFrontInches).toFixed(0)}" front clearance.`);
  parts.push('Its position is rechecked against room bounds, the entrance keep-clear zone and fixture collisions.');
  return parts.join(' ');
}

function renderInspector() {
  const entry = selectedEntry();
  if (!entry) {
    $('inspectorTitle').textContent = 'Select a fixture';
    $('inspectorContent').innerHTML = 'Click a fixture to see dimensions, finish and placement details.';
    $('validBadge').className = 'status-badge neutral';
    $('validBadge').textContent = '—';
    $('selectedName').textContent = 'Nothing selected';
    $('selectedMeta').textContent = 'Choose a fixture on the plan';
    return;
  }
  const item = entry.item;
  $('inspectorTitle').textContent = item.name;
  $('selectedName').textContent = item.name;
  $('selectedMeta').textContent = `${item.widthInches}" × ${item.depthInches}" · ${item.finish}`;
  $('inspectorContent').innerHTML = `
    <div class="detail-block"><div class="detail-title">Product</div>
      <div class="detail-row"><span>Category</span><strong>${escapeHtml(item.category)}</strong></div>
      <div class="detail-row"><span>Finish</span><strong>${escapeHtml(item.finish)}</strong></div>
      <div class="detail-row"><span>Price</span><strong>${formatUSD(item.price)}</strong></div>
      <div class="detail-row"><span>Mounting</span><strong>${escapeHtml(item.mountingType || 'floor')}</strong></div>
      <div class="detail-row"><span>Elevation</span><strong>${Number(item.elevationInches || 0).toFixed(0)}" AFF</strong></div>
    </div>
    <div class="detail-block"><div class="detail-title">3D model</div><div class="model-status ${state.assetStatus[entry.id]?.ok?'ok':'pending'}">${state.assetStatus[entry.id]?.ok?'✓ '+escapeHtml(state.assetStatus[entry.id].format)+' model loaded':state.assetStatus[entry.id]?.error?'⚠ Procedural fallback':'○ Load pending'}</div><div class="detail-title model-path-title">Model path (.glb / .obj)</div>
      <div class="detail-row">
        <input id="modelUrlInput" type="text" placeholder="/static/models/... (glb or obj)" value="${escapeHtml(item.modelUrl || '')}" style="width:100%; background:#251c16; color:#d8b28d; border:1px solid #5b4636; padding:6px; border-radius:4px; font-size:12px;">
      </div>
    </div>
    <div class="detail-block"><div class="detail-title">Placement</div>
      <div class="position-grid">
        <label>X<input id="posX" type="number" step="0.5" value="${entry.x.toFixed(1)}"></label>
        <label>Y<input id="posY" type="number" step="0.5" value="${entry.y.toFixed(1)}"></label>
        <label>ROT<input id="posR" type="number" step="90" value="${entry.rotation || 0}"></label>
      </div>
      <div class="detail-row"><span>Footprint</span><strong>${entry.w.toFixed(1)}" × ${entry.h.toFixed(1)}"</strong></div>
      <div class="detail-row"><span>Front clearance</span><strong>${item.clearanceFrontInches || 0}"</strong></div>
    </div>
    <div class="detail-block"><div class="detail-title">Why Nestora placed it here</div><div class="assistant-text">${fixturePlacementReason(entry)}</div></div>
    <div class="detail-block"><div class="detail-title">Description</div><div class="assistant-text">${escapeHtml(item.description || 'Catalog item')}</div></div>
  `;
  ['posX','posY','posR'].forEach(id => $(id).addEventListener('change', () => {
    const x = Number($('posX').value), y = Number($('posY').value), r = Number($('posR').value) || 0;
    updateEntryPosition(entry, x, y, r);
  }));
  $('modelUrlInput')?.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    entry.item.modelUrl = val;
    const bundleItem = state.activeBundle.find(x => x.id === entry.item.id);
    if (bundleItem) bundleItem.modelUrl = val;
    schedule3DRender();
  });
  validateCurrentLayout().then(result => setValidity(result));
}

function setValidity(result) {
  const badge = $('validBadge');
  if (!result) return;
  badge.className = `status-badge ${result.valid ? 'good' : 'bad'}`;
  badge.textContent = result.valid ? 'Valid placement' : 'Needs attention';
}

function updateEntryPosition(entry, x, y, rotation = entry.rotation || 0) {
  const rotated = Math.abs(rotation % 180) === 90;
  const w = rotated ? Number(entry.item.depthInches) : Number(entry.item.widthInches);
  const h = rotated ? Number(entry.item.widthInches) : Number(entry.item.depthInches);
  entry.rotation = ((rotation % 360) + 360) % 360;
  entry.w = w; entry.h = h;
  entry.x = clamp(x, 0, state.plan.roomLInches - w);
  entry.y = clamp(y, 0, state.plan.roomWInches - h);
  render2D(); renderInspector();
  schedule3DRender();
  renderFixtureList();
}

async function validateCurrentLayout() {
  if (!state.plan) return null;
  try {
    const res = await fetch('/api/layout/validate', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      roomLengthInches: state.plan.roomLInches,
      roomWidthInches: state.plan.roomWInches,
      doorPosition: state.plan.doorPosition,
      layout: state.plan.layout
    })});
    return await res.json();
  } catch { return null; }
}

function drawSvg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
  return el;
}

function render2D() {
  const svg = $('planSvg');
  if (!state.plan) return;
  const W = 860, H = 620, pad = 70;
  const roomL = state.plan.roomLInches, roomW = state.plan.roomWInches;
  const scale = Math.min((W - pad*2) / roomL, (H - pad*2) / roomW);
  const ox = (W - roomL*scale)/2, oy = (H - roomW*scale)/2;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  const defs = drawSvg('defs');
  const grid = drawSvg('pattern', {id:'grid', width:'18', height:'18', patternUnits:'userSpaceOnUse'});
  grid.appendChild(drawSvg('path', {d:'M 18 0 L 0 0 0 18', fill:'none', stroke:'#5b4636', 'stroke-width':'.5', opacity:'.35'}));
  defs.appendChild(grid);
  const hatch = drawSvg('pattern', {id:'hatch', width:'8', height:'8', patternUnits:'userSpaceOnUse', patternTransform:'rotate(25)'});
  hatch.appendChild(drawSvg('line', {x1:'0',y1:'0',x2:'0',y2:'8',stroke:'#9b6547','stroke-width':'2',opacity:'.35'}));
  defs.appendChild(hatch); svg.appendChild(defs);
  svg.appendChild(drawSvg('rect',{x:0,y:0,width:W,height:H,fill:'url(#grid)',opacity:'.8'}));

  const roomX=ox, roomY=oy, rw=roomL*scale, rh=roomW*scale;
  svg.appendChild(drawSvg('rect',{x:roomX,y:roomY,width:rw,height:rh,rx:5,fill:'#211913',stroke:'#b18a68','stroke-width':'5'}));
  svg.appendChild(drawSvg('rect',{x:roomX+7,y:roomY+7,width:rw-14,height:rh-14,rx:2,fill:'none',stroke:'#4b382b','stroke-width':'1'}));

  svg.appendChild(drawSvg('line',{x1:roomX,y1:roomY-28,x2:roomX+rw,y2:roomY-28,stroke:'#8d715b','stroke-width':'1'}));
  const t1=drawSvg('text',{x:roomX+rw/2,y:roomY-34,fill:'#b89a7e','font-size':'12','text-anchor':'middle','font-family':'monospace'}); t1.textContent=`${(roomL/12).toFixed(1)} ft`; svg.appendChild(t1);
  svg.appendChild(drawSvg('line',{x1:roomX-28,y1:roomY,x2:roomX-28,y2:roomY+rh,stroke:'#8d715b','stroke-width':'1'}));
  const t2=drawSvg('text',{x:roomX-38,y:roomY+rh/2,fill:'#b89a7e','font-size':'12','text-anchor':'middle','font-family':'monospace',transform:`rotate(-90 ${roomX-38} ${roomY+rh/2})`}); t2.textContent=`${(roomW/12).toFixed(1)} ft`; svg.appendChild(t2);

  const doorWidth = Math.min(34, roomL*0.25)*scale;
  const doorX = state.plan.doorPosition === 'bottom_right' ? roomX+rw-doorWidth : roomX;
  const doorY = roomY+rh;
  svg.appendChild(drawSvg('rect',{x:doorX,y:doorY-5,width:doorWidth,height:10,fill:'#211913',stroke:'none'}));
  const swing = state.plan.doorPosition === 'bottom_right'
    ? `M ${doorX} ${doorY} A ${doorWidth} ${doorWidth} 0 0 1 ${doorX+doorWidth} ${doorY-doorWidth}`
    : `M ${doorX+doorWidth} ${doorY} A ${doorWidth} ${doorWidth} 0 0 0 ${doorX} ${doorY-doorWidth}`;
  svg.appendChild(drawSvg('path',{d:swing,fill:'none',stroke:'#927157','stroke-width':'1.5','stroke-dasharray':'5 4'}));
  svg.appendChild(drawSvg('line',{x1:doorX,y1:doorY,x2:state.plan.doorPosition==='bottom_right'?doorX+doorWidth:doorX+doorWidth,y2:doorY-doorWidth,stroke:'#d09b6b','stroke-width':'2'}));
  // Hard entry keep-clear zone used by the planner (42 × 50 in).
  const keepW=Math.min(42,roomL)*scale, keepD=Math.min(50,roomW)*scale;
  const keepX=state.plan.doorPosition==='bottom_right'?roomX+rw-keepW:roomX;
  svg.appendChild(drawSvg('rect',{x:keepX,y:roomY+rh-keepD,width:keepW,height:keepD,fill:'rgba(188,70,52,.08)',stroke:'#b94e3b','stroke-width':'1.5','stroke-dasharray':'7 5'}));
  const keepLabel=drawSvg('text',{x:keepX+keepW/2,y:roomY+rh-keepD+16,fill:'#d77b68','font-size':'9','text-anchor':'middle','font-family':'DM Sans, sans-serif','font-weight':'700'}); keepLabel.textContent='ENTRY CLEARANCE'; svg.appendChild(keepLabel);

  (state.plan.layout || []).forEach(entry => {
    const x=roomX+entry.x*scale, y=roomY+entry.y*scale, w=entry.w*scale, h=entry.h*scale;
    const selected=entry.id===state.selectedId;
    if (entry.clearance && selected) {
      const c=entry.clearance;
      svg.appendChild(drawSvg('rect',{x:roomX+c.x*scale,y:roomY+c.y*scale,width:c.w*scale,height:c.h*scale,fill:'url(#hatch)',stroke:'#8b5b45','stroke-width':'1','stroke-dasharray':'4 3',opacity:'.8'}));
    }
    // The occupied footprint is already post-rotation (entry.w/entry.h), so the
    // footprint itself must NOT be rotated a second time. Only the fixture symbol
    // gets the semantic orientation. This keeps every visible fixture inside the
    // same bounds the spatial engine validated.
    const g=drawSvg('g',{class:'svg-fixture','data-id':entry.id,transform:`translate(${x+w/2} ${y+h/2})`});
    g.style.cursor='grab';
    const fixturePalette = {
      'Vanity & Basin':['#8f6548','#f0c39c'], 'Smart Toilet':['#667f88','#c6e2e7'],
      'Shower & Tub':['#557a73','#b8ddd3'], 'Freestanding Tub':['#6e718e','#d4d2ef'],
      'Toiletries & Accessories':['#7c6a50','#dfc89e'], 'Towel Warmer':['#7a6060','#dfb8b8']
    };
    const [fixtureFill, fixtureStroke] = fixturePalette[entry.item.category] || ['#806a58','#d6b99d'];
    g.appendChild(drawSvg('rect',{x:-w/2,y:-h/2,width:w,height:h,rx:Math.min(8,w*.08),fill:selected?'rgba(233,173,109,.30)':fixtureFill,stroke:selected?'#ffd09a':fixtureStroke,opacity:selected?'1':'0.78','stroke-width':selected?'2.5':'1.2'}));

    // Draw the fixture using its native catalog footprint, then rotate only that
    // symbol. Toilet artwork has a 180° intrinsic-forward correction so its tank
    // stays against the wall and the bowl faces into the room.
    const nativeW=(Number(entry.item?.widthInches)||Number(entry.w)||24)*scale;
    const nativeH=(Number(entry.item?.depthInches)||Number(entry.h)||24)*scale;
    const visualOffset=entry.item.category==='Smart Toilet' ? 180 : 0;
    const symbol=drawSvg('g',{transform:`rotate(${(Number(entry.rotation)||0)+visualOffset})`});
    drawFixtureSymbol(symbol, entry.item.category, nativeW, nativeH);
    const arrow=drawSvg('path',{d:`M 0 ${-Math.min(nativeH*.28,18)} L -5 ${-Math.min(nativeH*.28,18)+7} M 0 ${-Math.min(nativeH*.28,18)} L 5 ${-Math.min(nativeH*.28,18)+7}`,fill:'none',stroke:'#fff2df','stroke-width':'1.5','stroke-linecap':'round'}); symbol.appendChild(arrow);
    g.appendChild(symbol);

    // Annotations never rotate with the fixture.
    const badge=drawSvg('circle',{cx:-w/2+10,cy:-h/2+10,r:9,fill:'#17110d',stroke:fixtureStroke,'stroke-width':'1.5'}); g.appendChild(badge);
    const badgeText=drawSvg('text',{x:-w/2+10,y:-h/2+13,fill:'#fff3e6','font-size':'9','text-anchor':'middle','font-family':'DM Sans, sans-serif','font-weight':'800'}); badgeText.textContent=String((state.plan.layout||[]).indexOf(entry)+1); g.appendChild(badgeText);
    const labelY=h/2+15;
    const label=drawSvg('text',{x:0,y:labelY,fill:'#fff0df',stroke:'#211913','stroke-width':'4','paint-order':'stroke','font-size':'10','text-anchor':'middle','font-family':'DM Sans, sans-serif','font-weight':'800'}); label.textContent=shortCategory(entry.item.category); g.appendChild(label);
    g.addEventListener('pointerdown', e => startDrag(e, entry));
    g.addEventListener('click', e => { e.stopPropagation(); selectFixture(entry.id); });
    svg.appendChild(g);
  });
  svg.onclick = () => { state.selectedId=null; render2D(); renderInspector(); renderFixtureList(); };
}

function shortCategory(category) {
  return ({'Vanity & Basin':'VANITY','Smart Toilet':'TOILET','Shower & Tub':'SHOWER','Lavatory Faucet':'FAUCET','Toiletries & Accessories':'STORAGE'})[category] || 'FIXTURE';
}

function drawFixtureSymbol(g, category, w, h) {
  const stroke='#d8b28d';
  if (category==='Vanity & Basin') {
    g.appendChild(drawSvg('rect',{x:-w*.32,y:-h*.25,width:w*.64,height:h*.5,rx:3,fill:'rgba(220,190,160,.12)',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('ellipse',{cx:0,cy:-h*.02,rx:Math.min(w*.18,h*.18),ry:Math.min(w*.12,h*.12),fill:'rgba(255,255,255,.12)',stroke:stroke,'stroke-width':'1'}));
  } else if (category==='Smart Toilet') {
    g.appendChild(drawSvg('ellipse',{cx:0,cy:-h*.05,rx:Math.min(w*.28,h*.32),ry:Math.min(w*.32,h*.36),fill:'rgba(240,225,210,.12)',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('rect',{x:-w*.22,y:-h*.46,width:w*.44,height:h*.18,rx:2,fill:'rgba(240,225,210,.08)',stroke:stroke,'stroke-width':'1'}));
  } else if (category==='Shower & Tub') {
    g.appendChild(drawSvg('rect',{x:-w*.38,y:-h*.38,width:w*.76,height:h*.76,rx:Math.min(12,w*.08),fill:'rgba(210,185,160,.08)',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('circle',{cx:0,cy:0,r:Math.min(w,h)*.08,fill:'none',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('line',{x1:-w*.38,y1:-h*.38,x2:w*.38,y2:-h*.38,stroke:'#9d7458','stroke-width':'2'}));
  } else if (category==='Lavatory Faucet') {
    g.appendChild(drawSvg('circle',{cx:0,cy:0,r:Math.min(w,h)*.2,fill:'none',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('path',{d:`M ${-w*.18} ${h*.15} Q 0 ${-h*.3} ${w*.18} ${h*.15}`,fill:'none',stroke:stroke,'stroke-width':'2'}));
  } else {
    g.appendChild(drawSvg('rect',{x:-w*.3,y:-h*.25,width:w*.6,height:h*.5,rx:2,fill:'rgba(210,185,160,.08)',stroke:stroke,'stroke-width':'1'}));
    g.appendChild(drawSvg('line',{x1:-w*.18,y1:0,x2:w*.18,y2:0,stroke:stroke,'stroke-width':'1'}));
  }
}

function startDrag(event, entry) {
  event.stopPropagation();
  selectFixture(entry.id);
  const svg = $('planSvg');
  const start = {x:event.clientX, y:event.clientY, x0:entry.x, y0:entry.y};
  const move = e => {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const dx = ((e.clientX-start.x)/rect.width)*vb.width;
    const dy = ((e.clientY-start.y)/rect.height)*vb.height;
    const scale = Math.min((860-140)/state.plan.roomLInches, (620-140)/state.plan.roomWInches);
    updateEntryPosition(entry, start.x0 + dx/scale, start.y0 + dy/scale, entry.rotation||0);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    validateCurrentLayout().then(setValidity);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('#viewToggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  // Reference UI keeps plan + walkthrough visible together. Buttons select interaction focus.
  $('planPane').classList.remove('hidden');
  $('threePane').classList.remove('hidden');
  $('planPane').classList.toggle('focus-pane', view === '2d');
  $('threePane').classList.toggle('focus-pane', view === '3d');
  $('viewHelp').textContent = view === '2d' ? 'Drag fixtures to reposition · click to inspect' : 'Click inside 3D · WASD to move · mouse to look around';
  requestAnimationFrame(() => { init3D(); resizeThree(); render3D(); });
}

function resetView() {
  if (state.currentView === '2d') {
    render2D();
    return;
  }
  if (!camera || !state.plan) return;
  placeWalkthroughCamera();
}

function init3D() {
  const container = $('threeContainer');
  if (!container) return;
  if (!renderer) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#211914');
    camera = new THREE.PerspectiveCamera(72, 1, 0.05, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    controls = new PointerLockControls(camera, renderer.domElement);
    setupWalkthroughControls(container);

    threeResizeObserver = new ResizeObserver(() => resizeThree());
    threeResizeObserver.observe(container);

    animate3D();
  }
  resizeThree();
}

function setupWalkthroughControls(container) {
  const canvas = renderer.domElement;
  canvas.addEventListener('click', () => {
    if (controls && !controls.isLocked) {
      controls.lock();
    }
  });

  controls.addEventListener('lock', () => {
    const overlay = document.querySelector('.three-overlay');
    if (overlay) overlay.classList.add('hidden');
  });

  controls.addEventListener('unlock', () => {
    const overlay = document.querySelector('.three-overlay');
    if (overlay) overlay.classList.remove('hidden');
  });

  window.addEventListener('keydown', event => {
    if (event.code === 'KeyW' || event.code === 'ArrowUp') walkState.keys.forward = true;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') walkState.keys.backward = true;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') walkState.keys.left = true;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') walkState.keys.right = true;
  });

  window.addEventListener('keyup', event => {
    if (event.code === 'KeyW' || event.code === 'ArrowUp') walkState.keys.forward = false;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') walkState.keys.backward = false;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') walkState.keys.left = false;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') walkState.keys.right = false;
  });
}

function resizeThree() {
  if (!renderer || !camera) return;
  const container = $('threeContainer');
  if (!container) return;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 550;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate3D() {
  walkthroughAnimationFrame = requestAnimationFrame(animate3D);
  updateWalkthrough();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function updateWalkthrough() {
  if (!controls || !controls.isLocked || !state.plan) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  const acceleration = 9;

  walkState.direction.set(0, 0, 0);
  if (walkState.keys.forward) walkState.direction.z -= 1;
  if (walkState.keys.backward) walkState.direction.z += 1;
  if (walkState.keys.left) walkState.direction.x -= 1;
  if (walkState.keys.right) walkState.direction.x += 1;

  if (walkState.direction.lengthSq() > 0) {
    walkState.direction.normalize();
    walkState.velocity.x = THREE.MathUtils.damp(walkState.velocity.x, walkState.direction.x * walkState.speed, acceleration, delta);
    walkState.velocity.z = THREE.MathUtils.damp(walkState.velocity.z, walkState.direction.z * walkState.speed, acceleration, delta);
  } else {
    walkState.velocity.x = THREE.MathUtils.damp(walkState.velocity.x, 0, acceleration, delta);
    walkState.velocity.z = THREE.MathUtils.damp(walkState.velocity.z, 0, acceleration, delta);
  }

  const oldPosition = camera.position.clone();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, camera.up).normalize();

  const movement = new THREE.Vector3();
  movement.addScaledVector(forward, -walkState.velocity.z * delta);
  movement.addScaledVector(right, walkState.velocity.x * delta);

  const proposed = oldPosition.clone();
  proposed.add(movement);
  proposed.y = walkState.eyeHeight;

  if (isWalkPositionValid(proposed)) {
    camera.position.copy(proposed);
  }
}

function isWalkPositionValid(position) {
  if (!state.plan) return true;
  const roomWidth = state.plan.roomLInches / 39.37;
  const roomDepth = state.plan.roomWInches / 39.37;
  const margin = 0.32;
  const minX = -roomWidth / 2 + margin;
  const maxX = roomWidth / 2 - margin;
  const minZ = -roomDepth / 2 + margin;
  const maxZ = roomDepth / 2 - margin;

  if (position.x < minX || position.x > maxX || position.z < minZ || position.z > maxZ) {
    return false;
  }

  if (state.plan.layout) {
    for (const entry of state.plan.layout) {
      const cx = (entry.x + entry.w / 2 - state.plan.roomLInches / 2) / 39.37;
      const cz = (entry.y + entry.h / 2 - state.plan.roomWInches / 2) / 39.37;
      const halfW = entry.w / 39.37 / 2;
      const halfD = entry.h / 39.37 / 2;
      const padding = 0.28;

      if (
        position.x > cx - halfW - padding &&
        position.x < cx + halfW + padding &&
        position.z > cz - halfD - padding &&
        position.z < cz + halfD + padding
      ) {
        return false;
      }
    }
  }
  return true;
}

function clearScene() {
  if (!scene) return;
  while (scene.children.length) {
    const object = scene.children[0];
    object.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    scene.remove(object);
  }
}

function mat(color, roughness = 0.6, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(radius, height, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let render3DToken = 0;
let render3DQueued = false;
function schedule3DRender() {
  // The reference UI keeps 2D and 3D visible simultaneously, so every plan edit
  // must be reflected in the walkthrough even while the 2D pane has focus.
  if (render3DQueued || !state.plan) return;
  render3DQueued = true;
  requestAnimationFrame(() => {
    render3DQueued = false;
    render3D();
  });
}

function modelUrlForItem(item, type) {
  if (item?.modelUrl) return item.modelUrl;
  if (item?.attributes?.modelUrl) return item.attributes.modelUrl;
  const map = {
    vanity: '/static/models/Vanity/vanity.obj',
    toilet: '/static/models/Toilet/Toilet_2.obj',
    shower: '/static/models/Shower/Shower.obj',
    bathtub: '/static/models/Bathtub/Bathtub.obj',
    faucet: '/static/models/Faucet/faucet.obj',
    accessory: '/static/models/Cabinets/Cabinet.obj',
    towel_warmer: '/static/models/Towel_Rack/Towel_Rack.obj'
  };
  return map[type] || null;
}

async function render3D() {
  if (!state.plan) return;
  init3D();
  const token = ++render3DToken;
  clearScene();

  const L = state.plan.roomLInches / 39.37;
  const D = state.plan.roomWInches / 39.37;
  const profile = THEME_PROFILES[state.theme] || THEME_PROFILES.modern_cozy;
  const tile = TILE_PROFILES[state.tile] || TILE_PROFILES.travertine;
  const floorMat = makeTileMaterial('floor', L, D, tile);
  const wallMat = makeTileMaterial('wall', L, D, tile);
  const woodMat = mat(profile.wood, 0.48, 0);
  const metalMat = mat(profile.metal, 0.2, 0.75);
  const ceramicMat = mat('#eee9e1', 0.2, 0.02);

  const floor = box(L, 0.08, D, floorMat);
  floor.position.y = -0.04;
  scene.add(floor);
  addFloorTiles(L, D, tile);

  const wallHeight = 2.9;
  const wallThickness = 0.10;
  addBackWallWithWindow(L, D, wallHeight, wallThickness, wallMat, profile);
  const leftWall = box(wallThickness, wallHeight, D, wallMat);
  leftWall.position.set(-L / 2, wallHeight / 2, 0);
  scene.add(leftWall);
  const rightWall = box(wallThickness, wallHeight, D, wallMat);
  rightWall.position.set(L / 2, wallHeight / 2, 0);
  scene.add(rightWall);
  addPerimeterBaseboards(L, D, themeWood(state.theme));

  const doorWidth = 0.90;
  const doorX = state.plan.doorPosition === 'bottom_right' ? (L / 2 - doorWidth / 2 - 0.12) : (-L / 2 + doorWidth / 2 + 0.12);
  const leftSegmentWidth = Math.max(0.05, doorX + L / 2 - doorWidth / 2);
  const rightSegmentWidth = Math.max(0.05, L / 2 - (doorX + doorWidth / 2));
  if (leftSegmentWidth > 0.06) {
    const seg = box(leftSegmentWidth, wallHeight, wallThickness, wallMat);
    seg.position.set(-L/2 + leftSegmentWidth/2, wallHeight/2, D/2); scene.add(seg);
  }
  if (rightSegmentWidth > 0.06) {
    const seg = box(rightSegmentWidth, wallHeight, wallThickness, wallMat);
    seg.position.set(L/2 - rightSegmentWidth/2, wallHeight/2, D/2); scene.add(seg);
  }
  const frameMat = mat(themeWood(state.theme), 0.4, 0);
  const frameLeft = box(0.06, 2.1, 0.08, frameMat); frameLeft.position.set(doorX-doorWidth/2,1.05,D/2); scene.add(frameLeft);
  const frameRight = box(0.06, 2.1, 0.08, frameMat); frameRight.position.set(doorX+doorWidth/2,1.05,D/2); scene.add(frameRight);

  if (state.tile === 'marble') addMarbleWallCladding(L, D, wallHeight, wallThickness, doorX, doorWidth);

  const ceilingTrim = box(L, 0.035, D, mat(tile.wall || '#f2eee7', 0.95, 0));
  ceilingTrim.position.y = wallHeight;
  scene.add(ceilingTrim);

  const ambient = new THREE.AmbientLight(profile.ambient, 0.75);
  scene.add(ambient);

  const ceilingLight = new THREE.SpotLight(profile.light, 13.5, 8.5, Math.PI / 4.2, 0.65, 2.0);
  ceilingLight.position.set(0, 2.72, 0.15);
  ceilingLight.target.position.set(0, 0, -0.35);
  ceilingLight.castShadow = true;
  ceilingLight.shadow.mapSize.set(1024, 1024);
  ceilingLight.shadow.bias = -0.00015;
  scene.add(ceilingLight);
  scene.add(ceilingLight.target);

  const vanityGlow = new THREE.PointLight(profile.light, 2.4, 3.2, 2);
  vanityGlow.position.set(0, 1.65, -D / 2 + 0.42);
  scene.add(vanityGlow);

  const loadJobs = state.plan.layout.map(entry => add3DFixture(entry, L, D, woodMat, metalMat, ceramicMat));
  
  placeWalkthroughCamera();
  resizeThree();

  const overlay = $('loadingOverlay');
  if (overlay) { overlay.classList.remove('hidden'); overlay.querySelector('span').textContent = 'Loading your 3D fixtures…'; }
  const results = await Promise.allSettled(loadJobs);
  if (token !== render3DToken) return;
  const failed = results.filter(r => r.status === 'rejected').length;
  if (overlay) {
    overlay.querySelector('span').textContent = failed ? `${failed} model${failed > 1 ? 's' : ''} unavailable · using studio fallback` : '3D room ready';
    setTimeout(() => overlay.classList.add('hidden'), failed ? 1800 : 450);
  }
}

function placeWalkthroughCamera() {
  if (!camera || !state.plan) return;
  const L = state.plan.roomLInches / 39.37;
  const D = state.plan.roomWInches / 39.37;
  const doorX = state.plan.doorPosition === 'bottom_right' ? (L / 2 - 0.42) : (-L / 2 + 0.42);
  camera.position.set(doorX, walkState.eyeHeight, Math.max(0.25, D / 2 - 0.32));
  camera.lookAt(0, 1.45, -D * 0.18);
  walkState.velocity.set(0, 0, 0);
  if (controls) {
    controls.getObject().position.copy(camera.position);
  }
}

function addFloorTiles(L, D, tile) {
  const surfaces = tileSurfaceColors();
  if (state.tile !== 'marble') {
    const groutMaterial = mat(surfaces.grout, 0.92, 0);
    const tileSize = tile.size || 0.42;
    for (let x = -L / 2; x < L / 2; x += tileSize) {
      const grout = box(0.012, 0.006, D, groutMaterial); grout.position.set(x,0.002,0); scene.add(grout);
    }
    for (let z = -D / 2; z < D / 2; z += tileSize) {
      const grout = box(L,0.006,0.012,groutMaterial); grout.position.set(0,0.003,z); scene.add(grout);
    }
    return;
  }

  const tileW = 0.61;
  const tileD = 0.61;
  const gap = 0.008;
  const marbleMat = makeTileMaterial('floor', tileW, tileD, tile);
  for (let x = -L/2; x < L/2 - 0.001; x += tileW) {
    for (let z = -D/2; z < D/2 - 0.001; z += tileD) {
      const w = Math.min(tileW, L/2 - x) - gap;
      const d = Math.min(tileD, D/2 - z) - gap;
      if (w <= 0 || d <= 0) continue;
      const slab = box(w, 0.035, d, marbleMat.clone());
      slab.position.set(x + w/2 + gap/2, 0.012, z + d/2 + gap/2);
      slab.receiveShadow = true;
      slab.castShadow = false;
      scene.add(slab);
    }
  }
}

function makeMarbleTexture(kind, design, baseHex) {
  const key = `${kind}:${design}:${baseHex}`;
  if (marbleTextureCache.has(key)) return marbleTextureCache.get(key);

  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const base = hexToRgb(baseHex);
  const profile = MARBLE_PROFILES[design] || MARBLE_PROFILES.calacatta;
  const seed = marbleSeedFor(design);

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const hash = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const smoothNoise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n00 = hash(x0, y0), n10 = hash(x0 + 1, y0), n01 = hash(x0, y0 + 1), n11 = hash(x0 + 1, y0 + 1);
    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;
    return a + (b - a) * sy;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n1 = smoothNoise(u * 8, v * 8);
      const n2 = smoothNoise(u * 24 + 13, v * 24 + 7);
      const n3 = smoothNoise(u * 70 + 31, v * 70 + 19);
      const mineral = (n1 * 0.56 + n2 * 0.30 + n3 * 0.14) - 0.5;
      const warmVariation = Math.sin((u * 7.2 + v * 4.8 + seed) * Math.PI) * 0.035;
      const brightness = 1 + mineral * 0.20 + warmVariation;
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, base.r * brightness));
      data[i + 1] = Math.max(0, Math.min(255, base.g * brightness));
      data[i + 2] = Math.max(0, Math.min(255, base.b * brightness));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const vein = hexToRgb(MARBLE_DESIGNS.find(x => x[0] === design)?.[3] || '#8f8981');
  const secondary = mixHex(design === 'emperador' ? '#d8c1a4' : '#ffffff', baseHex, 0.52);
  const secondaryRgb = hexToRgb(secondary);
  const passes = design === 'statuario' ? 8 : design === 'arabescato' ? 6 : 5;

  for (let k = 0; k < passes; k++) {
    const phase = (seed + k * 29) % 97;
    const startY = 60 + (phase / 97) * (size - 120);
    ctx.beginPath();
    ctx.moveTo(-80, startY);
    let px = -80, py = startY;
    for (let step = 0; step <= 30; step++) {
      px = -80 + step * 32;
      const drift = Math.sin(step * (0.38 + profile.wave * 0.05) + phase) * (34 + profile.detail * 18);
      const broad = Math.sin(step * 0.12 + phase * 0.17) * 26;
      py = startY + drift + broad + step * (k - passes / 2) * 1.8;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(45,38,33,0.10)';
    ctx.lineWidth = 12 + profile.detail * 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(35,30,27,0.16)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-80, startY);
    for (let step = 0; step <= 30; step++) {
      px = -80 + step * 32;
      const drift = Math.sin(step * (0.38 + profile.wave * 0.05) + phase) * (34 + profile.detail * 18);
      const broad = Math.sin(step * 0.12 + phase * 0.17) * 26;
      py = startY + drift + broad + step * (k - passes / 2) * 1.8;
      ctx.lineTo(px, py);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${vein.r},${vein.g},${vein.b},${0.30 + profile.contrast * 0.12})`;
    ctx.lineWidth = 2.2 + profile.detail * 1.1;
    ctx.stroke();

    if (k % 2 === 0) {
      for (let branch = 0; branch < 2; branch++) {
        const bx = 220 + ((phase * 11 + branch * 190) % 360);
        const by = startY + Math.sin(bx * 0.02 + phase) * 24;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + 55, by - 42, bx + 110, by - 12 + branch * 24);
        ctx.quadraticCurveTo(bx + 155, by + 18, bx + 205, by - 22);
        ctx.strokeStyle = `rgba(${secondaryRgb.r},${secondaryRgb.g},${secondaryRgb.b},0.52)`;
        ctx.lineWidth = 1.05;
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  for (let i = 0; i < 180; i++) {
    const x = hash(i + 17, seed) * size;
    const y = hash(i + 73, seed + 91) * size;
    const r = 0.35 + hash(i + 113, seed + 23) * 0.9;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  const colorTexture = new THREE.CanvasTexture(canvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.wrapS = THREE.RepeatWrapping;
  colorTexture.wrapT = THREE.RepeatWrapping;
  colorTexture.needsUpdate = true;
  colorTexture.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() || 8;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size; bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d');
  bctx.drawImage(canvas, 0, 0);
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.needsUpdate = true;
  bump.anisotropy = colorTexture.anisotropy;

  const result = {colorTexture, bump};
  marbleTextureCache.set(key, result);
  return result;
}

function makeTileMaterial(surface, L, D, tile) {
  if (state.tile !== 'marble') {
    const colors = tileSurfaceColors();
    return mat(surface === 'floor' ? colors.floor : colors.wall, 0.62, 0);
  }

  const palette = marblePalette();
  const textures = makeMarbleTexture(surface, state.marbleDesign, palette.base);
  const material = new THREE.MeshPhysicalMaterial({
    map: textures.colorTexture,
    bumpMap: textures.bump,
    bumpScale: 0.012,
    color: '#ffffff',
    roughness: surface === 'floor' ? 0.20 : 0.15,
    metalness: 0.0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.12
  });
  textures.colorTexture.repeat.set(surface === 'floor' ? Math.max(1, L / 1.35) : 2.0,
                                   surface === 'floor' ? Math.max(1, D / 1.35) : 1.25);
  textures.bump.repeat.copy(textures.colorTexture.repeat);
  material.needsUpdate = true;
  return material;
}


function inwardFacingRotation(entry, type) {
  // Rotation is now decided by the constraint planner and shared by 2D + 3D.
  // The renderer only applies asset-specific calibration in loadModelFixture().
  return ((Number(entry.rotation) || 0) % 360 + 360) % 360;
}

async function add3DFixture(entry, L, D, woodMat, metalMat, ceramicMat) {
  const item = entry.item || {};
  const type = item.attributes?.footprintType || categoryToType(item.category);
  
  // Every selected feature is represented in 3D. Attached fixtures (faucet, mirror,
  // towel warmer and wall storage) use their own elevation instead of being hidden.

  const group = new THREE.Group();
  const x = (entry.x + entry.w / 2 - state.plan.roomLInches / 2) / 39.37;
  const z = (entry.y + entry.h / 2 - state.plan.roomWInches / 2) / 39.37;
  const mounting = item.mountingType || item.mounting_type || (item.attributes?.mount || '').toLowerCase();
  const elevationInches = Number(item.elevationInches ?? item.elevation_inches ?? 0);
  
  group.position.set(x, mounting === 'wall_hung' ? elevationInches / 39.37 : 0, z);
  const layoutRotation = inwardFacingRotation(entry, type);
  group.rotation.y = THREE.MathUtils.degToRad(layoutRotation);
  group.userData.entryId = entry.id;
  scene.add(group);

  // entry.w/entry.h are the already-rotated axis-aligned footprint. The 3D model
  // must be fitted to its native catalog dimensions and then yawed exactly once;
  // fitting to entry.w/entry.h and yawing again swaps the footprint a second time.
  const width = (Number(item.widthInches) || Number(entry.w) || 24) / 39.37;
  const depth = (Number(item.depthInches) || Number(entry.h) || 24) / 39.37;
  const url = modelUrlForItem(item, type);

  // Rotation offsets: ensures models face into the room rather than backwards into walls
  const baseRotationOffsets = {
    // OBJ files have independent local forward axes. These offsets calibrate the bundled assets
    // once; layout rotation remains shared between the 2D and 3D views.
    toilet: 0,
    vanity: 0,
    shower: 0,
    bathtub: 0,
    faucet: 0,
    accessory: 0,
    towel_warmer: 0,
    vanity_mirror: 0
  };
  const configuredOffset = Number(item.baseRotationOffset);
  const baseOffset = (baseRotationOffsets[type] ?? 0) + (Number.isFinite(configuredOffset) ? configuredOffset : 0);

  if (url) {
    try {
      await loadModelFixture(url, group, width, depth, type, baseOffset);
      group.userData.assetSource = url.toLowerCase().endsWith('.obj') ? 'OBJ' : 'GLB';
      state.assetStatus[entry.id] = {ok:true, format:group.userData.assetSource, url};
      if (state.selectedId===entry.id) renderInspector();
      return;
    } catch (error) {
      console.warn(`3D asset failed for ${item.name || type}:`, error);
      state.assetStatus[entry.id] = {ok:false, error:String(error), url};
    }
  }
  buildProceduralFixture(group, type, width, depth, woodMat, metalMat, ceramicMat);
  group.userData.assetSource = 'procedural';
  if (!state.assetStatus[entry.id]) state.assetStatus[entry.id] = {ok:false, error:'No model URL'};
}

function buildProceduralFixture(group,type,width,depth,woodMat,metalMat,ceramicMat) {
  if (type === 'vanity') buildDetailedVanity(group,width,depth,woodMat,metalMat,ceramicMat);
  else if (type === 'toilet') buildDetailedToilet(group,width,depth,ceramicMat,metalMat);
  else if (type === 'shower') buildDetailedShower(group,width,depth,metalMat,ceramicMat);
  else if (type === 'bathtub') buildDetailedFreestandingTub(group,width,depth,ceramicMat,metalMat);
  else if (type === 'faucet') buildDetailedFaucet(group,width,depth,metalMat);
  else if (type === 'vanity_mirror') buildDetailedMirror(group,width,depth,metalMat);
  else if (type === 'towel_warmer') buildDetailedTowelWarmer(group,width,depth,metalMat);
  else buildDetailedAccessory(group,width,depth,woodMat,metalMat);
}

function buildDetailedFaucet(g, w, d, metal) {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.24,16), metal);
  stem.position.y=0.12; g.add(stem);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,Math.max(0.12,d*.75),16), metal);
  spout.rotation.x=Math.PI/2; spout.position.set(0,0.22,-Math.max(0.05,d*.28)); g.add(spout);
}
function buildDetailedMirror(g, w, d, metal) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.25,w),Math.max(.38,w*.82),Math.max(.025,d)), metal);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.20,w*.9),Math.max(.32,w*.72)), new THREE.MeshStandardMaterial({color:'#b8c3c7',roughness:.12,metalness:.15}));
  glass.position.z=Math.max(.016,d/2+.002); frame.position.y=Math.max(.19,w*.41); glass.position.y=frame.position.y; g.add(frame,glass);
}
function buildDetailedTowelWarmer(g, w, d, metal) {
  const H=Math.max(.65,w*1.5), W=Math.max(.35,w);
  for (const x of [-W/2,W/2]) { const rail=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,H,12),metal); rail.position.set(x,H/2,0); g.add(rail); }
  for (let i=1;i<=7;i++) { const bar=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,W,10),metal); bar.rotation.z=Math.PI/2; bar.position.set(0,H*i/8,0); g.add(bar); }
}

// Asset-aware model loader.  Layout coordinates/orientation come from the shared plan;
// this layer only converts each source model into Nestora's Y-up, metre-based fixture space.
const MODEL_PROFILES = {
  vanity:       { zUp:true, yaw:0,   fit:'floor', maxHeight:1.15 },
  toilet:       { zUp:true, yaw:180, fit:'floor', maxHeight:0.90 },
  shower:       { zUp:true, yaw:0,   fit:'floor', maxHeight:2.15 },
  bathtub:      { zUp:true, yaw:0,   fit:'floor', maxHeight:0.78 },
  faucet:       { zUp:true, yaw:0,   fit:'width', maxHeight:0.42 },
  accessory:    { zUp:true, yaw:0,   fit:'floor', maxHeight:1.35 },
  towel_warmer: { zUp:true, yaw:0,   fit:'wall',  maxHeight:0.85, maxDepth:0.11 },
  vanity_mirror:{ zUp:true, yaw:0,   fit:'wall',  maxHeight:0.95, maxDepth:0.08 }
};

async function loadModelFixture(url, group, targetW, targetD, type, baseRotationOffset = 0) {
  let source = modelCache.get(url);
  const isObj = url.toLowerCase().endsWith('.obj');

  if (!source) {
    if (isObj) {
      try {
        const mtlUrl = url.replace(/\.obj$/i, '.mtl');
        const materials = await mtlLoader.loadAsync(mtlUrl);
        materials.preload();
        objLoader.setMaterials(materials);
      } catch (_) {
        objLoader.setMaterials(null);
      }
      source = await objLoader.loadAsync(url);
    } else {
      const gltf = await gltfLoader.loadAsync(url);
      if (!gltf?.scene) throw new Error(`GLB ${url} contains no scene`);
      source = gltf.scene;
    }
    modelCache.set(url, source);
  }

  const model = isObj ? source.clone(true) : cloneSkeleton(source);
  const profile = MODEL_PROFILES[type] || {zUp:isObj, yaw:0, fit:'floor', maxHeight:1.5};

  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    if (!o.material || (Array.isArray(o.material) && !o.material.length)) {
      const fallbackColor = (type === 'toilet' || type === 'bathtub') ? 0xeee9e1 :
                            (type === 'faucet' || type === 'towel_warmer') ? 0xb7a58d : 0xc7b39a;
      o.material = new THREE.MeshStandardMaterial({color:fallbackColor, roughness:0.42, metalness:(type==='faucet'||type==='towel_warmer')?0.55:0.04});
    }
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(m => { m.side = THREE.DoubleSide; m.needsUpdate = true; });
  });

  // Keep source-axis conversion separate from room yaw.  This prevents a Z-up OBJ
  // correction from changing what "front" means when the 2D fixture is rotated.
  const axisRoot = new THREE.Group();
  axisRoot.add(model);
  if (isObj && profile.zUp) axisRoot.rotation.x = -Math.PI / 2;
  axisRoot.updateMatrixWorld(true);

  let box0 = new THREE.Box3().setFromObject(axisRoot);
  let size0 = box0.getSize(new THREE.Vector3());
  if (size0.x < 1e-6 || size0.y < 1e-6 || size0.z < 1e-6) throw new Error(`Invalid dimensions for ${url}`);

  // Floor fixtures fit their 2D footprint. Wall fixtures fit wall width first and
  // clamp height/depth independently so a 5-inch plan depth cannot turn a towel rack
  // into a giant plank. Scaling remains uniform to avoid squashing the OBJ.
  let scaleRatio;
  if (profile.fit === 'wall') {
    scaleRatio = targetW / size0.x;
    if (profile.maxHeight) scaleRatio = Math.min(scaleRatio, profile.maxHeight / size0.y);
    if (profile.maxDepth)  scaleRatio = Math.min(scaleRatio, profile.maxDepth / size0.z);
  } else if (profile.fit === 'width') {
    scaleRatio = targetW / size0.x;
    if (profile.maxHeight) scaleRatio = Math.min(scaleRatio, profile.maxHeight / size0.y);
  } else {
    scaleRatio = Math.min(targetW / size0.x, targetD / size0.z);
    if (profile.maxHeight) scaleRatio = Math.min(scaleRatio, profile.maxHeight / size0.y);
  }
  if (!Number.isFinite(scaleRatio) || scaleRatio <= 0) throw new Error(`Invalid scale for ${url}`);
  axisRoot.scale.setScalar(scaleRatio);
  axisRoot.updateMatrixWorld(true);

  // Normalize the transformed asset to a bottom-centred pivot.
  const fitted = new THREE.Box3().setFromObject(axisRoot);
  const center = fitted.getCenter(new THREE.Vector3());
  axisRoot.position.set(-center.x, -fitted.min.y, -center.z);

  // Model-local yaw calibration is deliberately isolated in a wrapper. The outer
  // fixture group still carries the exact rotation stored in the shared 2D layout.
  const calibrationRoot = new THREE.Group();
  calibrationRoot.rotation.y = THREE.MathUtils.degToRad((profile.yaw || 0) + baseRotationOffset);
  calibrationRoot.add(axisRoot);

  while (group.children.length) group.remove(group.children[0]);
  group.add(calibrationRoot);
  group.userData.modelProfile = {...profile};
}

function categoryToType(category) {
  return {
    'Vanity & Basin': 'vanity',
    'Smart Toilet': 'toilet',
    'Shower & Tub': 'shower',
    'Lavatory Faucet': 'faucet',
    'Toiletries & Accessories': 'accessory',
    'Towel Warmer': 'towel_warmer',
    'Vanity Mirror / Medicine Cabinet': 'vanity_mirror',
    'Freestanding Tub': 'bathtub'
  }[category] || 'accessory';
}

function buildDetailedFreestandingTub(g, w, d, ceramic, metal) {
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0.08, Math.PI * 0.82),
    ceramic
  );
  outer.scale.set(Math.max(w * 0.5, 0.62), 0.42, Math.max(d * 0.5, 0.34));
  outer.position.y = 0.38;
  g.add(outer);
  const innerMat = new THREE.MeshPhysicalMaterial({color:'#faf6ef', roughness:0.18, metalness:0.02});
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0.15, Math.PI * 0.64), innerMat);
  inner.scale.set(Math.max(w * 0.43, 0.54), 0.32, Math.max(d * 0.43, 0.28));
  inner.position.y = 0.47;
  g.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 10, 64), ceramic);
  rim.scale.set(Math.max(w * 0.5, 0.62), Math.max(d * 0.5, 0.34), 1);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.67;
  g.add(rim);
}

function addMarbleWallCladding(L, D, wallHeight, wallThickness, doorX, doorWidth) {
  const tileW = 0.61;
  const tileH = 1.22;
  const gap = 0.009;
  const marbleMat = makeTileMaterial('wall', L, D, TILE_PROFILES.marble);

  const addFrontBackTile = (x, y, w, h, z, material) => {
    if (w <= gap || h <= gap) return;
    const slab = box(w - gap, h - gap, 0.018, material.clone());
    slab.position.set(x + w/2, y + h/2, z);
    slab.castShadow = false; slab.receiveShadow = true;
    scene.add(slab);
  };
  const addSideTile = (z, y, d, h, x, material) => {
    if (d <= gap || h <= gap) return;
    const slab = box(0.018, h - gap, d - gap, material.clone());
    slab.position.set(x, y + h/2, z + d/2);
    slab.castShadow = false; slab.receiveShadow = true;
    scene.add(slab);
  };

  for (const side of [-1, 1]) {
    for (let z = -D/2; z < D/2 - 0.001; z += tileW) {
      for (let y = 0.08; y < wallHeight - 0.001; y += tileH) {
        const d = Math.min(tileW, D/2 - z);
        const h = Math.min(tileH, wallHeight - y);
        addSideTile(z, y, d, h, side * (L/2 - 0.056), marbleMat);
      }
    }
  }

  const frontSegments = [
    [-L/2, doorX - doorWidth/2],
    [doorX + doorWidth/2, L/2]
  ];
  for (const [x0, x1] of frontSegments) {
    if (x1 <= x0) continue;
    for (let x = x0; x < x1 - 0.001; x += tileW) {
      for (let y = 0.08; y < wallHeight - 0.001; y += tileH) {
        addFrontBackTile(x, y, Math.min(tileW, x1-x), Math.min(tileH, wallHeight-y), D/2 - 0.056, marbleMat);
      }
    }
  }

  const windowW = Math.min(1.65, L * 0.46);
  const windowH = 1.02;
  const sill = 1.05;
  const windowTop = Math.min(wallHeight - 0.38, sill + windowH);
  const backSegments = [
    {x0:-L/2, x1:-windowW/2, y0:0.08, y1:wallHeight},
    {x0: windowW/2, x1:L/2, y0:0.08, y1:wallHeight},
    {x0:-windowW/2, x1:windowW/2, y0:0.08, y1:sill},
    {x0:-windowW/2, x1:windowW/2, y0:windowTop, y1:wallHeight},
  ];
  for (const region of backSegments) {
    for (let x = region.x0; x < region.x1 - 0.001; x += tileW) {
      for (let y = region.y0; y < region.y1 - 0.001; y += tileH) {
        addFrontBackTile(x, y, Math.min(tileW, region.x1-x), Math.min(tileH, region.y1-y), -D/2 + 0.056, marbleMat);
      }
    }
  }
}

function addBackWallWithWindow(L, D, wallHeight, wallThickness, wallMat, profile) {
  const windowW = Math.min(1.65, L * 0.46);
  const windowH = 1.02;
  const sill = 1.05;
  const windowTop = Math.min(wallHeight - 0.38, sill + windowH);
  const z = -D / 2;
  const sideW = Math.max(0.05, (L - windowW) / 2);
  const bottomH = sill;
  const topH = Math.max(0.05, wallHeight - windowTop);

  const left = box(sideW, wallHeight, wallThickness, wallMat);
  left.position.set(-L / 2 + sideW / 2, wallHeight / 2, z); scene.add(left);
  const right = box(sideW, wallHeight, wallThickness, wallMat);
  right.position.set(L / 2 - sideW / 2, wallHeight / 2, z); scene.add(right);
  const bottom = box(windowW, bottomH, wallThickness, wallMat);
  bottom.position.set(0, bottomH / 2, z); scene.add(bottom);
  const top = box(windowW, topH, wallThickness, wallMat);
  top.position.set(0, windowTop + topH / 2, z); scene.add(top);

  const reveal = new THREE.MeshStandardMaterial({color:'#27211d', roughness:0.28, metalness:0.5});
  const revealDepth = 0.12;
  const revealL = box(0.055, windowH + 0.12, revealDepth, reveal);
  revealL.position.set(-windowW / 2, sill + windowH / 2, z + 0.055); scene.add(revealL);
  const revealR = revealL.clone(); revealR.position.x = windowW / 2; scene.add(revealR);
  const revealT = box(windowW + 0.11, 0.055, revealDepth, reveal);
  revealT.position.set(0, windowTop, z + 0.055); scene.add(revealT);
  const revealB = revealT.clone(); revealB.position.y = sill; scene.add(revealB);

  const glassMat = new THREE.MeshStandardMaterial({
    color:'#dce8e6', emissive:'#8ea9a2', emissiveIntensity:0.16,
    roughness:0.34, metalness:0.05, transparent:true, opacity:0.52
  });
  const glass = box(windowW - 0.10, windowH - 0.10, 0.035, glassMat);
  glass.position.set(0, sill + windowH / 2, z + 0.045); scene.add(glass);

  const sun = new THREE.DirectionalLight('#ffe1b7', 2.8);
  sun.position.set(-1.8, 3.5, 2.2);
  sun.target.position.set(0, 0.05, -0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun); scene.add(sun.target);
}

function addPerimeterBaseboards(L, D, woodColor) {
  const baseMat = new THREE.MeshStandardMaterial({color: woodColor, roughness:0.46, metalness:0.04});
  const h = 0.075;
  const depth = 0.045;
  const back = box(L, h, depth, baseMat); back.position.set(0, h / 2, -D / 2 + depth / 2); scene.add(back);
  const front = box(L, h, depth, baseMat); front.position.set(0, h / 2, D / 2 - depth / 2); scene.add(front);
  const left = box(depth, h, D, baseMat); left.position.set(-L / 2 + depth / 2, h / 2, 0); scene.add(left);
  const right = box(depth, h, D, baseMat); right.position.set(L / 2 - depth / 2, h / 2, 0); scene.add(right);
}

function buildDetailedVanity(g, w, d, wood, metal, ceramic) {
  const cabinetHeight = 0.68;
  const cabinet = box(w, cabinetHeight, d, wood);
  cabinet.position.y = cabinetHeight / 2;
  g.add(cabinet);

  const countertop = box(w + 0.035, 0.07, d + 0.035, ceramic);
  countertop.position.y = cabinetHeight + 0.035;
  g.add(countertop);

  const sinkOuter = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w * 0.25, 0.24), Math.min(w * 0.22, 0.20), 0.08, 40), ceramic);
  sinkOuter.scale.z = 0.72;
  sinkOuter.position.set(0, cabinetHeight + 0.09, 0);
  g.add(sinkOuter);

  const mirrorMaterial = new THREE.MeshPhysicalMaterial({color:'#b8c0bc', roughness:0.08, metalness:0.25, transmission:0.15});
  const mirrorW = Math.min(w * 0.75, 0.9);
  const mirrorH = 0.9;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(mirrorW, mirrorH), mirrorMaterial);
  mirror.position.set(0, 1.55, -d / 2 - 0.02);
  g.add(mirror);
}

function buildDetailedToilet(g, w, d, ceramic, metal) {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(Math.min(w * 0.32, 0.22), 0.28, 8, 24),
    ceramic
  );
  body.scale.z = 1.15;
  body.position.y = 0.30;
  g.add(body);

  const tank = box(Math.min(w * 0.68, 0.36), 0.55, 0.18, ceramic);
  tank.position.set(0, 0.72, -d * 0.22);
  g.add(tank);
}

function buildDetailedShower(g, w, d, metal, ceramic) {
  const tray = box(w, 0.07, d, ceramic);
  tray.position.y = 0.035;
  g.add(tray);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#dce8e4',
    transparent: true,
    opacity: 0.23,
    roughness: 0.04,
    metalness: 0.05,
    transmission: 0.55
  });
  const glass = box(0.035, 2.05, d, glassMaterial);
  glass.position.set(w / 2, 1.025, 0);
  g.add(glass);
}

function buildDetailedAccessory(g, w, d, wood, metal) {
  const shelf = box(Math.max(w, 0.35), 0.05, Math.max(d, 0.16), wood);
  shelf.position.y = 1.15;
  g.add(shelf);
}

async function requestSuggestions() {
  if (!state.plan) return;
  const active=state.plan.designs?.[state.activeDesignIndex] || {};
  const box=$('assistantText');
  box.innerHTML='<div class="muted">Analyzing this exact layout…</div>';
  try {
    const res = await fetch('/api/designs/intelligence', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        roomLengthInches:state.plan.roomLInches, roomWidthInches:state.plan.roomWInches,
        doorPosition:state.plan.doorPosition, theme:state.plan.theme, tile:state.tile,
        budget:state.plan.budget, totalCost:state.activeBundle.reduce((sum,x)=>sum+Number(x.price||0),0),
        layoutName:active.name||'Custom layout', strategy:active.strategy||'custom', plannerScore:active.score??null,
        layout:state.plan.layout, bundle:state.activeBundle,
        designIntelligence:state.designIntelligence||state.plan.designIntelligence||{}, imageAnalysis:state.imageAnalysis||{},
        comparisonLayouts:(state.plan.designs||[]).map(d=>({name:d.name,strategy:d.strategy,score:d.score,layout:d.layout}))
      })
    });
    if(!res.ok) throw new Error(await res.text());
    const data=await res.json(); state.currentIntelligence=data;
    if($('aiSourceBadge')) $('aiSourceBadge').textContent=data.aiAvailable?'Gemini + verified spatial facts':'Verified spatial engine · Gemini not connected';
    if($('aiBriefText')) $('aiBriefText').textContent=data.brief||'';
    if($('assistantContext')) $('assistantContext').textContent=`${active.name||'Layout'} · ${data.facts?.floorOccupancyPercent??'—'}% core footprint`;
    const strengths=(data.strengths||[]).map(x=>`<div class="ai-fact good"><b>✓</b><span>${escapeHtml(x)}</span></div>`).join('');
    const warnings=(data.warnings||[]).map(x=>`<div class="ai-fact warn"><b>⚠</b><span>${escapeHtml(x)}</span></div>`).join('');
    const products=(data.productReasoning||[]).slice(0,3).map(x=>`<div class="assistant-tip"><strong>${escapeHtml(x.product)}</strong><span>${escapeHtml(x.reason)}</span></div>`).join('');
    const comparisons=(data.comparison||[]).map(x=>`<div class="ai-compare-row ${x.name===(active.name||'')?'active':''}"><strong>${escapeHtml(x.name)}</strong><span>${x.closestGapInches??'—'}" gap · ${x.floorOccupancyPercent??'—'}% footprint</span></div>`).join('');
    box.innerHTML=`${data.summary?`<div class="assistant-tip"><strong>AI assessment</strong><span>${escapeHtml(data.summary)}</span></div>`:''}<div class="ai-section"><div class="ai-section-title">Validated strengths</div>${strengths||'<div class="muted">No strengths calculated.</div>'}</div>${warnings?`<div class="ai-section"><div class="ai-section-title">Needs attention</div>${warnings}</div>`:''}<div class="ai-section"><div class="ai-section-title">Compare generated concepts</div>${comparisons||'<div class="muted">No comparison data.</div>'}</div><div class="ai-section"><div class="ai-section-title">Measured design trade-off</div><div class="assistant-tip"><span>${escapeHtml(data.tradeoff||'')}</span></div></div><div class="ai-section"><div class="ai-section-title">Why these products</div>${products}</div>${data.nextAction?`<div class="ai-section"><div class="ai-section-title">Nestora suggestion</div><div class="assistant-tip"><span>${escapeHtml(data.nextAction)}</span></div></div>`:''}`;
  } catch(err) {
    console.error(err); box.innerHTML='<div class="ai-fact warn"><b>⚠</b><span>Design intelligence could not be refreshed.</span></div>';
  }
}


async function refineWithAI(){
  const input=$('aiRefineInput'); const instruction=input?.value.trim(); if(!instruction||!state.plan) return;
  const btn=$('aiRefineBtn'); if(btn) btn.disabled=true;
  try{ const res=await fetch('/api/designs/refine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction,designIntelligence:state.designIntelligence})}); if(!res.ok) throw new Error(await res.text()); const data=await res.json(); state.designIntelligence={...state.designIntelligence,...data.designIntelligence};
    const map={diUsers:'users',diStorage:'storage_priority',diBath:'bath_preference',diAccessibility:'accessibility',diPlumbing:'plumbing_flexibility',diCirculation:'circulation_priority'}; Object.entries(map).forEach(([id,k])=>{if($(id)&&state.designIntelligence[k]!=null)$(id).value=state.designIntelligence[k]});
    if(input) input.value=''; toast(data.message||'Design request applied.','success'); await generatePlan();
  }catch(e){console.error(e);toast('Nestora could not apply that refinement.','error');}finally{if(btn)btn.disabled=false;}
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const res = await fetch('/api/catalog');
  state.catalog = await res.json();
  return state.catalog;
}

async function openCatalog(category = null) {
  $('catalogModal').classList.remove('hidden');
  const items = await loadCatalog();
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category)))];
  $('catalogFilters').innerHTML = categories.map(c => `
    <button class="catalog-filter ${state.catalogFilter === (category || state.catalogFilter) && c === (category || state.catalogFilter) ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
  `).join('');
  if (category) state.catalogFilter = category;
  else if (!categories.includes(state.catalogFilter)) state.catalogFilter = 'All';
  $('catalogFilters').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.catalogFilter = b.dataset.cat;
    renderCatalogGrid();
  }));
  renderCatalogGrid();
}

function renderCatalogGrid() {
  const filtered = state.catalogFilter === 'All' ? state.catalog : state.catalog.filter(i => i.category === state.catalogFilter);
  $('catalogGrid').innerHTML = filtered.map(item => `
    <button type="button" class="catalog-card" data-product="${escapeHtml(item.id)}">
      <div class="catalog-art">${ICONS[item.category] || '◇'}</div>
      <strong>${escapeHtml(item.name)}</strong>
      <p>${escapeHtml(item.description)}</p>
      <div class="catalog-price"><span>${formatUSD(item.price)}</span><span>${item.widthInches}" × ${item.depthInches}"</span></div>
      <div class="catalog-meta">${escapeHtml(item.mountingType || 'floor')} · ${Number(item.elevationInches || 0).toFixed(0)}" AFF</div>
    </button>
  `).join('');
  $('catalogGrid').querySelectorAll('[data-product]').forEach(card => card.addEventListener('click', () => applyCatalogItem(card.dataset.product)));
}

function applyCatalogItem(productId) {
  const item = state.catalog.find(x => x.id === productId);
  if (!item) return;
  const existingIndex = state.activeBundle.findIndex(x => x.category === item.category);
  if (existingIndex >= 0) {
    const old = state.activeBundle[existingIndex];
    state.activeBundle[existingIndex] = {...item};
    const entry = state.plan.layout.find(x => x.item.id === old.id);
    if (entry) {
      entry.item = {...item};
      updateEntryPosition(entry, entry.x, entry.y, entry.rotation || 0);
    }
    toast(`${item.category} swapped.`, 'success');
  } else {
    state.activeBundle.push({...item});
    const entry = createEntryForItem(item);
    state.plan.layout.push(entry);
    state.selectedId = entry.id;
    toast(`${item.category} added to the plan.`, 'success');
  }
  $('catalogModal').classList.add('hidden');
  updateStats();
  renderFixtureList();
  render2D();
  renderInspector();
  schedule3DRender();
  validateCurrentLayout().then(setValidity);
}

function createEntryForItem(item) {
  const w = Number(item.widthInches);
  const h = Number(item.depthInches);
  const roomL = state.plan.roomLInches;
  const roomW = state.plan.roomWInches;

  if (item.category === 'Lavatory Faucet' || item.category === 'Vanity Mirror / Medicine Cabinet') {
    const vanity = state.plan.layout.find(e => e.item.category === 'Vanity & Basin');
    if (vanity) {
      return {
        id: `layout-${item.id}-${Date.now()}`,
        item: { ...item },
        areaLabel: item.category,
        x: vanity.x + (vanity.w - w) / 2,
        y: vanity.y + (item.category === 'Lavatory Faucet' ? 1.5 : 0),
        w,
        h,
        rotation: vanity.rotation || 0,
        clearance: null
      };
    }
  }

  const taken = state.plan.layout.filter(e => 
    e.item.category !== 'Lavatory Faucet' && 
    e.item.category !== 'Vanity Mirror / Medicine Cabinet'
  );

  let chosen = [4, 4];
  let found = false;

  for (let x = 4; x <= roomL - w - 4; x += 4) {
    const candidate = { x, y: 2, w, h };
    if (!hasFloorCollision(candidate, taken)) {
      chosen = [x, 2];
      found = true;
      break;
    }
  }

  if (!found) {
    for (let y = 4; y <= roomW - h - 4; y += 4) {
      const candidate = { x: roomL - w - 2, y, w, h };
      if (!hasFloorCollision(candidate, taken)) {
        chosen = [roomL - w - 2, y];
        found = true;
        break;
      }
    }
  }

  return {
    id: `layout-${item.id}-${Date.now()}`,
    item: {...item},
    areaLabel: item.category,
    x: clamp(chosen[0], 0, roomL - w),
    y: clamp(chosen[1], 0, roomW - h),
    w,
    h,
    rotation: 0,
    clearance: {
      x: Math.max(0, chosen[0] - (item.clearanceFrontInches || 0) / 2),
      y: Math.max(0, chosen[1] - (item.clearanceFrontInches || 0) / 2),
      w: w + (item.clearanceFrontInches || 0),
      h: h + (item.clearanceFrontInches || 0),
      label: 'Suggested clearance'
    }
  };
}

function rotateSelected() {
  const entry = selectedEntry();
  if (!entry) return;
  const next = ((entry.rotation || 0) + 90) % 360;
  updateEntryPosition(entry, entry.x, entry.y, next);
  toast('Fixture rotated 90°.', 'success');
}

function deleteSelected() {
  const entry = selectedEntry();
  if (!entry) return;
  state.plan.layout = state.plan.layout.filter(x => x.id !== entry.id);
  state.activeBundle = state.activeBundle.filter(x => x.id !== entry.item.id);
  state.selectedId = null;
  updateStats();
  renderFixtureList();
  render2D();
  renderInspector();
  schedule3DRender();
  toast('Fixture removed from the design.', 'success');
}

function buildLayoutAnalysis() {
  if (!state.plan) return {};
  const floorCategories = new Set(['Vanity & Basin','Smart Toilet','Shower & Tub','Freestanding Tub']);
  const occupied = (state.plan.layout || []).filter(e => floorCategories.has(e.item?.category)).reduce((s,e)=>s+Number(e.w||0)*Number(e.h||0),0);
  const floorArea = Number(state.plan.roomLInches||1)*Number(state.plan.roomWInches||1);
  const active = state.plan.designs?.[state.activeDesignIndex];
  return {
    strategy: active?.strategy || 'custom', strategyName: active?.name || 'Custom layout',
    plannerScore: active?.score ?? null, floorOccupancyPercent: Math.round(occupied/floorArea*1000)/10,
    fixtureCount: (state.plan.layout||[]).length,
    rationale: `This ${active?.name || 'custom'} plan keeps the entry clearance protected and uses about ${Math.round(occupied/floorArea*100)}% of the room footprint for core floor fixtures.`,
    intelligence: state.currentIntelligence || null
  };
}

async function loadSavedDesigns() {
  const modal=$('savedDesignsModal'), list=$('savedDesignsList');
  modal.classList.remove('hidden'); list.innerHTML='<div class="muted">Loading…</div>';
  try {
    const res=await fetch('/api/designs'); if(!res.ok) throw new Error();
    const designs=await res.json();
    if(!designs.length){ list.innerHTML='<div class="muted">No saved designs yet.</div>'; return; }
    list.innerHTML=designs.map(d=>`<article class="saved-design-card"><div class="side-label">${escapeHtml((d.theme||'').replaceAll('_',' '))}</div><h3>${escapeHtml(d.name)}</h3><div class="saved-meta">${Number(d.roomLengthFt).toFixed(1)} × ${Number(d.roomWidthFt).toFixed(1)} ft · ${formatUSD(d.totalCost)}<br>${d.bundle?.length||0} products · ${escapeHtml(d.layoutAnalysis?.strategyName||'Saved layout')}</div><div class="saved-actions"><button class="ghost-btn" data-open-design="${d.id}">Open</button><button class="primary-btn" data-pdf-design="${d.id}">PDF ↓</button><button class="ghost-btn" data-rename-design="${d.id}">Rename</button><button class="ghost-btn danger" data-delete-design="${d.id}">Delete</button></div></article>`).join('');
    list.querySelectorAll('[data-open-design]').forEach(b=>b.onclick=()=>openSavedDesign(designs.find(d=>String(d.id)===b.dataset.openDesign)));
    list.querySelectorAll('[data-pdf-design]').forEach(b=>b.onclick=()=>exportDesignPDF(designs.find(d=>String(d.id)===b.dataset.pdfDesign)));
    list.querySelectorAll('[data-rename-design]').forEach(b=>b.onclick=async()=>{const d=designs.find(x=>String(x.id)===b.dataset.renameDesign);const name=prompt('Rename design',d?.name||'');if(!name?.trim())return;await fetch(`/api/designs/${d.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});loadSavedDesigns();});
    list.querySelectorAll('[data-delete-design]').forEach(b=>b.onclick=async()=>{const d=designs.find(x=>String(x.id)===b.dataset.deleteDesign);if(!confirm(`Delete “${d?.name||'this design'}”?`))return;await fetch(`/api/designs/${d.id}`,{method:'DELETE'});loadSavedDesigns();});
  } catch { list.innerHTML='<div class="muted">Could not load saved designs.</div>'; }
}

function openSavedDesign(d) {
  if(!d) return;
  state.theme=d.theme; state.tile=d.tile; state.marbleDesign=d.marbleDesign; state.tileColor=d.tileColor;
  state.roomLengthFt=d.roomLengthFt; state.roomWidthFt=d.roomWidthFt; state.budget=d.budget; state.door=d.doorPosition;
  state.designIntelligence=d.designIntelligence||{}; state.imageAnalysis=d.imageAnalysis||{}; state.activeBundle=(d.bundle||[]).map(x=>({...x}));
  state.plan={theme:d.theme,themeTitle:(THEMES.find(x=>x[0]===d.theme)||[])[1]||d.theme,themeNote:'Restored saved Nestora design.',tile:d.tile,marbleDesign:d.marbleDesign,tileColor:d.tileColor,budget:d.budget,totalCost:d.totalCost,doorPosition:d.doorPosition,roomLInches:d.roomLengthFt*12,roomWInches:d.roomWidthFt*12,layout:(d.layout||[]).map(x=>({...x})),bundle:state.activeBundle,designs:[{id:`saved-${d.id}`,name:d.layoutAnalysis?.strategyName||'Saved layout',strategy:d.layoutAnalysis?.strategy||'custom',score:d.layoutAnalysis?.plannerScore,layout:(d.layout||[]).map(x=>({...x}))}]};
  state.activeDesignIndex=0; state.selectedId=null; $('savedDesignsModal').classList.add('hidden'); enterStudio(); toast('Saved design restored.', 'success');
}

async function svgToPngDataUrl(svg) {
  const clone=svg.cloneNode(true); clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob); const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
  const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=865; const ctx=canvas.getContext('2d'); ctx.fillStyle='#1b1511';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height); URL.revokeObjectURL(url); return canvas.toDataURL('image/png');
}

function buildExportPlanSvg(d) {
  // Build a fresh, fixed-viewBox copy of the studio floor plan from the immutable
  // design snapshot. This intentionally mirrors render2D() rather than inventing
  // a second PDF drawing convention.
  const W=860,H=620,pad=70;
  const roomL=Math.max(1,Number(d.roomLengthFt||0)*12), roomW=Math.max(1,Number(d.roomWidthFt||0)*12);
  const scale=Math.min((W-pad*2)/roomL,(H-pad*2)/roomW);
  const ox=(W-roomL*scale)/2, oy=(H-roomW*scale)/2;
  const svg=drawSvg('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,xmlns:'http://www.w3.org/2000/svg'});

  const defs=drawSvg('defs');
  const grid=drawSvg('pattern',{id:'export-grid',width:'18',height:'18',patternUnits:'userSpaceOnUse'});
  grid.appendChild(drawSvg('path',{d:'M 18 0 L 0 0 0 18',fill:'none',stroke:'#5b4636','stroke-width':'.5',opacity:'.35'}));
  defs.appendChild(grid); svg.appendChild(defs);
  svg.appendChild(drawSvg('rect',{x:0,y:0,width:W,height:H,fill:'#1b1511'}));
  svg.appendChild(drawSvg('rect',{x:0,y:0,width:W,height:H,fill:'url(#export-grid)',opacity:'.8'}));

  const roomX=ox,roomY=oy,rw=roomL*scale,rh=roomW*scale;
  svg.appendChild(drawSvg('rect',{x:roomX,y:roomY,width:rw,height:rh,rx:5,fill:'#211913',stroke:'#b18a68','stroke-width':'5'}));
  svg.appendChild(drawSvg('rect',{x:roomX+7,y:roomY+7,width:rw-14,height:rh-14,rx:2,fill:'none',stroke:'#4b382b','stroke-width':'1'}));
  svg.appendChild(drawSvg('line',{x1:roomX,y1:roomY-28,x2:roomX+rw,y2:roomY-28,stroke:'#8d715b','stroke-width':'1'}));
  const t1=drawSvg('text',{x:roomX+rw/2,y:roomY-34,fill:'#b89a7e','font-size':'12','text-anchor':'middle','font-family':'monospace'});t1.textContent=`${(roomL/12).toFixed(1)} ft`;svg.appendChild(t1);
  svg.appendChild(drawSvg('line',{x1:roomX-28,y1:roomY,x2:roomX-28,y2:roomY+rh,stroke:'#8d715b','stroke-width':'1'}));
  const t2=drawSvg('text',{x:roomX-38,y:roomY+rh/2,fill:'#b89a7e','font-size':'12','text-anchor':'middle','font-family':'monospace',transform:`rotate(-90 ${roomX-38} ${roomY+rh/2})`});t2.textContent=`${(roomW/12).toFixed(1)} ft`;svg.appendChild(t2);

  const doorWidth=Math.min(34,roomL*.25)*scale;
  const doorX=d.doorPosition==='bottom_right'?roomX+rw-doorWidth:roomX,doorY=roomY+rh;
  svg.appendChild(drawSvg('rect',{x:doorX,y:doorY-5,width:doorWidth,height:10,fill:'#211913',stroke:'none'}));
  const swing=d.doorPosition==='bottom_right'?`M ${doorX} ${doorY} A ${doorWidth} ${doorWidth} 0 0 1 ${doorX+doorWidth} ${doorY-doorWidth}`:`M ${doorX+doorWidth} ${doorY} A ${doorWidth} ${doorWidth} 0 0 0 ${doorX} ${doorY-doorWidth}`;
  svg.appendChild(drawSvg('path',{d:swing,fill:'none',stroke:'#927157','stroke-width':'1.5','stroke-dasharray':'5 4'}));
  svg.appendChild(drawSvg('line',{x1:doorX,y1:doorY,x2:doorX+doorWidth,y2:doorY-doorWidth,stroke:'#d09b6b','stroke-width':'2'}));

  const keepW=Math.min(42,roomL)*scale,keepD=Math.min(50,roomW)*scale;
  const keepX=d.doorPosition==='bottom_right'?roomX+rw-keepW:roomX;
  svg.appendChild(drawSvg('rect',{x:keepX,y:roomY+rh-keepD,width:keepW,height:keepD,fill:'rgba(188,70,52,.08)',stroke:'#b94e3b','stroke-width':'1.5','stroke-dasharray':'7 5'}));
  const keepLabel=drawSvg('text',{x:keepX+keepW/2,y:roomY+rh-keepD+16,fill:'#d77b68','font-size':'9','text-anchor':'middle','font-family':'DM Sans, Arial, sans-serif','font-weight':'700'});keepLabel.textContent='ENTRY CLEARANCE';svg.appendChild(keepLabel);

  const fixturePalette={'Vanity & Basin':['#8f6548','#f0c39c'],'Smart Toilet':['#667f88','#c6e2e7'],'Shower & Tub':['#557a73','#b8ddd3'],'Freestanding Tub':['#6e718e','#d4d2ef'],'Toiletries & Accessories':['#7c6a50','#dfc89e'],'Towel Warmer':['#7a6060','#dfb8b8']};
  (d.layout||[]).forEach((entry,i)=>{
    const x=roomX+Number(entry.x||0)*scale,y=roomY+Number(entry.y||0)*scale,w=Number(entry.w||0)*scale,h=Number(entry.h||0)*scale;

    // IMPORTANT: match render2D() exactly. entry.w/entry.h are already the
    // post-rotation axis-aligned occupied footprint, so never rotate this outer
    // footprint again during PDF export.
    const g=drawSvg('g',{transform:`translate(${x+w/2} ${y+h/2})`});
    const [fixtureFill,fixtureStroke]=fixturePalette[entry.item?.category]||['#806a58','#d6b99d'];
    g.appendChild(drawSvg('rect',{x:-w/2,y:-h/2,width:w,height:h,rx:Math.min(8,w*.08),fill:fixtureFill,stroke:fixtureStroke,opacity:'.78','stroke-width':'1.2'}));

    // The symbol uses native catalog dimensions and receives the semantic
    // rotation exactly once, including the same toilet forward-direction
    // correction used by the live 2D renderer.
    const nativeW=(Number(entry.item?.widthInches)||Number(entry.w)||24)*scale;
    const nativeH=(Number(entry.item?.depthInches)||Number(entry.h)||24)*scale;
    const visualOffset=entry.item?.category==='Smart Toilet' ? 180 : 0;
    const symbol=drawSvg('g',{transform:`rotate(${(Number(entry.rotation)||0)+visualOffset})`});
    drawFixtureSymbol(symbol,entry.item?.category,nativeW,nativeH);
    symbol.appendChild(drawSvg('path',{d:`M 0 ${-Math.min(nativeH*.28,18)} L -5 ${-Math.min(nativeH*.28,18)+7} M 0 ${-Math.min(nativeH*.28,18)} L 5 ${-Math.min(nativeH*.28,18)+7}`,fill:'none',stroke:'#fff2df','stroke-width':'1.5','stroke-linecap':'round'}));
    g.appendChild(symbol);

    // Badges and labels stay upright, just like the on-screen plan.
    g.appendChild(drawSvg('circle',{cx:-w/2+10,cy:-h/2+10,r:9,fill:'#17110d',stroke:fixtureStroke,'stroke-width':'1.5'}));
    const badgeText=drawSvg('text',{x:-w/2+10,y:-h/2+13,fill:'#fff3e6','font-size':'9','text-anchor':'middle','font-family':'DM Sans, Arial, sans-serif','font-weight':'800'});badgeText.textContent=String(i+1);g.appendChild(badgeText);
    const label=drawSvg('text',{x:0,y:h/2+15,fill:'#fff0df',stroke:'#211913','stroke-width':'4','paint-order':'stroke','font-size':'10','text-anchor':'middle','font-family':'DM Sans, Arial, sans-serif','font-weight':'800'});label.textContent=shortCategory(entry.item?.category);g.appendChild(label);
    svg.appendChild(g);
  });
  return svg;
}

async function savedPlanPng(d) {
  // Rasterise only the fixed off-screen SVG above. No live DOM geometry, CSS
  // layout, viewport size, DPR or recording state participates in the export.
  return await svgToPngDataUrl(buildExportPlanSvg(d));
}

// Nestora 5.2.1: deterministic, snapshot-based report export
async function exportDesignPDF(design=null) {
  // Freeze the complete report input before any asynchronous PDF work starts.
  // Resize/recording events may continue to redraw the studio, but can no longer
  // mutate the data being exported halfway through a report.
  const liveDesign=design || {name:$('designName')?.value||'Nestora Bathroom',theme:state.plan?.theme,tile:state.tile,marbleDesign:state.marbleDesign,tileColor:state.tileColor,roomLengthFt:state.roomLengthFt,roomWidthFt:state.roomWidthFt,budget:state.plan?.budget||state.budget,totalCost:state.activeBundle.reduce((s,i)=>s+Number(i.price||0),0),doorPosition:state.plan?.doorPosition,layout:state.plan?.layout||[],bundle:state.activeBundle,designIntelligence:state.designIntelligence||{},imageAnalysis:state.imageAnalysis||{},layoutAnalysis:buildLayoutAnalysis()};
  const d=typeof structuredClone==='function' ? structuredClone(liveDesign) : JSON.parse(JSON.stringify(liveDesign));
  if(!window.jspdf?.jsPDF){toast('PDF library is unavailable. Check your internet connection.','error');return;}
  const {jsPDF}=window.jspdf, pdf=new jsPDF({unit:'mm',format:'a4'}), W=210,H=297,M=16, contentW=178;
  const ink=[55,43,34], tan=[181,155,125], cream=[248,244,238], muted=[110,101,93];
  let page=0,y=0;
  const header=()=>{page++;pdf.setFillColor(...cream);pdf.rect(0,0,W,H,'F');pdf.setDrawColor(...tan);pdf.setLineWidth(.35);pdf.line(M,13,W-M,13);pdf.setTextColor(...ink);pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text('NESTORA',M,9);pdf.setFont('helvetica','normal');pdf.setTextColor(...muted);pdf.text('AI BATHROOM STUDIO',W-M,9,{align:'right'});y=22;};
  const footer=()=>{pdf.setDrawColor(215,204,191);pdf.line(M,H-13,W-M,H-13);pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text('Nestora Design Intelligence · Spatially validated + AI-assisted',M,H-8);pdf.text(String(page),W-M,H-8,{align:'right'});};
  const newPage=()=>{if(page)footer();pdf.addPage();header();};
  const title=(t,sub='')=>{pdf.setTextColor(...ink);pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text(t,M,y);y+=7;if(sub){pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(...muted);pdf.text(pdf.splitTextToSize(sub,contentW),M,y);y+=8;}pdf.setDrawColor(220,209,196);pdf.line(M,y,W-M,y);y+=7;};
  const section=(t)=>{if(y>267)newPage();pdf.setTextColor(...ink);pdf.setFont('helvetica','bold');pdf.setFontSize(11);pdf.text(t,M,y);y+=6;};
  const para=(t,indent=0)=>{pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(...ink);const lines=pdf.splitTextToSize(String(t||''),contentW-indent);if(y+lines.length*4.2>275)newPage();pdf.text(lines,M+indent,y);y+=lines.length*4.2+3;};
  const metric=(label,value,x,w=54)=>{pdf.setFillColor(241,234,225);pdf.roundedRect(x,y,w,17,2,2,'F');pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text(label.toUpperCase(),x+4,y+5);pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.setTextColor(...ink);pdf.text(String(value),x+4,y+12);pdf.setFont('helvetica','normal');};
  const intel=(d.layoutAnalysis||{}).intelligence || (!design?state.currentIntelligence:null) || {};
  header(); pdf.setFont('helvetica','bold');pdf.setFontSize(26);pdf.setTextColor(...ink);pdf.text(d.name||'Bathroom Design',M,38);pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(...muted);pdf.text(`${(d.theme||'').replaceAll('_',' ')} · ${(d.tile||'').replaceAll('_',' ')} · ${new Date().toLocaleDateString()}`,M,46);y=56;
  metric('Room',`${Number(d.roomLengthFt).toFixed(1)} × ${Number(d.roomWidthFt).toFixed(1)} ft`,M);metric('Target budget',formatUSD(d.budget),M+60);metric('Products',formatUSD(d.totalCost),M+120);y+=24;
  section('Design overview'); para(intel.brief||'Bathroom concept generated from the room dimensions, design priorities, selected theme and product budget.');
  section('2D floor plan'); try{const png=await savedPlanPng(d);pdf.addImage(png,'PNG',M,y,contentW,126);y+=132;}catch{para('Floor plan image could not be embedded.');}
  footer();pdf.addPage();header();title('Design Intelligence','Measured spatial facts are separated from AI interpretation so the report remains traceable.');
  const facts=intel.facts||{}; metric('Core footprint',facts.floorOccupancyPercent!=null?`${facts.floorOccupancyPercent}%`:'—',M);metric('Closest gap',facts.closestGapInches!=null?`${facts.closestGapInches}"`:'—',M+60);metric('Budget remaining',formatUSD(facts.budgetRemaining??(Number(d.budget)-Number(d.totalCost))),M+120);y+=24;
  section('Verified by spatial engine');(intel.strengths||['Saved layout positions preserved.']).forEach(x=>para(`✓ ${x}`,2));(intel.warnings||[]).forEach(x=>para(`! ${x}`,2));
  section('Measured design trade-off');para(intel.tradeoff||'No comparative trade-off was stored for this design.');
  if((intel.comparison||[]).length){section('Generated concept comparison');intel.comparison.forEach(x=>para(`${x.name}: ${x.closestGapInches??'—'}" closest core-fixture gap · ${x.floorOccupancyPercent??'—'}% core footprint${x.entryClear?' · entry clear':' · entry conflict'}`,2));}
  if(intel.summary){section('Nestora AI design review');para(intel.summary);if(intel.nextAction)para(`Suggested next step: ${intel.nextAction}`);}
  footer();pdf.addPage();header();title('Floor Plan & Fixture Schedule','Positions below correspond to the saved 2D design coordinates.');
  try{const png=await savedPlanPng(d);pdf.addImage(png,'PNG',M,y,contentW,112);y+=119;}catch{}
  section('Fixture schedule');(d.layout||[]).forEach((e,i)=>{if(y>268)newPage();pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.setTextColor(...ink);pdf.text(`${String(i+1).padStart(2,'0')}  ${e.areaLabel||e.item?.category||'Fixture'}`,M,y);pdf.setFont('helvetica','normal');pdf.text(`${Number(e.w).toFixed(1)}" × ${Number(e.h).toFixed(1)}" · X ${Number(e.x).toFixed(1)}" · Y ${Number(e.y).toFixed(1)}" · Rot ${Number(e.rotation||0)}°`,W-M,y,{align:'right'});y+=5;});
  footer();pdf.addPage();header();title('Product & Material Specification',`Theme: ${(d.theme||'').replaceAll('_',' ')} · Finish: ${(d.tile||'').replaceAll('_',' ')}`);
  (d.bundle||[]).forEach((item,i)=>{if(y>258)newPage();pdf.setFillColor(244,238,231);pdf.roundedRect(M,y-3,contentW,22,2,2,'F');pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.setTextColor(...ink);pdf.text(`${String(i+1).padStart(2,'0')}  ${item.name||item.category}`,M+4,y+3);pdf.text(formatUSD(item.price||0),W-M-4,y+3,{align:'right'});pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.setTextColor(...muted);pdf.text(`${item.category||''} · ${item.modelNumber||'No model #'} · ${item.finish||''}`,M+4,y+9);const why=(intel.productReasoning||[]).find(x=>x.product===(item.name||item.category));if(why){const lines=pdf.splitTextToSize(`Why selected: ${why.reason}`,contentW-8);pdf.text(lines.slice(0,2),M+4,y+14);}y+=27;});
  footer();pdf.addPage();header();title('Budget Summary','Product estimates are based on the active Nestora catalog and should be verified before purchase.');
  section('Selected products');(d.bundle||[]).forEach(item=>{if(y>260)newPage();pdf.setFontSize(8.5);pdf.setTextColor(...ink);pdf.text(item.category||item.name,M,y);pdf.text(formatUSD(item.price||0),W-M,y,{align:'right'});y+=5;});pdf.setDrawColor(...tan);pdf.line(M,y,W-M,y);y+=7;pdf.setFont('helvetica','bold');pdf.text('Estimated product total',M,y);pdf.text(formatUSD(d.totalCost),W-M,y,{align:'right'});y+=6;pdf.setFont('helvetica','normal');pdf.text('Target budget',M,y);pdf.text(formatUSD(d.budget),W-M,y,{align:'right'});y+=6;pdf.text('Remaining',M,y);pdf.text(formatUSD(Number(d.budget||0)-Number(d.totalCost||0)),W-M,y,{align:'right'});y+=12;
  section('Planning note');para('This report is a design-planning aid, not a construction or code-compliance document. Verify site dimensions, plumbing, waterproofing, electrical requirements, accessibility requirements, installation clearances, taxes, shipping and current product pricing with qualified professionals before construction or purchase.');
  footer();pdf.save(`${(d.name||'nestora-design').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.pdf`);
}

async function saveDesign() {
  $('saveModal').classList.remove('hidden');$('designName').focus();
}

async function confirmSave() {
  const name = $('designName').value.trim() || 'Untitled Bathroom';
  try {
    const res = await fetch('/api/designs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name,
        theme: state.plan.theme,
        tile: state.tile,
        marbleDesign: state.marbleDesign,
        tileColor: state.tileColor,
        roomLengthFt: state.roomLengthFt,
        roomWidthFt: state.roomWidthFt,
        budget: state.plan.budget,
        totalCost: state.activeBundle.reduce((s, i) => s + Number(i.price || 0), 0),
        doorPosition: state.plan.doorPosition,
        layout: state.plan.layout,
        bundle: state.activeBundle,
        designIntelligence: state.designIntelligence || state.plan.designIntelligence || {},
        imageAnalysis: state.imageAnalysis || state.plan.imageAnalysis || {},
        layoutAnalysis: buildLayoutAnalysis()
      })
    });
    if (!res.ok) throw new Error();
    $('saveModal').classList.add('hidden');
    toast('Design saved to My Designs.', 'success');
    setTimeout(loadSavedDesigns, 180);
  } catch {
    toast('Could not save the design.', 'error');
  }
}

function wireStudioEvents() {
  document.querySelectorAll('#viewToggle button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('rotateBtn').addEventListener('click', rotateSelected);
  $('deleteBtn').addEventListener('click', deleteSelected);$('addFixtureBtn').addEventListener('click', () => openCatalog());
  $('suggestBtn').addEventListener('click', requestSuggestions);$('resetViewBtn').addEventListener('click', resetView);
  $('studioTileSelect').addEventListener('change', e => applyTile(e.target.value));$('saveBtn').addEventListener('click', saveDesign);
  $('headerSaveBtn').addEventListener('click', saveDesign);$('confirmSave').addEventListener('click', confirmSave);
  $('savedDesignsBtn').addEventListener('click', loadSavedDesigns);$('exportPdfBtn').addEventListener('click', ()=>exportDesignPDF());$('closeSavedDesigns').addEventListener('click', ()=>$('savedDesignsModal').classList.add('hidden'));
  $('closeSave').addEventListener('click', () =>$('saveModal').classList.add('hidden'));
  $('closeCatalog').addEventListener('click', () =>$('catalogModal').classList.add('hidden'));
  $('backSetupBtn').addEventListener('click', () => {$('studioView').classList.add('hidden');
    $('setupView').classList.remove('hidden');$('headerSaveBtn').classList.add('hidden');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('catalogModal').classList.add('hidden');$('saveModal').classList.add('hidden');
    }
    if (e.key === 'Delete') deleteSelected();
    if (e.key.toLowerCase() === 'r') rotateSelected();
  });
}

$('generateBtn').addEventListener('click', generatePlan);
$('aiRefineBtn')?.addEventListener('click', refineWithAI);
$('aiRefineInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')refineWithAI();});
renderThemeCards();
renderTileCards();
setupInputs();
wireStudioEvents();