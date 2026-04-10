/**
 * Internet Road Trip – app.js
 *
 * A private, self-hosted virtual road trip using only free APIs:
 *   • Mapillary  – street-level imagery (free account, no credit card)
 *   • Leaflet + CartoDB/OSM tiles – mini-map (no key required)
 *   • Nominatim  – reverse geocoding (no key required)
 *
 * Flow:
 *  1. Ask the user for a Mapillary client token (stored in localStorage).
 *  2. Pick a random starting location from a curated list of roads.
 *  3. Find a nearby Mapillary image and its sequence.
 *  4. Auto-drive forward through the sequence, displaying each image.
 *  5. Reverse-geocode each new position with Nominatim.
 *  6. Plot the route on a Leaflet mini-map.
 */

/* ── Constants ────────────────────────────────────────────────────────── */

const LS_KEY          = 'irt_mapillary_key';
const MAPILLARY_BASE  = 'https://graph.mapillary.com';
const NOMINATIM_BASE  = 'https://nominatim.openstreetmap.org';

// Speed steps: value → milliseconds between panorama hops
const SPEED_DELAY = { 1: 6000, 2: 4000, 3: 2500, 4: 1500, 5: 800 };

/**
 * Curated starting LatLngs spread across every continent.
 */
const STARTING_LOCATIONS = [
  // North America
  { label: 'Route 66, USA',             lat: 35.1983,  lng: -102.0165 },
  { label: 'Pacific Coast Hwy, CA',     lat: 36.5244,  lng: -121.9230 },
  { label: 'Going-to-the-Sun Rd, MT',   lat: 48.6967,  lng: -113.7180 },
  { label: 'Icefields Pkwy, Canada',    lat: 51.9737,  lng: -116.9281 },
  { label: 'Blue Ridge Pkwy, USA',      lat: 35.7351,  lng: -82.4745  },
  { label: 'Denali Hwy, Alaska',        lat: 63.0225,  lng: -148.0000 },
  // South America
  { label: 'Carretera Austral, Chile',  lat: -46.4333, lng: -72.7167  },
  { label: 'Ruta 40, Argentina',        lat: -40.6833, lng: -71.4833  },
  { label: 'Amazon Basin, Brazil',      lat: -3.4653,  lng: -62.2159  },
  // Europe
  { label: 'Amalfi Coast, Italy',       lat: 40.6340,  lng: 14.6027   },
  { label: 'Atlantic Road, Norway',     lat: 63.0107,  lng: 7.3402    },
  { label: 'Col du Galibier, France',   lat: 45.0642,  lng: 6.4072    },
  { label: 'Ring Road, Iceland',        lat: 65.2628,  lng: -14.4003  },
  { label: 'Grossglockner, Austria',    lat: 47.0833,  lng: 12.8333   },
  { label: 'Transfăgărășan, Romania',   lat: 45.6028,  lng: 24.6278   },
  { label: 'Trollstigen, Norway',       lat: 62.4583,  lng: 7.6694    },
  { label: 'N59, Connemara, Ireland',   lat: 53.5406,  lng: -9.8989   },
  // Africa
  { label: 'Cape Peninsula, S. Africa', lat: -34.1898, lng: 18.4663   },
  { label: 'Atlas Mountains, Morocco',  lat: 31.0668,  lng: -7.9267   },
  { label: 'Ngorongoro, Tanzania',      lat: -3.2000,  lng: 35.5000   },
  // Asia
  { label: 'Karakoram Hwy, Pakistan',   lat: 36.4980,  lng: 74.5976   },
  { label: 'Manali–Leh Hwy, India',     lat: 32.4900,  lng: 77.2500   },
  { label: 'Furkapass, Switzerland',    lat: 46.5710,  lng: 8.4160    },
  { label: 'Hokkaido, Japan',           lat: 43.5850,  lng: 144.0080  },
  // Oceania
  { label: 'Great Ocean Rd, Australia', lat: -38.6662, lng: 143.3942  },
  { label: 'Milford Rd, New Zealand',   lat: -44.9250, lng: 168.1100  },
];

/* ── DOM references ───────────────────────────────────────────────────── */

const configScreen = document.getElementById('config-screen');
const apiKeyInput  = document.getElementById('api-key-input');
const configError  = document.getElementById('config-error');
const startBtn     = document.getElementById('start-btn');
const appEl        = document.getElementById('app');
const panoramaEl   = document.getElementById('panorama');
const locationFlag = document.getElementById('location-flag');
const locationName = document.getElementById('location-name');
const locationSub  = document.getElementById('location-sub');
const pauseBtn     = document.getElementById('pause-btn');
const speedSlider  = document.getElementById('speed-slider');
const newTripBtn   = document.getElementById('new-trip-btn');
const settingsBtn  = document.getElementById('settings-btn');
const stepsCount   = document.getElementById('steps-count');

/* ── State ────────────────────────────────────────────────────────────── */

