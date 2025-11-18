// ==UserScript==
// @name         Mathspace GraphQL Overrides (Conditional Multi-endpoint)
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Intercept GraphQL endpoints and apply overrides only if missing or different
// @match        https://mathspace.co/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const interceptKeys = [
        "ShopModalQuery",
        "SunflowerUserMenuStudentQuery",
        "NavbarPopoverQuery",
        "StudentNavbarQuery",
        "SunflowerStudentDashboardQuery",
        "NewFeaturesPopupListQuery",
        "EnsureStudentHasCompletedOnboardingQuery",
        "StudentContextLanternQuery",
        "ViewerProviderQuery"
      ];

      const overrides = {
  // coinsBalance: 987654321,
  dailyCoinAwardOptions: [200, 200, 200],
  hasAwardedDailyCoins : false
  // todaysDailyCoinAward: 67
  // avatar: "https://example.com/my-avatar.png",
  // hasClaimedStartingCoins: false
};


      function applyOverridesIfNeeded(obj) {
        if (obj === null || typeof obj !== "object") return obj;

        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            obj[k] = applyOverridesIfNeeded(obj[k]);
          }
        }

        for (const key in overrides) {
          if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] !== overrides[key]) {
            obj[key] = overrides[key];
          }
        }

        return obj;
      }

      const origFetch = window.fetch;
      window.fetch = new Proxy(origFetch, {
        apply(target, thisArg, args) {
          const [reqOrUrl] = args;
          const url = typeof reqOrUrl === "string" ? reqOrUrl : (reqOrUrl && reqOrUrl.url) || "";
          const isTarget = interceptKeys.some(k => url.includes(k));
          if (!isTarget) return Reflect.apply(target, thisArg, args);

          return Reflect.apply(target, thisArg, args).then(async (resp) => {
            try {
              const text = await resp.clone().text();
              let data;
              try { data = JSON.parse(text); } catch { return resp; }
              const modified = applyOverridesIfNeeded(data);
              const body = JSON.stringify(modified);
              const headers = new Headers(resp.headers || undefined);
              headers.set("Content-Type", "application/json");
              headers.delete("Content-Length");
              return new Response(body, {
                status: resp.status,
                statusText: resp.statusText,
                headers
              });
            } catch {
              return resp;
            }
          });
        }
      });

      const OrigXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new OrigXHR();
        let url = "";

        const origOpen = xhr.open;
        xhr.open = function(method, u, ...rest) {
          url = u || "";
          return origOpen.call(this, method, u, ...rest);
        };

        const origSend = xhr.send;
        xhr.send = function(body) {
          const rewrite = () => {
            try {
              if (xhr.readyState === 4 && typeof xhr.responseText === "string") {
                const isTarget = interceptKeys.some(k => url.includes(k));
                if (!isTarget) return;
                const text = xhr.responseText;
                let parsed;
                try { parsed = JSON.parse(text); } catch { return; }
                const modified = applyOverridesIfNeeded(parsed);
                const newText = JSON.stringify(modified);
                Object.defineProperty(xhr, "responseText", { configurable: true, get: () => newText });
                Object.defineProperty(xhr, "response", { configurable: true, get: () => newText });
              }
            } catch {}
          };
          xhr.addEventListener("readystatechange", rewrite);
          return origSend.call(this, body);
        };

        return xhr;
      };
    })();
  `;
  document.documentElement.appendChild(script);
})();
