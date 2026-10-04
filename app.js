const DEFAULT_ORIGIN = { latitude: 46.7712, longitude: 23.6236 };
const PROFILE_VISITS_KEY = "fomo-place-visits-v1";

const originInput = document.querySelector("#origin");
const originSuggestions = document.querySelector("#origin-suggestions");
const originHint = document.querySelector("#origin-hint");
const locateButton = document.querySelector("#locate-button");
const eventList = document.querySelector("#event-list");
const eventCount = document.querySelector("#event-count");
const statusMessage = document.querySelector("#status-message");
const mapHint = document.querySelector("#map-hint");
const recenterButton = document.querySelector("#recenter-button");

/* ==================== HARTĂ LEAFLET ==================== */
const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
  touchZoom: true,
  minZoom: 1,
  maxZoom: 19,
})
  .setView([DEFAULT_ORIGIN.latitude, DEFAULT_ORIGIN.longitude], 13);

const baseMapLayer = L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/bright",
  attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
}).addTo(map);
const vectorMap = baseMapLayer.getMaplibreMap();

function applyFomoMapTheme() {
  if (!vectorMap.isStyleLoaded()) return;

  const layerColors = {
    background: ["background-color", "#fffdfa"],
    park: ["fill-color", "#f5d5b8"],
    "landcover-grass-park": ["fill-color", "#f9e7d7"],
    "landcover-grass": ["fill-color", "#e9eadf"],
    "landcover-wood": ["fill-color", "#dfe7d8"],
    water: ["fill-color", "#c8dce8"],
  };

  for (const [layerId, [property, color]] of Object.entries(layerColors)) {
    if (vectorMap.getLayer(layerId)) {
      vectorMap.setPaintProperty(layerId, property, color);
    }
  }
}

vectorMap.on("style.load", () => requestAnimationFrame(applyFomoMapTheme));
vectorMap.on("load", applyFomoMapTheme);
if (vectorMap.isStyleLoaded()) applyFomoMapTheme();

// 🔥 FIX CRUCIAL: forțează Leaflet să calculeze dimensiunea corect
setTimeout(() => map.invalidateSize(), 100);
window.addEventListener("resize", () => map.invalidateSize());

function updateRecenterButton() {
  if (!userLocation) {
    recenterButton.hidden = true;
    return;
  }

  const locationPoint = map.latLngToContainerPoint([userLocation.latitude, userLocation.longitude]);
  const mapCenter = map.getSize().divideBy(2);
  const zoomedOut = map.getZoom() < userLocationZoom;
  const mapMovedAway = mapCenter.distanceTo(locationPoint) > 48;
  recenterButton.hidden = !zoomedOut && !mapMovedAway;
}

map.on("moveend zoomend", updateRecenterButton);
recenterButton.addEventListener("click", () => {
  if (!userLocation) return;
  map.setView([userLocation.latitude, userLocation.longitude], userLocationZoom);
});

/* ==================== STARE GLOBALĂ ==================== */
let origin = { ...DEFAULT_ORIGIN };
let events = [];
let selectedEventId = null;
let userLocation = null;
let userLocationMarker = null;
let userLocationZoom = null;
let eventMarkers = new Map();
const locationLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
  maxClusterRadius: 34,
}).addTo(map);
let hasFitLocationBounds = false;
const locationCount = document.querySelector("#map-location-count");
let searchTimer = null;
let searchRequestId = 0;

window.FomoAppContext = {
  getEvents: () => events.map((event) => ({ ...event })),
  getOrigin: () => ({ ...origin }),
  getSelectedEventId: () => selectedEventId,
};

const voterId = (() => {
  const storageKey = "locally-voter-id";
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, id);
  }
  return id;
})();

/* ==================== UTILITARE ==================== */
function setStatus(message, state = "") {
  statusMessage.textContent = message;
  if (state) statusMessage.dataset.state = state;
  else delete statusMessage.dataset.state;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cererea către server nu a reușit.");
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

/* ==================== MARKERE ==================== */
function createEventMarker(event) {
  const markerIcon = L.divIcon({
    className: "",
    html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.tier === "paid" ? " promoted" : ""}"><span>${event.votes}</span></div></div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 39],
  });
  const marker = L.marker([event.latitude, event.longitude], { icon: markerIcon }).addTo(map);
  const popup = document.createElement("div");
  popup.className = "map-popup";
  const title = createElement("strong", "", event.title);
  const venue = createElement("span", "", event.venue);
  popup.append(title, venue);
  if (event.description) {
    popup.append(createElement("span", "map-popup-description", event.description));
  }
  popup.append(createElement("span", "popup-action", "Vezi evenimentul →"));
  marker.bindPopup(popup);
  marker.on("click", () => selectEvent(event.id, false));
  return marker;
}