let mapillaryKey    = '';
let miniMap         = null;   // Leaflet Map
let routePolyline   = null;   // Leaflet Polyline
let routeMarker     = null;   // Leaflet Marker
let driveTimer      = null;   // setTimeout handle
let paused          = false;
let steps           = 0;
let routeCoords     = [];     // [lat, lng][] of visited positions

let sequenceImages  = [];     // ordered Mapillary image IDs for current sequence
let sequenceIndex   = 0;      // current position in sequenceImages
let imageCache      = {};     // imageId → { url, lat, lng }
let lastGeocodeTime = 0;      // timestamp of last Nominatim request
let tripId          = 0;      // increments on each startTrip(); cancels stale async ops
let controlsReady   = false;

/* ── Entry point ──────────────────────────────────────────────────────── */

(function init() {
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) apiKeyInput.value = savedKey;

  startBtn.addEventListener('click', handleStartClick);
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStartClick();
  });
})();

function handleStartClick() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    configError.textContent = 'Please enter your Mapillary client token.';
    return;
  }
  configError.textContent = '';
  // lgtm[js/clear-text-storage-of-sensitive-data]
  localStorage.setItem(LS_KEY, key);
  mapillaryKey = key;

  configScreen.classList.add('hidden');
  appEl.classList.remove('hidden');

  if (!controlsReady) {
    setupControls();
    controlsReady = true;
  }
  if (!miniMap) initMiniMap();

  startTrip();
}

/* ── Controls wiring ──────────────────────────────────────────────────── */

function setupControls() {
  pauseBtn.addEventListener('click', togglePause);
  speedSlider.addEventListener('input', restartTimer);
  newTripBtn.addEventListener('click', () => { stopTimer(); startTrip(); });
  settingsBtn.addEventListener('click', () => {
    stopTimer();
    appEl.classList.add('hidden');
    configScreen.classList.remove('hidden');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Trip 🛣️';
  });
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶️' : '⏸';
  if (!paused) scheduleNextHop();
}

function stopTimer() {
  clearTimeout(driveTimer);
  driveTimer = null;
}

function restartTimer() {
  if (!paused) { stopTimer(); scheduleNextHop(); }
}

/* ── Mini-map (Leaflet + OpenStreetMap) ───────────────────────────────── */

function initMiniMap() {
  miniMap = L.map('mini-map', {
    zoomControl:       false,
    attributionControl: false,
    dragging:          false,
    scrollWheelZoom:   false,
    doubleClickZoom:   false,
    keyboard:          false,
    tap:               false,
  });

  // CartoDB Dark Matter tiles – free, no API key needed
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom:    19,
    subdomains: 'abcd',
  }).addTo(miniMap);

  routePolyline = L.polyline([], {
    color:   '#63b3ed',
    opacity: 0.9,
    weight:  3,
  }).addTo(miniMap);

  const markerIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#f6e05e;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>',
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  });
  routeMarker = L.marker([0, 0], { icon: markerIcon }).addTo(miniMap);
}

/* ── Trip lifecycle ───────────────────────────────────────────────────── */

async function startTrip() {
  const myTripId = ++tripId;

  steps          = 0;
  sequenceImages = [];
  sequenceIndex  = 0;
  routeCoords    = [];
  imageCache     = {};
  stepsCount.textContent   = '0';
  locationName.textContent = 'Loading…';
  locationName.classList.add('loading');
  locationSub.textContent  = '';
  locationFlag.textContent = '';
  paused = false;
  pauseBtn.textContent = '⏸';
  panoramaEl.style.backgroundImage = '';

  if (routePolyline) routePolyline.setLatLngs([]);

  const start = STARTING_LOCATIONS[Math.floor(Math.random() * STARTING_LOCATIONS.length)];

  try {
    const image = await findNearbyImage(start.lat, start.lng, myTripId);
    if (myTripId !== tripId) return;
    if (!image) { setTimeout(startTrip, 1000); return; }

    sequenceImages = await getSequenceImages(image.sequence, myTripId);
    if (myTripId !== tripId) return;

    sequenceIndex = sequenceImages.indexOf(image.id);
    if (sequenceIndex === -1) sequenceIndex = 0;

    // Pre-fetch next few image details in the background
    prefetchBatch(sequenceIndex, 5);

    await showImage(sequenceImages[sequenceIndex], myTripId);
    if (myTripId !== tripId) return;

    scheduleNextHop();
  } catch (err) {
    if (myTripId !== tripId) return;
    console.error('Trip start error:', err);
    setTimeout(startTrip, 3000);
  }
}

/* ── Mapillary API helpers ────────────────────────────────────────────── */

