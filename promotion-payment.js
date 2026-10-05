(function () {
  const api = window.FomoFirebase;
  const eventId = new URLSearchParams(window.location.search).get("eventId");
  const status = document.querySelector("#promotion-payment-status");
  const details = document.querySelector("#promotion-event-details");
  const title = document.querySelector("#promotion-event-title");
  const venue = document.querySelector("#promotion-event-venue");
  const ticketPrice = document.querySelector("#promotion-event-ticket-price");
  const promotionFee = document.querySelector("#promotion-fee");
  const ownerNote = document.querySelector("#promotion-owner-note");
  const simulateButton = document.querySelector("#promotion-simulate-button");
  let currentEvent = null;
  let eventOwnerUid = null;
  let isOwner = false;

  function money(cents) {
    return `${(cents / 100).toFixed(2)} RON`;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.state = isError ? "error" : "success";
  }

  function renderUserState(user) {
    if (!currentEvent) return;
    isOwner = Boolean(user && eventOwnerUid === user.uid);
    const canRequest = Boolean(user?.emailVerified && isOwner);
    simulateButton.disabled = !canRequest || currentEvent.promotionStatus === "requested" ||
      currentEvent.promotionStatus === "paid";
    ownerNote.hidden = canRequest;
    if (!canRequest) {
      ownerNote.textContent = user?.emailVerified
        ? "Doar ownerul locației poate solicita promovarea acestui eveniment."
        : "Autentifică-te cu email confirmat și cont de owner pentru a trimite cererea.";
    }
    if (currentEvent.promotionStatus === "requested") {
      setStatus("Cererea de promovare a fost deja trimisă administratorului.");
    } else if (currentEvent.promotionStatus === "paid") {
      setStatus("Evenimentul este deja promovat.");
    }
  }

  async function loadEvent() {
    if (!eventId) throw new Error("Lipsește identificatorul evenimentului.");
    if (!api?.configured) throw new Error("Firebase nu este configurat.");

    const snapshot = await api.db.ref(`communityEvents/${eventId}`).once("value");
    if (!snapshot.exists()) throw new Error("Evenimentul nu a fost găsit.");
    currentEvent = snapshot.val();
    if (currentEvent.status !== "approved") {
      throw new Error("Doar evenimentele aprobate pot solicita promovarea.");
    }
    if (!Number.isSafeInteger(currentEvent.ticketPriceCents) || currentEvent.ticketPriceCents <= 0) {
      throw new Error("Promovarea este disponibilă pentru evenimente cu bilet plătit.");
    }

    title.textContent = currentEvent.title;
    venue.textContent = `${currentEvent.venue}, ${currentEvent.city}`;
    ticketPrice.textContent = `Preț bilet: ${money(currentEvent.ticketPriceCents)}`;
    promotionFee.textContent = `Taxă de promovare demo (5%): ${money(Math.round(currentEvent.ticketPriceCents * 5 / 100))}`;
    details.hidden = false;

    const locations = await api.locations();
    const location = locations.find((item) => item.id === currentEvent.locationId);
    eventOwnerUid = location?.ownerUid || null;
    renderUserState(api.user());
  }

  simulateButton.addEventListener("click", async () => {
    const user = api?.user();
    if (!user?.emailVerified || !isOwner || !currentEvent) {
      setStatus("Autentifică-te cu email confirmat în contul ownerului locației.", true);
      return;
    }
    simulateButton.disabled = true;
    try {
      await api.db.ref(`communityEvents/${eventId}`).update({
        promotionStatus: "requested",
        promotionRequestedAt: firebase.database.ServerValue.TIMESTAMP,
        promotionRequestedBy: user.uid,
      });
      currentEvent.promotionStatus = "requested";
      setStatus("Simularea a reușit. Nu s-a făcut nicio plată; cererea a fost trimisă administratorului.");
      ownerNote.hidden = false;
      ownerNote.textContent = "Administratorul trebuie să confirme manual promovarea demo.";
    } catch (error) {
      console.error("Could not submit demo promotion request.", error);
      setStatus(`Nu am putut trimite cererea: ${error.message}`, true);
      simulateButton.disabled = false;
    }
  });

  window.addEventListener("fomo-firebase-ready", () => {
    loadEvent().catch((error) => {
      console.error("Could not load promotion demo.", error);
      setStatus(error.message, true);
    });
    api?.auth?.onAuthStateChanged(renderUserState);
  });

  if (api?.configured) {
    loadEvent().catch((error) => {
      console.error("Could not load promotion demo.", error);
      setStatus(error.message, true);
    });
    api.auth.onAuthStateChanged(renderUserState);
  }
})();
