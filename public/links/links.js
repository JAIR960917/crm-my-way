(function () {
  "use strict";

  var listEl = document.getElementById("links-list");
  var emptyEl = document.getElementById("empty-state");
  var logoEl = document.getElementById("logo");
  var nameEl = document.getElementById("system-name");

  function getConfig() {
    var cfg = window.__CRM_RUNTIME_CONFIG__ || {};
    return {
      supabaseUrl: (cfg.supabaseUrl || "").replace(/\/$/, ""),
      anonKey: cfg.supabasePublishableKey || "",
    };
  }

  function resolveLogoUrl(logoUrl, supabaseUrl) {
    if (!logoUrl) return "";
    var url = logoUrl.trim();
    if (!url) return "";
    var base = (supabaseUrl || "").replace(/\/$/, "");
    var pathPart = url.split("?")[0];
    var query = url.indexOf("?") >= 0 ? url.slice(url.indexOf("?")) : "";

    if (/^https?:\/\//i.test(pathPart)) {
      var legacy = pathPart.match(/^https?:\/\/[^/]*supabase\.co(\/.*)$/i);
      if (legacy && base) return base + legacy[1] + query;
      var storageOther = pathPart.match(/^https?:\/\/[^/]+(\/storage\/v1\/.+)$/i);
      if (storageOther && base && pathPart.indexOf(base) !== 0) {
        return base + storageOther[1] + query;
      }
      return url;
    }
    if (pathPart.indexOf("/storage/") === 0 && base) {
      return base + pathPart + query;
    }
    return url;
  }

  function applyColors(bgColor, cardColor) {
    var root = document.documentElement;
    if (bgColor) root.style.setProperty("--pg-bg", bgColor);
    if (cardColor) root.style.setProperty("--pg-card", cardColor);
  }

  function renderLinks(links, supabaseUrl) {
    listEl.innerHTML = "";
    var hasAny = links && links.length > 0;
    if (!hasAny) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    links.forEach(function (link) {
      var type = link.link_type || "link";

      if (type === "header") {
        var h = document.createElement("p");
        h.className = "link-header";
        h.textContent = link.label || "";
        listEl.appendChild(h);
        return;
      }

      if (type === "banner") {
        var url = resolveLogoUrl(link.url || "", supabaseUrl);
        if (!url) return;
        var wrap = document.createElement("div");
        wrap.className = "link-banner";
        var img = document.createElement("img");
        img.src = url;
        img.alt = link.label || "";
        img.loading = "lazy";
        wrap.appendChild(img);
        listEl.appendChild(wrap);
        return;
      }

      if (type === "title") {
        var t = document.createElement("p");
        t.className = "link-title";
        t.textContent = link.label || "";
        listEl.appendChild(t);
        return;
      }

      if (type === "paragraph") {
        var p = document.createElement("p");
        p.className = "link-paragraph";
        p.textContent = link.label || "";
        listEl.appendChild(p);
        return;
      }

      // Default: link (pill button)
      var a = document.createElement("a");
      a.className = "link-item";
      a.href = link.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.label || "";
      listEl.appendChild(a);
    });
  }

  async function load() {
    var cfg = getConfig();
    if (!cfg.supabaseUrl || !cfg.anonKey) {
      renderLinks([], "");
      return;
    }
    try {
      var url = cfg.supabaseUrl + "/functions/v1/get-company-links";
      var res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + cfg.anonKey,
          apikey: cfg.anonKey,
        },
      });
      if (!res.ok) {
        renderLinks([], "");
        return;
      }
      var data = await res.json();

      var name = (data.system_name || "Joonker").replace(/^CRM\s+/i, "");
      nameEl.textContent = name;
      document.title = name;

      applyColors(data.bg_color || "", data.card_color || "");

      var logoUrl = resolveLogoUrl(data.logo_url || "", cfg.supabaseUrl);
      logoEl.hidden = !logoUrl;
      if (logoUrl) {
        logoEl.src = logoUrl;
        logoEl.alt = name;
        var favicon = document.getElementById("page-favicon");
        if (favicon) favicon.href = logoUrl;
      }

      renderLinks(data.links || [], cfg.supabaseUrl);
    } catch (_err) {
      renderLinks([], "");
    }
  }

  load();
})();
