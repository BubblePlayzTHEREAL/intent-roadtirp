/**
 * Internet Road Trip – app.js
 *
 * A private, self-hosted recreation of the neal.fun/internet-roadtrip experience.
 * Uses the Google Maps JavaScript API (Street View + Geocoding + Maps).
 *
 * Flow:
 *  1. Ask the user for a Google Maps API key (stored in localStorage).
 *  2. Dynamically load the Google Maps script with that key.
 *  3. Pick a random starting location from a curated list of roads.
 *  4. Auto-drive forward by following Street View navigation links.
 *  5. Reverse-geocode each new position and update the location overlay.
 *  6. Plot the route on a mini-map.
 */

/* ── Constants ────────────────────────────────────────────────────────── */

const LS_KEY = 'irt_gmaps_key';

// Speed steps: value → milliseconds between panorama hops
const SPEED_DELAY = { 1: 6000, 2: 4000, 3: 2500, 4: 1500, 5: 800 };

/**
 * Curated starting panorama IDs / LatLngs spread across every continent.
 * Each entry has { pano } (Street View pano ID) or { lat, lng } (fallback).
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

const configScreen   = document.getElementById('config-screen');
const apiKeyInput    = document.getElementById('api-key-input');
const configError    = document.getElementById('config-error');
const startBtn       = document.getElementById('start-btn');
const appEl          = document.getElementById('app');
const locationFlag   = document.getElementById('location-flag');
const locationName   = document.getElementById('location-name');
const locationSub    = document.getElementById('location-sub');
const pauseBtn       = document.getElementById('pause-btn');
const speedSlider    = document.getElementById('speed-slider');
const newTripBtn     = document.getElementById('new-trip-btn');
const settingsBtn    = document.getElementById('settings-btn');
const stepsCount     = document.getElementById('steps-count');

/* ── State ────────────────────────────────────────────────────────────── */

let panorama       = null;   // google.maps.StreetViewPanorama
let miniMap        = null;   // google.maps.Map
let routePath      = null;   // google.maps.Polyline
let routeMarker    = null;   // google.maps.Marker (current position dot)
let geocoder       = null;   // google.maps.Geocoder
let driveTimer     = null;   // setInterval handle
let paused         = false;
let steps          = 0;
let currentHeading = 0;      // degrees – used to pick the "forward" link
let routeCoords    = [];     // LatLng[] of visited positions

/* ── Entry point ──────────────────────────────────────────────────────── */

(function init() {
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }

  startBtn.addEventListener('click', handleStartClick);
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStartClick();
  });
})();

function handleStartClick() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    configError.textContent = 'Please enter a valid API key.';
    return;
  }
  configError.textContent = '';
  // The API key is a browser-side credential that must be sent to Google with
  // every Maps API request anyway; storing it locally avoids re-entry on reload.
  // lgtm[js/clear-text-storage-of-sensitive-data]
  localStorage.setItem(LS_KEY, key);
  loadGoogleMaps(key);
}

/* ── Load Google Maps SDK dynamically ─────────────────────────────────── */

