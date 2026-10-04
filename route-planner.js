(function () {
  const context = window.FomoRouteContext;
  let routeLayer = null;
  let startMarker = null;
  let destinationMarker = null;
  const cancelButton = document.querySelector("#cancel-route-button");

  function createMarkerIcon(label, isDestination = false) {
    return L.divIcon({
      className: "",
      html: `<div class="route-marker${isDestination ? " destination" : ""}"><span>${label}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 27],
    });
  }

  async function resolveOrigin() {
    const query = context.originInput.value.trim();
    if (query && query !== context.originInput.dataset.selectedQuery) {
      const results = await context.searchPlaces(query);
      const result = results[0];
      if (!result) {
        throw new Error(`Nu am găsit locația „${query}”. Încearcă o adresă sau un oraș mai precis.`);
      }
      const selectedOrigin = {
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
      };
      if (!Number.isFinite(selectedOrigin.latitude) || !Number.isFinite(selectedOrigin.longitude)) {
        throw new Error("Serviciul de căutare a întors coordonate invalide.");
      }
      context.originInput.value = result.displayName;
      context.originInput.dataset.selectedQuery = result.displayName;
      context.originHint.textContent = "Punct de plecare selectat";
      context.setOrigin(selectedOrigin);
    }

    const selectedOrigin = context.getOrigin();
    if (!Number.isFinite(selectedOrigin.latitude) || !Number.isFinite(selectedOrigin.longitude)) {
      throw new Error("Alege o locație de plecare sau folosește locația ta.");
    }
    return selectedOrigin;
  }

  async function requestHostedRoute(origin, destination) {
    const coordinates = [
      origin.longitude,
      origin.latitude,
      destination.longitude,
      destination.latitude,
    ];
    if (!coordinates.every(Number.isFinite)) {
      throw new Error("Coordonatele punctelor de plecare și destinație sunt invalide.");
    }

    const [originLongitude, originLatitude, destinationLongitude, destinationLatitude] = coordinates;
    const url = `https://router.project-osrm.org/route/v1/driving/${originLongitude},${originLatitude};${destinationLongitude},${destinationLatitude}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Serviciul public de rutare nu este disponibil (HTTP ${response.status}).`);
    }

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry) {
      throw new Error("Serviciul public nu a găsit o rută între aceste puncte.");
    }
    return { geometry: data.routes[0].geometry };
  }

  function clearRoute() {
    if (routeLayer) context.map.removeLayer(routeLayer);
    if (startMarker) context.map.removeLayer(startMarker);
    if (destinationMarker) context.map.removeLayer(destinationMarker);
    routeLayer = null;
    startMarker = null;
    destinationMarker = null;
  }

  function cancelRoute() {
    clearRoute();
    cancelButton.hidden = true;
    context.mapHint.textContent = "";
    context.setStatus("Traseul a fost anulat. Punctul de plecare a rămas setat.", "success");
  }

  function openGoogleMaps(destination) {
    const params = new URLSearchParams({
      api: "1",
      destination: `${destination.latitude},${destination.longitude}`,
      travelmode: "transit",
    });
    const originText = context.originInput.value.trim();
    const selectedOrigin = context.getOrigin();
    if (originText && originText !== context.originInput.dataset.selectedQuery) {
      params.set("origin", originText);
    } else if (Number.isFinite(selectedOrigin.latitude) && Number.isFinite(selectedOrigin.longitude)) {
      params.set("origin", `${selectedOrigin.latitude},${selectedOrigin.longitude}`);
    }
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer");
    context.setStatus("Se deschid indicațiile de transport public în Google Maps.", "success");
    return true;
  }

  async function showRoute(destination, travelMode = "DRIVE") {
    if (travelMode === "TRANSIT") {
      try {
        return openGoogleMaps(destination);
      } catch (error) {
        context.setStatus(error.message || "Nu am putut deschide Google Maps.", "error");
        return false;
      }
    }

    context.setStatus(`Calculăm traseul către ${destination.title}...`);
    context.mapHint.textContent = "";
    document.querySelectorAll(".event-route-button").forEach((button) => {
      button.disabled = true;
    });

    try {
      const start = await resolveOrigin();
      const coordinates = {
        origin: start,
        destination: {
          latitude: Number(destination.latitude),
          longitude: Number(destination.longitude),
        },
      };
      const route = context.isGitHubPages()
        ? await requestHostedRoute(coordinates.origin, coordinates.destination)
        : await context.apiRequest("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(coordinates),
        });
      if (!route.geometry || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) {
        throw new Error("Serviciul de rute nu a întors geometria traseului.");
      }

      clearRoute();
      routeLayer = L.geoJSON(route.geometry, {
        style: { color: "#d9741a", weight: 6, opacity: 0.94, lineCap: "round", lineJoin: "round" },
      }).addTo(context.map);
      startMarker = L.marker([start.latitude, start.longitude], {
        icon: createMarkerIcon("A"),
      }).addTo(context.map);
      destinationMarker = L.marker([coordinates.destination.latitude, coordinates.destination.longitude], {
        icon: createMarkerIcon("E", true),
      }).addTo(context.map);
      cancelButton.hidden = false;

      const bounds = L.featureGroup([routeLayer]).getBounds();
      context.map.fitBounds(bounds.pad(0.16), { maxZoom: 15 });
      context.mapHint.textContent = "";
      context.setStatus("Ruta este afișată pe hartă.", "success");

      const eventMarker = context.getEventMarker(destination.id);
      if (eventMarker) eventMarker.closePopup();
      return true;
    } catch (error) {
      context.mapHint.textContent = `${destination.title} · ${destination.venue}`;
      context.setStatus(error.message || "Nu am putut calcula traseul.", "error");
      return null;
    } finally {
      document.querySelectorAll(".event-route-button").forEach((button) => {
        button.disabled = false;
      });
    }
  }

  cancelButton.addEventListener("click", cancelRoute);
  window.FomoRoutePlanner = { showRoute, cancelRoute };
})();
