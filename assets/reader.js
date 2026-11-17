// 노트 서재 — 글자 크기, 밝게·어둡게, 목차, 읽음 표시, 이어 읽기, 제목 찾기, ← → 넘기기.
// 기록은 각 기기의 브라우저(localStorage)에만 남는다.
(function () {
  "use strict";

  var PREFIX = "notes-reader:";
  var THEMES = ["light", "dark"];
  var FONT_MIN = 12;
  var FONT_MAX = 26;

  function load(key, fallback) {
    try {
      var value = localStorage.getItem(PREFIX + key);
      return value === null ? fallback : JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {}
  }

  var root = document.documentElement;
  var body = document.body;
  var page = body.getAttribute("data-page");

  // 위쪽 막대 단추 ----------------------------------------------------------
  function currentFont() {
    var value = parseFloat(getComputedStyle(root).getPropertyValue("--reader-fs"));
    return isNaN(value) ? 15.2 : value;
  }

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button) return;
    var action = button.getAttribute("data-action");
    if (action === "font-up" || action === "font-down") {
      var size = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(currentFont()) + (action === "font-up" ? 1 : -1)));
      root.style.setProperty("--reader-fs", size + "px");
      try {
        localStorage.setItem(PREFIX + "fontSize", String(size));
      } catch (e) {}
    } else if (action === "theme") {
      var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem(PREFIX + "theme", next);
      } catch (e) {}
    } else if (action === "outline") {
      toggleOutline();
    }
  });

  // 목차 (옵시디언 개요 창처럼 오른쪽에 연다)
  var outline = document.querySelector(".outline");
  function toggleOutline(force) {
    if (!outline) return;
    var open = typeof force === "boolean" ? force : outline.hidden;
    outline.hidden = !open;
    Array.prototype.forEach.call(document.querySelectorAll('.topbar [data-action="outline"]'), function (button) {
      button.setAttribute("aria-expanded", String(open));
    });
  }
  if (outline) {
    outline.addEventListener("click", function (event) {
      if (event.target.closest("a") && window.innerWidth < 1100) toggleOutline(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") toggleOutline(false);
    });
  }

  // 암호를 푼 뒤 document.write로 그려지므로, 주소의 #위치로 직접 옮긴다.
  function scrollToHash() {
    if (!location.hash) return null;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ block: "start" });
    return target;
  }

  // 서재 -------------------------------------------------------------------
  if (page === "library") {
    var read = load("read", {});
    var items = Array.prototype.slice.call(document.querySelectorAll(".note-item"));
    items.forEach(function (item) {
      if (read[item.getAttribute("data-id")]) item.classList.add("is-read");
    });

    Array.prototype.forEach.call(document.querySelectorAll(".shelf"), function (shelf) {
      var total = Number(shelf.getAttribute("data-total"));
      var done = shelf.querySelectorAll(".note-item.is-read").length;
      var label = shelf.querySelector("[data-progress]");
      if (label && done) label.textContent = total + "편 · " + done + "편 읽음";
    });

    var last = load("last", null);
    var resume = document.querySelector("[data-resume]");
    if (resume && last && last.href && document.getElementById("n-" + last.id)) {
      resume.href = last.href + "#resume";
      resume.textContent = "이어 읽기 · " + last.title;
      resume.hidden = false;
    }

    var search = document.querySelector(".search");
    var empty = document.querySelector(".search-empty");
    if (search) {
      search.addEventListener("input", function () {
        var query = search.value.trim().toLowerCase();
        var shown = 0;
        items.forEach(function (item) {
          var match = !query || item.getAttribute("data-title").indexOf(query) !== -1;
          item.hidden = !match;
          if (match) shown += 1;
        });
        Array.prototype.forEach.call(document.querySelectorAll(".group, .shelf"), function (box) {
          box.hidden = !box.querySelector(".note-item:not([hidden])");
        });
        if (empty) empty.hidden = shown !== 0;
      });
    }

    var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    function markTab() {
      var active = null;
      Array.prototype.forEach.call(document.querySelectorAll(".shelf"), function (shelf) {
        if (shelf.getBoundingClientRect().top < 160) active = shelf.id;
      });
      tabs.forEach(function (tab) {
        tab.classList.toggle("is-active", tab.getAttribute("href") === "#" + (active || ""));
      });
    }
    window.addEventListener("scroll", markTab, { passive: true });

    var target = scrollToHash();
    if (target && target.classList.contains("note-item")) {
      target.classList.add("is-target");
      target.scrollIntoView({ block: "center" });
    }
    markTab();

    var logout = document.querySelector("[data-logout]");
    if (logout) {
      logout.addEventListener("click", function (event) {
        if (!confirm("이 기기에 저장된 비밀번호를 지울까요? 다음에 열 때 다시 입력해야 합니다.")) event.preventDefault();
      });
    }
    return;
  }

  // 노트 -------------------------------------------------------------------
  if (page !== "note") return;
  var id = body.getAttribute("data-id");
  var title = (document.querySelector(".inline-title") || {}).textContent || "";
  var bar = document.querySelector(".scroll-progress span");
  var positions = load("positions", {});
  var resuming = location.hash === "#resume";

  save("last", { id: id, title: title, href: body.getAttribute("data-section") + "/" + id + ".html" });

  function ratio() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    return max <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / max));
  }

  var saveTimer = null;
  function onScroll() {
    var value = ratio();
    if (bar) bar.style.width = (value * 100).toFixed(1) + "%";
    if (value > 0.92) {
      var read = load("read", {});
      if (!read[id]) {
        read[id] = Date.now();
        save("read", read);
      }
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      positions = load("positions", {});
      positions[id] = value > 0.97 ? 0 : value;
      save("positions", positions);
    }, 300);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // 암호를 푼 페이지는 document.write로 다시 그려져서 load 이벤트가 다시 오지 않을 수 있다. 둘 중 먼저 오는 쪽에서 한 번만 실행한다.
  var started = false;
  function start() {
    if (started) return;
    started = true;
    if (resuming) {
      if (positions[id]) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, positions[id] * max);
      }
      history.replaceState(null, "", location.pathname);
    } else {
      scrollToHash();
    }
    onScroll();
  }
  if (document.readyState === "complete") start();
  else {
    window.addEventListener("load", start);
    setTimeout(start, 300);
  }

  document.addEventListener("keydown", function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || "")) return;
    var link = null;
    if (event.key === "ArrowLeft") link = document.querySelector('a[rel="prev"]');
    if (event.key === "ArrowRight") link = document.querySelector('a[rel="next"]');
    if (link) location.href = link.href;
  });
})();