function loadGoogleMaps(apiKey) {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading…';

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=onMapsReady&libraries=geometry`;
  script.async = true;
  script.onerror = () => {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Trip 🛣️';
    configError.textContent = 'Failed to load Google Maps. Check your API key and internet connection.';
  };
  document.head.appendChild(script);
}

/* Called by Google Maps SDK once loaded */
window.onMapsReady = function () {
  configScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  setupControls();
  startTrip();
};

/* ── Controls wiring ──────────────────────────────────────────────────── */

function setupControls() {
  pauseBtn.addEventListener('click', togglePause);
  speedSlider.addEventListener('input', restartTimer);
  newTripBtn.addEventListener('click', () => {
    stopTimer();
    startTrip();
  });
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
  if (!paused) {
    stopTimer();
    scheduleNextHop();
  }
}

/* ── Trip lifecycle ───────────────────────────────────────────────────── */

function startTrip() {
  steps          = 0;
  currentHeading = 0;
  routeCoords    = [];
  stepsCount.textContent = '0';
  locationName.textContent = 'Loading…';
  locationName.classList.add('loading');
  locationSub.textContent  = '';
  locationFlag.textContent = '';
  paused = false;
  pauseBtn.textContent = '⏸';

  const start = STARTING_LOCATIONS[Math.floor(Math.random() * STARTING_LOCATIONS.length)];

  if (!geocoder) geocoder = new google.maps.Geocoder();

  // ── Street View panorama ──
  if (!panorama) {
    panorama = new google.maps.StreetViewPanorama(
      document.getElementById('panorama'),
      {
        pov:             { heading: 0, pitch: 0 },
        zoom:            0,
        addressControl:  false,
        showRoadLabels:  false,
        clickToGo:       false,
        disableDefaultUI: true,
        motionTracking:  false,
      }
    );
  }

  // ── Mini-map ──
  if (!miniMap) {
    miniMap = new google.maps.Map(document.getElementById('mini-map'), {
      zoom:             5,
      center:           { lat: start.lat, lng: start.lng },
      mapTypeId:        'roadmap',
      disableDefaultUI: true,
      gestureHandling:  'none',
      styles: darkMapStyles(),
    });

    routePath = new google.maps.Polyline({
      map:          miniMap,
      strokeColor:  '#63b3ed',
      strokeOpacity: 0.9,
      strokeWeight:  3,
    });

    routeMarker = new google.maps.Marker({
      map:  miniMap,
      icon: {
        path:        google.maps.SymbolPath.CIRCLE,
        scale:       7,
        fillColor:   '#f6e05e',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });
  } else {
    // Reset route for new trip
    routePath.setPath([]);
    routeMarker.setPosition({ lat: start.lat, lng: start.lng });
    miniMap.setCenter({ lat: start.lat, lng: start.lng });
    miniMap.setZoom(5);
  }

  // Position the panorama at the starting location
  const sv = new google.maps.StreetViewService();
  sv.getPanorama(
    { location: { lat: start.lat, lng: start.lng }, radius: 2000, source: google.maps.StreetViewSource.OUTDOOR },
    (data, status) => {
      if (status !== google.maps.StreetViewStatus.OK) {
        // Try a different start if this one has no coverage
        console.warn('No Street View at', start.label, '– trying another location');
        startTrip();
        return;
      }
      panorama.setPano(data.location.pano);
      panorama.setPov({ heading: randomHeading(), pitch: 0 });

      const pos = data.location.latLng;
      updateRoute(pos);
      reverseGeocode(pos);
      scheduleNextHop();
    }
  );
}

/* ── Auto-drive ───────────────────────────────────────────────────────── */

function scheduleNextHop() {
  stopTimer();
  if (paused) return;
  const delay = SPEED_DELAY[parseInt(speedSlider.value, 10)] || 2500;
  driveTimer = setTimeout(driveOneStep, delay);
}

function driveOneStep() {
  if (!panorama) return;

  const links = panorama.getLinks();
  if (!links || links.length === 0) {
    // Dead end – start a new trip from a fresh random location
    console.info('Dead end reached, starting a new trip');
    startTrip();
    return;
  }

  // Choose the link whose heading is closest to our current direction,
  // avoiding sharp U-turns (> 150°).
  const forward = bestLink(links, currentHeading);
  if (!forward) {
    startTrip();
    return;
  }

  currentHeading = forward.heading;
  panorama.setPov({ heading: forward.heading, pitch: 0 });
  panorama.setPano(forward.pano);

  // Wait a tick for the panorama to update its position
  google.maps.event.addListenerOnce(panorama, 'position_changed', () => {
    const pos = panorama.getPosition();
    if (!pos) { scheduleNextHop(); return; }

    steps++;
    stepsCount.textContent = steps.toLocaleString();
    updateRoute(pos);
    reverseGeocode(pos);
    scheduleNextHop();
  });
}

/**
 * Pick the Street View link whose heading is closest to `currentHeading`,
 * but reject any link that would require a near-U-turn (diff > 150°).
 */
function bestLink(links, heading) {
  let best     = null;
  let bestDiff = Infinity;

  for (const link of links) {
    if (!link || link.pano == null) continue;
    const diff = headingDiff(link.heading, heading);
    if (diff < bestDiff && diff <= 150) {
      bestDiff = diff;
      best     = link;
    }
  }

  // If every link is a U-turn, just take the least-bad option
  if (!best) {
    for (const link of links) {
      if (!link || link.pano == null) continue;
      const diff = headingDiff(link.heading, heading);
      if (diff < bestDiff) { bestDiff = diff; best = link; }
    }
  }

  return best;
}

/** Smallest angle between two headings (0–180) */
function headingDiff(a, b) {
  const diff = Math.abs(((a - b) + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

function randomHeading() {
  return Math.floor(Math.random() * 360);
}

/* ── Route tracking ───────────────────────────────────────────────────── */

function updateRoute(latLng) {
  routeCoords.push(latLng);
  if (routePath) routePath.setPath(routeCoords);
  if (routeMarker) {
    routeMarker.setPosition(latLng);
    // Keep the marker centred in the mini-map (with some damping after 10 steps)
    if (routeCoords.length <= 10) {
      miniMap.setCenter(latLng);
    } else {
      miniMap.panTo(latLng);
    }
  }
}

/* ── Reverse geocoding ────────────────────────────────────────────────── */

let geocodeThrottle = 0;

function reverseGeocode(latLng) {
  // Throttle – geocode at most every 3 hops to stay well within quota
  geocodeThrottle++;
  if (geocodeThrottle % 3 !== 1) return;

  geocoder.geocode({ location: latLng }, (results, status) => {
    if (status !== 'OK' || !results || results.length === 0) return;

    let locality    = '';
    let adminArea   = '';
    let country     = '';
    let countryCode = '';

    for (const comp of results[0].address_components) {
      if (comp.types.includes('locality'))                locality    = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) adminArea = comp.short_name;
      if (comp.types.includes('country')) {
        country     = comp.long_name;
        countryCode = comp.short_name;
      }
    }

    locationName.classList.remove('loading');
    locationName.textContent = locality || adminArea || country || 'Unknown location';
    locationSub.textContent  = [adminArea, country].filter(Boolean).join(', ');
    locationFlag.textContent = countryCodeToFlag(countryCode);
  });
}

/** Convert ISO 3166-1 alpha-2 country code to flag emoji */
function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

/* ── Dark map style for mini-map ──────────────────────────────────────── */

function darkMapStyles() {
  return [
    { elementType: 'geometry',        stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
    { featureType: 'road',             elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'road',             elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
    { featureType: 'road.highway',     elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
    { featureType: 'water',            elementType: 'geometry', stylers: [{ color: '#0d324d' }] },
    { featureType: 'poi',              stylers: [{ visibility: 'off' }] },
    { featureType: 'transit',          stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  ];
}
