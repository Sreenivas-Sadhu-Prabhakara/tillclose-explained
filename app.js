/* ============================================================
   tillclose · explained — all behaviour wired here (the strict CSP
   forbids inline scripts and on*= handlers). No network, no storage
   beyond the theme preference. Everything degrades gracefully when
   JS is off (content is already legible) and respects reduced motion.
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- theme toggle (persisted) ---------- */
  var THEME_KEY = "tillclose-explained:theme";
  var root = document.documentElement;
  var themeBtn = document.getElementById("themeToggle");
  var themeLabel = document.getElementById("themeLabel");

  function systemDark() {
    return !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function applyTheme(mode) {
    // mode: "dark" | "light" | null (follow system)
    if (mode === "dark" || mode === "light") {
      root.setAttribute("data-theme", mode);
    } else {
      root.removeAttribute("data-theme");
    }
    var isDark = mode ? mode === "dark" : systemDark();
    if (themeBtn) themeBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
    if (themeLabel) themeLabel.textContent = isDark ? "Light" : "Dark";
  }
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
  applyTheme(saved);

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      var effectiveDark = current ? current === "dark" : systemDark();
      var next = effectiveDark ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- scroll progress bar ---------- */
  var fill = document.getElementById("scrollFill");
  if (fill) {
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? (h.scrollTop || window.pageYOffset) / max : 0;
      fill.style.width = (Math.max(0, Math.min(1, pct)) * 100).toFixed(2) + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var stages = Array.prototype.slice.call(document.querySelectorAll(".stage--hero, .split__stage"));
  var animatedTotals = [];

  function markIn(el) {
    el.classList.add("is-in");
    // kick any count-up tickers inside this element
    var tickers = el.querySelectorAll(".ticker__value[data-target], [data-target]#expectedRun");
    Array.prototype.forEach.call(tickers, startCountUp);
  }

  if ("IntersectionObserver" in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          markIn(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

    reveals.forEach(function (el) { obs.observe(el); });
    stages.forEach(function (el) { obs.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
    stages.forEach(markIn);
  }

  /* ---------- animated count-up tickers ----------
     data-target holds the value in integer minor units (paise).
     Formatted with Indian grouping to match the tillclose family. */
  function groupIndian(intStr) {
    // intStr is the whole-rupee part as a plain digit string
    if (intStr.length <= 3) return intStr;
    var last3 = intStr.slice(-3);
    var rest = intStr.slice(0, -3);
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return rest + "," + last3;
  }
  function formatPaise(paise) {
    var neg = paise < 0;
    var abs = Math.abs(paise);
    var rupees = Math.floor(abs / 100);
    var frac = abs % 100;
    var s = "₹" + groupIndian(String(rupees)) + "." + (frac < 10 ? "0" + frac : String(frac));
    return neg ? "−" + s : s;
  }

  function startCountUp(el) {
    if (!el || el.dataset.counting === "1" || el.dataset.done === "1") return;
    var target = parseInt(el.getAttribute("data-target"), 10);
    if (isNaN(target)) return;
    if (reduceMotion) {
      el.textContent = formatPaise(target);
      el.dataset.done = "1";
      return;
    }
    el.dataset.counting = "1";
    var duration = 1100;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatPaise(Math.round(target * eased));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = formatPaise(target);
        el.dataset.done = "1";
        el.dataset.counting = "0";
      }
    }
    requestAnimationFrame(step);
  }

  // ensure the expectedRun ledger total (not a .ticker__value) is also observed
  var expectedRun = document.getElementById("expectedRun");
  if (expectedRun && "IntersectionObserver" in window) {
    var obs2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { startCountUp(expectedRun); obs2.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    obs2.observe(expectedRun);
  } else if (expectedRun) {
    startCountUp(expectedRun);
  }

  /* ---------- verdict chip switcher ---------- */
  var band = document.getElementById("verdictBand");
  var stamp = document.getElementById("verdictStamp");
  var amt = document.getElementById("verdictAmt");
  var words = document.getElementById("verdictWords");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".miniChip"));

  var VERDICTS = {
    short:   { stamp: "SHORT",   amt: "−₹31.00", words: "The drawer is short by thirty-one rupees." },
    tallied: { stamp: "TALLIED", amt: "₹0.00",   words: "Counted cash matches expected exactly." },
    over:    { stamp: "OVER",    amt: "+₹31.00", words: "The drawer is over by thirty-one rupees." }
  };

  function setVerdict(status) {
    var v = VERDICTS[status];
    if (!v || !band) return;
    band.setAttribute("data-status", status);
    if (stamp) stamp.textContent = v.stamp;
    if (amt) amt.textContent = v.amt;
    if (words) words.textContent = v.words;
    chips.forEach(function (c) {
      var on = c.getAttribute("data-status") === status;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  chips.forEach(function (c) {
    c.setAttribute("aria-pressed", c.classList.contains("is-on") ? "true" : "false");
    c.addEventListener("click", function () { setVerdict(c.getAttribute("data-status")); });
  });
})();