async function mapillaryFetch(url, myTripId, retries = 3) {
  const resp = await fetch(url);

  if (resp.status === 401) {
    if (!myTripId || myTripId === tripId) {
      configError.textContent = 'Invalid Mapillary token – please check your key.';
      appEl.classList.add('hidden');
      configScreen.classList.remove('hidden');
      startBtn.disabled = false;
      startBtn.textContent = 'Start Trip 🛣️';
    }
    throw new Error('Unauthorized');
  }

  // Retry transient server errors with exponential backoff
  if (resp.status >= 500 && retries > 0) {
    await new Promise(r => setTimeout(r, (4 - retries) * 1000));
    return mapillaryFetch(url, myTripId, retries - 1);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function findNearbyImage(lat, lng, myTripId, attempt = 1) {
  const delta = 0.02 * attempt; // ~2 km at attempt 1, grows with retries
  const bbox  = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const url   = `${MAPILLARY_BASE}/images?fields=id,sequence,geometry&bbox=${bbox}&limit=20&access_token=${encodeURIComponent(mapillaryKey)}`;

  const data = await mapillaryFetch(url, myTripId);

  if (!data.data || data.data.length === 0) {
    if (attempt < 7) return findNearbyImage(lat, lng, myTripId, attempt + 1);
    console.warn('No Mapillary coverage near', lat, lng);
    return null;
  }

  // Pick a random image from the first few results to vary the start point
  return data.data[Math.floor(Math.random() * Math.min(data.data.length, 5))];
}

async function getSequenceImages(sequenceId, myTripId) {
  const url  = `${MAPILLARY_BASE}/image_ids?sequence_id=${encodeURIComponent(sequenceId)}&access_token=${encodeURIComponent(mapillaryKey)}`;
  const data = await mapillaryFetch(url, myTripId);
  return (data.data || []).map(item => item.id);
}

async function fetchImageDetails(imageId) {
  if (imageCache[imageId]) return imageCache[imageId];

  const url  = `${MAPILLARY_BASE}/${encodeURIComponent(imageId)}?fields=thumb_2048_url,geometry&access_token=${encodeURIComponent(mapillaryKey)}`;
  const data = await mapillaryFetch(url);

  const [lng, lat] = data.geometry.coordinates;
  const details = { url: data.thumb_2048_url, lat, lng };
  imageCache[imageId] = details;
  return details;
}

function prefetchBatch(fromIndex, count) {
  const end = Math.min(fromIndex + count, sequenceImages.length);
  for (let i = fromIndex; i < end; i++) {
    const id = sequenceImages[i];
    if (!imageCache[id]) fetchImageDetails(id).catch(() => {});
  }
}

async function showImage(imageId, myTripId) {
  const details = await fetchImageDetails(imageId);
  if (myTripId && myTripId !== tripId) return;

  panoramaEl.style.backgroundImage = `url('${details.url}')`;
  updateRoute([details.lat, details.lng]);
  reverseGeocode(details.lat, details.lng);
}

/* ── Auto-drive ───────────────────────────────────────────────────────── */

function scheduleNextHop() {
  stopTimer();
  if (paused) return;
  const delay = SPEED_DELAY[parseInt(speedSlider.value, 10)] || 2500;
  driveTimer = setTimeout(driveOneStep, delay);
}

async function driveOneStep() {
  const myTripId = tripId;

  sequenceIndex++;
  if (sequenceIndex >= sequenceImages.length) {
    console.info('End of sequence – starting new trip');
    startTrip();
    return;
  }

  // Pre-fetch upcoming images while driving
  prefetchBatch(sequenceIndex + 1, 5);

  try {
    await showImage(sequenceImages[sequenceIndex], myTripId);
    if (myTripId !== tripId) return;
    steps++;
    stepsCount.textContent = steps.toLocaleString();
  } catch (err) {
    if (myTripId !== tripId) return;
    console.error('Hop error:', err);
  }

  if (myTripId === tripId) scheduleNextHop();
}

/* ── Route tracking ───────────────────────────────────────────────────── */

function updateRoute(latLng) {
  routeCoords.push(latLng);
  if (routePolyline) routePolyline.setLatLngs(routeCoords);
  if (routeMarker && miniMap) {
    routeMarker.setLatLng(latLng);
    if (routeCoords.length === 1) {
      miniMap.setView(latLng, 13);
    } else {
      miniMap.panTo(latLng);
    }
  }
}

/* ── Reverse geocoding (Nominatim / OpenStreetMap) ────────────────────── */

async function reverseGeocode(lat, lng) {
  // Respect Nominatim's usage policy: max 1 request per second; we use 3 s to be safe
  const now = Date.now();
  if (now - lastGeocodeTime < 3000) return;
  lastGeocodeTime = now;

  try {
    const url  = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!resp.ok) return;
    const data = await resp.json();

    const addr        = data.address || {};
    const locality    = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
    const region      = addr.state || addr.region || '';
    const country     = addr.country || '';
    const countryCode = (addr.country_code || '').toUpperCase();

    locationName.classList.remove('loading');
    locationName.textContent = locality || region || country || 'Unknown location';
    locationSub.textContent  = [region, country].filter(Boolean).join(', ');
    locationFlag.textContent = countryCodeToFlag(countryCode);
  } catch (err) {
    console.error('Geocode error:', err);
  }
}

/** Convert ISO 3166-1 alpha-2 country code to flag emoji */
function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}
