(function () {
  const xpByAction = {
    event_created: 50,
    event_joined: 30,
    friend_connected: 15,
  };

  async function awardXp(actionType, actionId) {
    const api = window.FomoFirebase;
    const user = api && api.user();
    if (!api || !api.configured || !user) {
      throw new Error("Autentifică-te pentru a primi XP.");
    }
    if (!user.emailVerified) {
      throw new Error("Confirmă adresa de email înainte să primești XP.");
    }
    if (!Object.prototype.hasOwnProperty.call(xpByAction, actionType)) {
      throw new Error("Acțiunea nu oferă XP.");
    }
    if (typeof actionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(actionId)) {
      throw new Error("Identificatorul acțiunii nu este valid.");
    }
    if (!window.FomoRouteContext || typeof window.FomoRouteContext.apiRequest !== "function") {
      throw new Error("Backendul pentru XP nu este disponibil în această pagină.");
    }

    const idToken = await user.getIdToken(true);
    const result = await window.FomoRouteContext.apiRequest(
      `/api/users/${encodeURIComponent(user.uid)}/xp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ actionType, actionId }),
      },
    );
    if (window.FomoProfileXPBar) await window.FomoProfileXPBar.refresh();
    return {
      ...result,
      xpAwarded: result.alreadyAwarded ? 0 : xpByAction[actionType],
    };
  }

  window.FomoGamification = { awardXp };
})();
