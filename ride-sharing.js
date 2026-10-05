(function () {
  const context = window.FomoRouteContext;
  let nextMenuId = 0;

  function createUberUrl(destination) {
    const latitude = Number(destination.latitude);
    const longitude = Number(destination.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("Destinația nu are coordonate valide pentru o cursă.");
    }

    const dropoff = {
      latitude,
      longitude,
      addressLine1: String(destination.title || "Eveniment FOMO").slice(0, 100),
      addressLine2: String(destination.venue || "").slice(0, 160),
    };
    const params = new URLSearchParams();
    const origin = context.getOrigin();
    if (
      Number.isFinite(origin.latitude) &&
      Number.isFinite(origin.longitude) &&
      origin.latitude >= -90 &&
      origin.latitude <= 90 &&
      origin.longitude >= -180 &&
      origin.longitude <= 180
    ) {
      params.set("pickup", JSON.stringify({
        latitude: origin.latitude,
        longitude: origin.longitude,
      }));
    }
    params.set("drop[0]", JSON.stringify(dropoff));
    return `https://m.uber.com/looking?${params.toString()}`;
  }

  function createActions(destination) {
    const wrapper = document.createElement("div");
    wrapper.className = "ride-sharing";

    const toggle = document.createElement("button");
    toggle.className = "event-route-button ride-sharing-toggle";
    toggle.type = "button";
    toggle.textContent = "Comandă o cursă";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", `Alege un serviciu de ridesharing pentru ${destination.title}`);

    const menu = document.createElement("div");
    menu.className = "ride-sharing-menu";
    menu.id = `ride-sharing-menu-${++nextMenuId}`;
    menu.hidden = true;
    toggle.setAttribute("aria-controls", menu.id);

    const uberButton = document.createElement("button");
    uberButton.className = "ride-sharing-provider";
    uberButton.type = "button";
    uberButton.textContent = "Deschide Uber ↗";
    uberButton.addEventListener("click", () => {
      try {
        const uberUrl = createUberUrl(destination);
        window.open(uberUrl, "_blank", "noopener,noreferrer");
        context.setStatus("Se deschide Uber cu destinația selectată. Verifică detaliile și prețul în aplicație.", "success");
      } catch (error) {
        context.setStatus(error.message || "Nu am putut pregăti linkul Uber.", "error");
      }
    });

    const boltButton = document.createElement("button");
    boltButton.className = "ride-sharing-provider";
    boltButton.type = "button";
    boltButton.textContent = "Bolt · disponibil după parteneriat";
    boltButton.disabled = true;
    boltButton.title = "Bolt nu publică un deeplink verificat pentru această integrare. Activarea necesită documentație și acces oficial de partener.";

    const note = document.createElement("p");
    note.className = "ride-sharing-note";
    note.textContent = "FOMO nu rezervă cursa și nu afișează prețuri. Confirmarea se face în aplicația furnizorului.";

    menu.append(uberButton, boltButton, note);
    toggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
    });

    wrapper.append(toggle, menu);
    return wrapper;
  }

  window.FomoRideSharing = { createActions };
})();
