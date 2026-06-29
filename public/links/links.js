(function () {
  "use strict";

  var listEl = document.getElementById("links-list");
  var emptyEl = document.getElementById("empty-state");
  var logoEl = document.getElementById("logo");
  var nameEl = document.getElementById("system-name");

  var ICONS = {
    instagram:
      '<svg viewBox="0 0 24 24"><path d="M12 2c2.7 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.46.66.26 1.21.6 1.76 1.15.55.55.9 1.1 1.15 1.76.24.64.41 1.37.46 2.43.05 1.06.06 1.42.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.46 2.43a4.9 4.9 0 0 1-1.15 1.76 4.9 4.9 0 0 1-1.76 1.15c-.64.24-1.37.41-2.43.46-1.06.05-1.42.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.46a4.9 4.9 0 0 1-1.76-1.15 4.9 4.9 0 0 1-1.15-1.76c-.24-.64-.41-1.37-.46-2.43C2.01 15.06 2 14.7 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.46-2.43.26-.66.6-1.21 1.15-1.76A4.9 4.9 0 0 1 5.43 2.54c.64-.24 1.37-.41 2.43-.46C8.94 2.01 9.3 2 12 2zm0 1.8c-2.65 0-2.98.01-4.02.06-.86.04-1.33.18-1.64.3-.41.16-.7.35-1.01.66-.31.31-.5.6-.66 1.01-.12.31-.26.78-.3 1.64C4.31 9.02 4.3 9.35 4.3 12s.01 2.98.06 4.02c.04.86.18 1.33.3 1.64.16.41.35.7.66 1.01.31.31.6.5 1.01.66.31.12.78.26 1.64.3 1.04.05 1.37.06 4.02.06s2.98-.01 4.02-.06c.86-.04 1.33-.18 1.64-.3.41-.16.7-.35 1.01-.66.31-.31.5-.6.66-1.01.12-.31.26-.78.3-1.64.05-1.04.06-1.37.06-4.02s-.01-2.98-.06-4.02c-.04-.86-.18-1.33-.3-1.64a2.7 2.7 0 0 0-.66-1.01 2.7 2.7 0 0 0-1.01-.66c-.31-.12-.78-.26-1.64-.3C14.98 3.81 14.65 3.8 12 3.8zm0 3.05a5.15 5.15 0 1 1 0 10.3 5.15 5.15 0 0 1 0-10.3zm0 1.8a3.35 3.35 0 1 0 0 6.7 3.35 3.35 0 0 0 0-6.7zm5.4-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24"><path d="M12.04 2c-5.5 0-10 4.49-10 10 0 1.76.46 3.45 1.32 4.95L2 22l5.2-1.36A9.96 9.96 0 0 0 12.04 22c5.5 0 10-4.49 10-10s-4.5-10-10-10zm0 18.18c-1.6 0-3.16-.43-4.52-1.24l-.32-.19-3.08.81.82-3-.21-.32a8.17 8.17 0 0 1-1.27-4.42c0-4.52 3.68-8.2 8.2-8.2 4.52 0 8.2 3.68 8.2 8.2 0 4.52-3.68 8.2-8.2 8.2zm4.51-6.13c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.12-.56.12-.16.25-.64.8-.79.97-.15.16-.29.18-.54.06-1.46-.73-2.42-1.3-3.38-2.96-.26-.44.26-.41.74-1.36.08-.16.04-.31-.03-.43-.07-.12-.62-1.49-.85-2.04-.22-.53-.45-.46-.61-.46-.16 0-.34-.01-.52-.01-.18 0-.47.07-.71.34-.25.27-.94.92-.94 2.24 0 1.32.96 2.6 1.1 2.78.13.18 1.84 2.8 4.46 3.82 2.21.85 2.66.69 3.14.64.48-.05 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.24-.16-.5-.28z"/></svg>',
    facebook:
      '<svg viewBox="0 0 24 24"><path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.13 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.19 2.24.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.45 2.9h-2.33V22c4.78-.8 8.44-4.93 8.44-9.93z"/></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24"><path d="M16.6 5.82a4.28 4.28 0 0 1-3.07-1.27V14.6a5.18 5.18 0 1 1-4.45-5.12v2.5a2.7 2.7 0 1 0 1.9 2.58V2h2.45a4.28 4.28 0 0 0 3.17 4.12v-.3z"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24"><path d="M23.5 7.2s-.23-1.64-.94-2.36c-.9-.94-1.9-.94-2.36-1C17.06 3.6 12 3.6 12 3.6h-.01s-5.05 0-8.2.24c-.46.05-1.46.06-2.36 1C.71 5.56.49 7.2.49 7.2S.24 9.13.24 11.06v1.81c0 1.93.25 3.86.25 3.86s.22 1.64.93 2.36c.9.95 2.08.92 2.6 1.02 1.9.18 8.06.24 8.06.24s5.06-.01 8.21-.25c.46-.06 1.46-.07 2.36-1.02.71-.72.94-2.36.94-2.36s.25-1.93.25-3.86v-1.81c0-1.93-.25-3.86-.25-3.86zM9.55 14.93V8.6l5.91 3.17-5.91 3.16z"/></svg>',
    site:
      '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.4 15.4 0 0 0-1.39-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.9 3.96h-3.8c.42-1.43 1.07-2.76 1.9-3.96zM4.26 14a8.1 8.1 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4H4.26zm.81 2h2.95c.32 1.25.79 2.45 1.39 3.56A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.34-3.56A15.4 15.4 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.9-3.96h3.8c-.42 1.43-1.07 2.76-1.9 3.96zM14.36 14H9.64a14.6 14.6 0 0 1 0-4h4.72a14.6 14.6 0 0 1 0 4zm.25 5.56c.6-1.11 1.07-2.31 1.39-3.56h2.95a8.03 8.03 0 0 1-4.34 3.56zM16.36 14a16.6 16.6 0 0 0 0-4h3.38a8.1 8.1 0 0 1 0 4h-3.38z"/></svg>',
    copa:
      '<svg viewBox="0 0 24 24"><path d="M5 3h14v2h2v2a4 4 0 0 1-4 4h-.18A6 6 0 0 1 13 15.92V18h3v2H8v-2h3v-2.08A6 6 0 0 1 7.18 11H7a4 4 0 0 1-4-4V5h2V3zm0 4v0a2 2 0 0 0 2 2v-2H5zm12 2a2 2 0 0 0 2-2V7h-2v2z"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.36 2.33.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.56 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z"/></svg>',
    email:
      '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    location:
      '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    link:
      '<svg viewBox="0 0 24 24"><path d="M10.59 13.41a1 1 0 0 1 0-1.41l3-3a1 1 0 1 1 1.41 1.41l-3 3a1 1 0 0 1-1.41 0zm-2.83 2.83a3 3 0 0 1 0-4.24l3-3a3 3 0 0 1 4.24 0 1 1 0 1 1-1.41 1.41 1 1 0 0 0-1.41 0l-3 3a1 1 0 0 0 0 1.41 1 1 0 1 1-1.42 1.42zm9.9-2.83-3 3a3 3 0 0 1-4.24 0 1 1 0 1 1 1.41-1.41 1 1 0 0 0 1.42 0l3-3a1 1 0 0 0 0-1.42 1 1 0 1 1 1.41-1.41 3 3 0 0 1 0 4.24z"/></svg>',
  };

  var DEFAULT_COLORS = {
    instagram: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af,#515bd4)",
    whatsapp: "#25d366",
    facebook: "#1877f2",
    tiktok: "#000000",
    youtube: "#ff0000",
    site: "#2563eb",
    copa: "#c0162c",
    phone: "#10b981",
    email: "#6366f1",
    location: "#f59e0b",
    link: "#c0162c",
  };

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

  function renderLinks(links) {
    listEl.innerHTML = "";
    if (!links || links.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    links.forEach(function (link) {
      var a = document.createElement("a");
      a.className = "link-item";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      var iconKey = ICONS[link.icon] ? link.icon : "link";
      var iconWrap = document.createElement("span");
      iconWrap.className = "link-icon";
      iconWrap.style.background = link.color || DEFAULT_COLORS[iconKey] || DEFAULT_COLORS.link;
      iconWrap.innerHTML = ICONS[iconKey];

      var label = document.createElement("span");
      label.className = "link-label";
      label.textContent = link.label;

      a.appendChild(iconWrap);
      a.appendChild(label);
      listEl.appendChild(a);
    });
  }

  async function load() {
    var cfg = getConfig();
    if (!cfg.supabaseUrl || !cfg.anonKey) {
      renderLinks([]);
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
        renderLinks([]);
        return;
      }
      var data = await res.json();

      var name = (data.system_name || "Joonker").replace(/^CRM\s+/i, "");
      nameEl.textContent = name;
      document.title = name;

      var logoUrl = resolveLogoUrl(data.logo_url || "", cfg.supabaseUrl);
      if (logoUrl) {
        logoEl.src = logoUrl;
        logoEl.alt = name;
        logoEl.hidden = false;
        var favicon = document.getElementById("page-favicon");
        if (favicon) favicon.href = logoUrl;
      }

      renderLinks(data.links || []);
    } catch (_err) {
      renderLinks([]);
    }
  }

  load();
})();