function createLocationPopup(location) {
  const popup = createElement("div", "map-popup");
  popup.append(
    createElement("strong", "", location.name),
    createElement("span", "", location.city),
    createElement("span", "", location.category),
  );
  const upcomingEvents = events
    .filter((event) => event.source === "community" && event.locationId === location.id)
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
  for (const event of upcomingEvents) {
    popup.append(
      createElement("strong", "map-popup-event-title", event.title),
      createElement("span", "", formatEventDate(event.startsAt)),
    );
    if (event.description) {
      popup.append(createElement("span", "map-popup-description", event.description));
    }
  }
  if (!upcomingEvents.length) {
    popup.append(createElement("span", "map-popup-description", "Nu există evenimente verificate la această locație."));
  }
  const routeButton = createElement("button", "event-route-button", "Cum ajung? ↗");
  routeButton.type = "button";
  routeButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    window.FomoRoutePlanner.showRoute({
      title: location.name,
      venue: location.city,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    });
  });
  const transitButton = createElement("button", "event-route-button transit-route-button", "Transport public ↗");
  transitButton.type = "button";
  transitButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    window.FomoRoutePlanner.showRoute({
      title: location.name,
      venue: location.city,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    }, "TRANSIT");
  });
  const rideActions = window.FomoRideSharing.createActions({
    title: location.name,
    venue: location.city,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  });
  rideActions.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  popup.append(routeButton, transitButton, rideActions);
  return popup;
}

function setMapLocations(locations) {
  locationLayer.clearLayers();
  const validLocations = locations.filter((location) =>
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude)) &&
    Number(location.latitude) >= -90 &&
    Number(location.latitude) <= 90 &&
    Number(location.longitude) >= -180 &&
    Number(location.longitude) <= 180
  );

  for (const location of validLocations) {
    const marker = L.circleMarker(
      [Number(location.latitude), Number(location.longitude)],
      { radius: 7, className: "location-map-marker", fillColor: "#f49022", fillOpacity: 0.95, color: "#fffdf6", weight: 2.5 },
    );
    marker.bindPopup(() => createLocationPopup(location));
    marker.bindTooltip(location.name, { direction: "top", offset: [0, -7], sticky: true });
    marker.on("click", () => {
      mapHint.textContent = `${location.name} · ${location.city}`;
    });
    locationLayer.addLayer(marker);
  }

  const cities = new Set(validLocations.map((location) => location.city));
  if (locationCount) {
    locationCount.textContent = `${validLocations.length} locații · ${cities.size} orașe`;
  }
  if (!hasFitLocationBounds && validLocations.length) {
    hasFitLocationBounds = true;
    map.fitBounds(
      L.latLngBounds(validLocations.map((location) => [Number(location.latitude), Number(location.longitude)])).pad(0.08),
      { maxZoom: 7 },
    );
  }
}

function createEventCard(event) {
  const card = createElement("article", "event-card");
  card.dataset.eventId = event.id;
  if (event.id === selectedEventId) card.classList.add("selected");

  const heading = createElement("div", "event-card-heading");
  const category = createElement("span", "event-category", event.category);
  const tier = createElement(
    "span",
    `event-tier${event.tier === "paid" ? " promoted" : ""}`,
    event.tier === "paid" ? "Promovat" : "Comunitate",
  );
  heading.append(category, tier);

  const title = createElement("h3", "event-title", event.title);
  const description = createElement("p", "event-description", event.description);
  const details = createElement("div", "event-details");
  details.append(
    createElement("span", "", `${formatEventDate(event.startsAt)}`),
    createElement("span", "", event.venue),
  );

  const actions = createElement("div", "event-actions");
  const voteButton = createElement("button", `vote-button${event.votedByMe ? " voted" : ""}`);
  voteButton.type = "button";
  voteButton.setAttribute("aria-pressed", String(Boolean(event.votedByMe)));
  voteButton.append(
    createElement("span", "vote-symbol", event.votedByMe ? "♥" : "♡"),
    createElement("span", "vote-label", event.votedByMe ? `Ai votat · ${event.votes}` : `Votează · ${event.votes}`),
  );
  voteButton.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    voteButton.disabled = true;
    try {
      const result = await apiRequest(`/api/events/${encodeURIComponent(event.id)}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId }),
      });
      const updated = events.find((item) => item.id === result.eventId);
      if (updated) {
        updated.votes = result.votes;
        updated.votedByMe = result.votedByMe;
      }
      renderEvents();
      setStatus(result.votedByMe ? "Votul tău a fost înregistrat." : "Votul tău a fost retras.", "success");
    } catch (error) {
      voteButton.disabled = false;
      setStatus(error.message, "error");
    }
  });

  const routeButton = createElement("button", "event-route-button", "Cum ajung? ↗");
  routeButton.type = "button";
  routeButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    selectEvent(event.id, false);
    window.FomoRoutePlanner.showRoute(event);
  });
  const transitButton = createElement("button", "event-route-button transit-route-button", "Transport public ↗");
  transitButton.type = "button";
  transitButton.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    selectEvent(event.id, false);
    window.FomoRoutePlanner.showRoute(event, "TRANSIT");
  });
  const rideActions = window.FomoRideSharing.createActions(event);
  rideActions.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  if (event.source !== "community") actions.append(voteButton);
  actions.append(routeButton, transitButton, rideActions);
  card.append(heading, title, description, details, actions);
  card.addEventListener("click", () => selectEvent(event.id, true));
  return card;
}

function renderEvents() {
  events.sort((left, right) => right.votes - left.votes || left.title.localeCompare(right.title, "ro"));
  eventList.replaceChildren();
  eventCount.textContent = String(events.length);
  if (events.length === 0) {
    eventList.append(createElement("p", "loading-events", "Nu sunt evenimente disponibile momentan."));
    return;
  }
  for (const event of events) eventList.append(createEventCard(event));

  for (const [id, marker] of eventMarkers) {
    const event = events.find((item) => item.id === id);
    if (!event) continue;
    marker.setIcon(L.divIcon({
      className: "",
      html: `<div class="event-map-marker-wrap"><div class="event-map-marker${event.id === selectedEventId ? " active" : ""}${event.tier === "paid" ? " promoted" : ""}"><span>${event.votes}</span></div></div>`,
      iconSize: [36, 42],
      iconAnchor: [18, 39],
    }));
  }
}

function selectEvent(eventId, openPopup) {
  selectedEventId = eventId;
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  if (openPopup) recordPlaceVisit(event);
  renderEvents();
  const marker = eventMarkers.get(eventId);
  if (marker) {
    map.panTo(marker.getLatLng());
    if (openPopup) marker.openPopup();
  }
  mapHint.textContent = `${event.title} · ${event.venue}`;
}

function recordPlaceVisit(event) {
  try {
    const storedVisits = localStorage.getItem(PROFILE_VISITS_KEY);
    const visits = storedVisits ? JSON.parse(storedVisits) : [];
    if (!Array.isArray(visits)) throw new Error("Stored place visits are not a list.");
    const venue = String(event.venue || "").trim();
    if (!venue) return;

    const existingVisit = visits.find((visit) => visit.venue === venue);
    if (existingVisit) {
      existingVisit.count += 1;
      existingVisit.eventTitle = event.title;
      existingVisit.lastVisited = new Date().toISOString();
    } else {
      visits.push({
        venue,
        eventTitle: event.title,
        count: 1,
        lastVisited: new Date().toISOString(),
      });
    }
    localStorage.setItem(PROFILE_VISITS_KEY, JSON.stringify(visits));
  } catch (error) {
    console.error("Could not save local place visits.", error);
    setStatus("Nu am putut salva activitatea profilului în acest browser.", "error");
  }
}

window.FomoSearch = {
  search(query, category = "all") {
    const normalizedQuery = query.trim().toLocaleLowerCase("ro");
    return events.filter((event) =>
      (category === "all" || matchesEventCategory(event.category, category)) &&
      (!normalizedQuery || [event.title, event.venue, event.category, event.description]
        .some((value) => String(value || "").toLocaleLowerCase("ro").includes(normalizedQuery)))
    );
  },
  select(eventId) {
    selectEvent(eventId, true);
  },
};

function matchesEventCategory(category, filter) {
  const normalizedCategory = String(category || "").toLocaleLowerCase("ro");
  const categoryTerms = {
    restaurants: ["food", "drink", "restaurant", "culinar", "gastronom"],
    music: ["muzic", "music", "concert", "dj"],
    meetups: ["social", "întâln", "intaln", "meetup", "network"],
    outdoor: ["outdoor", "alerg", "sport", "drume", "natur"],
    film: ["film", "cinema", "proiec"],
  };
  if (filter === "other") {
    return !Object.values(categoryTerms).some((terms) =>
      terms.some((term) => normalizedCategory.includes(term))
    );
  }
  return (categoryTerms[filter] || []).some((term) => normalizedCategory.includes(term));
}

async function loadEvents() {
  const data = await apiRequest(`/api/events?voterId=${encodeURIComponent(voterId)}`);
  const communityEvents = events.filter((event) => event.source === "community");
  events = data.events.concat(communityEvents);
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
  if (events.length && !userLocation) {
    const bounds = L.latLngBounds(events.map((event) => [event.latitude, event.longitude]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
  }
}

async function searchPlaces(query) {
  const data = await apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
  return data.results;
}

function hideSuggestions() {
  originSuggestions.hidden = true;
  originSuggestions.replaceChildren();
}

function showSuggestions(results) {
  originSuggestions.replaceChildren();
  for (const result of results) {
    const item = createElement("li");
    const button = createElement("button", "", result.displayName);
    button.type = "button";
    button.setAttribute("role", "option");
    button.addEventListener("click", () => {
      originInput.value = result.displayName;
      originInput.dataset.selectedQuery = result.displayName;
      origin = { latitude: Number(result.latitude), longitude: Number(result.longitude) };
      originHint.textContent = "Punct de plecare selectat";
      hideSuggestions();
      setStatus("Locația de plecare a fost actualizată.", "success");
    });
    item.append(button);
    originSuggestions.append(item);
  }
  originSuggestions.hidden = results.length === 0;
}

originInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = originInput.value.trim();
  if (query !== originInput.dataset.selectedQuery) {
    delete originInput.dataset.selectedQuery;
  }
  const requestId = ++searchRequestId;
  if (query.length < 3) {
    hideSuggestions();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchPlaces(query);
      if (requestId === searchRequestId) showSuggestions(results);
    } catch (error) {
      if (requestId === searchRequestId) {
        hideSuggestions();
        setStatus(error.message, "error");
      }
    }
  }, 700);
});

originInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideSuggestions();
  if (event.key === "Enter" && !originSuggestions.hidden) {
    const firstSuggestion = originSuggestions.querySelector("button");
    if (firstSuggestion) {
      event.preventDefault();
      firstSuggestion.click();
    }
  }
});

document.addEventListener("click", (event) => {
  if (!originSuggestions.parentElement.contains(event.target)) hideSuggestions();
});

function locateUser(isAutomatic = false) {
  if (!navigator.geolocation) {
    setStatus("Browserul nu oferă acces la locație. Caută adresa de plecare în câmp.", "error");
    return;
  }
  if (!isAutomatic) locateButton.disabled = true;
  setStatus("Se determină locația ta...");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      origin = { latitude: coords.latitude, longitude: coords.longitude };
      userLocation = { ...origin };
      originInput.value = "";
      delete originInput.dataset.selectedQuery;
      originHint.textContent = "Folosim locația ta actuală";
      locateButton.disabled = false;
      map.setView([origin.latitude, origin.longitude], 14);
      userLocationZoom = map.getZoom();
      const userLocationIcon = L.divIcon({
        className: "",
        html: '<div class="user-map-marker"><span></span></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (userLocationMarker) {
        userLocationMarker.setLatLng([userLocation.latitude, userLocation.longitude]);
      } else {
        userLocationMarker = L.marker([userLocation.latitude, userLocation.longitude], {
          icon: userLocationIcon,
          zIndexOffset: 1000,
          interactive: false,
        }).addTo(map);
      }
      updateRecenterButton();
      setStatus("Locația ta a fost setată ca punct de plecare.", "success");
    },
    (error) => {
      locateButton.disabled = false;
      const message = error.code === error.PERMISSION_DENIED
        ? "Accesul la locație a fost refuzat. Permite locația în browser sau introdu manual adresa."
        : "Nu am putut determina locația. Verifică setările browserului sau introdu manual adresa.";
      setStatus(message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

locateButton.addEventListener("click", () => locateUser());

window.FomoRouteContext = {
  apiRequest,
  formatDistance: (meters) => meters >= 1000
    ? `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(meters / 1000)} km`
    : `${Math.round(meters)} m`,
  formatDuration: (seconds) => {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours === 0) return `${minutes} min`;
    return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  },
  getEventMarker: (eventId) => eventMarkers.get(eventId),
  map,
  mapHint,
  originInput,
  originHint,
  getOrigin: () => ({ ...origin }),
  setOrigin: (nextOrigin) => {
    origin = nextOrigin;
  },
  setStatus,
};

window.FomoRefreshCommunityEvents = (communityEvents) => {
  events = events.filter((event) => event.source !== "community").concat(communityEvents);
  for (const marker of eventMarkers.values()) map.removeLayer(marker);
  eventMarkers = new Map(events.map((event) => [event.id, createEventMarker(event)]));
  renderEvents();
};

window.FomoSetLocations = setMapLocations;

async function initialize() {
  try {
    await apiRequest("/health");
    await loadEvents();
    setStatus("Backend conectat. Calculează ruta auto pe hartă sau deschide transportul public în Google Maps.", "success");
  } catch (error) {
    eventList.replaceChildren(createElement("p", "loading-events", "Nu am putut încărca evenimentele."));
    setStatus(`${error.message} Pornește backendul cu .\\start.ps1.`, "error");
  }
}

initialize();
locateUser(true);
