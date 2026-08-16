/*
 * Motion primitives (Reveal / BlurWords / WordReveal / CountUp /
 * AccordionRow). Dependency-free — IntersectionObserver and scroll handlers
 * only. Every effect collapses to its final visible state under
 * prefers-reduced-motion.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Reveal: fade + 12px rise once the element enters the viewport. ------
  function initReveal() {
    var els = document.querySelectorAll("[data-reveal]");
    els.forEach(function (el) {
      var delay = Number(el.getAttribute("data-reveal-delay") || 0);
      el.style.transition =
        "opacity 0.7s cubic-bezier(0.22,1,0.36,1) " + delay + "ms, " +
        "transform 0.7s cubic-bezier(0.22,1,0.36,1) " + delay + "ms";

      if (reduced) {
        el.style.opacity = "1";
        el.style.transform = "none";
        return;
      }

      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              el.style.opacity = "1";
              el.style.transform = "none";
              io.disconnect();
            }
          });
        },
        { threshold: 0.15 }
      );
      io.observe(el);
    });
  }

  // --- BlurWords: headline entrance — each word blurs in, staggered. -------
  function initBlurWords() {
    var els = document.querySelectorAll("[data-blur-words]");
    els.forEach(function (el) {
      var text = (el.getAttribute("data-blur-words") || el.textContent || "").trim();
      var delay = Number(el.getAttribute("data-delay") || 0);
      if (!text) return;

      el.setAttribute("aria-label", text);
      el.innerHTML = "";
      var words = text.split(" ");
      var spans = words.map(function (word, i) {
        var span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.className = "inline-block";
        span.textContent = word + (i < words.length - 1 ? " " : "");
        span.style.transition =
          "opacity 0.6s ease " + (delay + i * 60) + "ms, " +
          "filter 0.6s ease " + (delay + i * 60) + "ms, " +
          "transform 0.6s ease " + (delay + i * 60) + "ms";
        if (reduced) {
          span.style.opacity = "1";
          span.style.filter = "blur(0)";
          span.style.transform = "none";
        } else {
          span.style.opacity = "0";
          span.style.filter = "blur(8px)";
          span.style.transform = "translateY(6px)";
        }
        el.appendChild(span);
        return span;
      });

      if (reduced) return;

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              spans.forEach(function (span) {
                span.style.opacity = "1";
                span.style.filter = "blur(0)";
                span.style.transform = "none";
              });
              io.disconnect();
            }
          });
        },
        { threshold: 0.2 }
      );
      io.observe(el);
    });
  }

  // --- WordReveal: words brighten from faint to full ink while scrolling. --
  function initWordReveal() {
    var els = document.querySelectorAll("[data-word-reveal]");
    els.forEach(function (el) {
      var text = (el.getAttribute("data-word-reveal") || el.textContent || "").trim();
      if (!text) return;

      el.setAttribute("aria-label", text);
      el.innerHTML = "";
      var words = text.split(" ");
      var spans = words.map(function (word) {
        var span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.style.transition = "color 0.25s ease";
        span.textContent = word + " ";
        span.style.color = reduced ? "var(--ink)" : "var(--ink-faint)";
        el.appendChild(span);
        return span;
      });

      if (reduced) return;

      var raf = 0;
      function update() {
        var rect = el.getBoundingClientRect();
        var vh = window.innerHeight;
        var start = vh * 0.85;
        var end = vh * 0.35;
        var p = (start - rect.top) / (start - end + rect.height * 0.6);
        p = Math.min(1, Math.max(0, p));
        var lit = Math.round(p * spans.length);
        spans.forEach(function (span, i) {
          span.style.color = i < lit ? "var(--ink)" : "var(--ink-faint)";
        });
      }
      function onScrollOrResize() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(update);
      }
      onScrollOrResize();
      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize);
    });
  }

  // --- CountUp: eased count from 0 to the target once visible. -------------
  function initCountUp() {
    var els = document.querySelectorAll("[data-count-up]");
    els.forEach(function (el) {
      var value = el.getAttribute("data-count-up") || (el.textContent || "").trim();
      var match = value.match(/^(\d[\d,]*)/);
      if (!match || reduced) return;

      var target = Number(match[1].replace(/,/g, ""));
      var suffix = value.slice(match[1].length);

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            io.disconnect();
            var t0 = performance.now();
            var dur = 1200;
            el.textContent = "0" + suffix;
            function tick(t) {
              var p = Math.min(1, (t - t0) / dur);
              var eased = 1 - Math.pow(1 - p, 3);
              el.textContent = Math.round(target * eased).toLocaleString() + suffix;
              if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          });
        },
        { threshold: 0.4 }
      );
      io.observe(el);
    });
  }

  // --- AccordionRow: FAQ / detail accordion — rotating plus icon. ----------
  function initAccordion() {
    var rows = document.querySelectorAll("[data-accordion]");
    rows.forEach(function (row) {
      var button = row.querySelector("[data-accordion-trigger]");
      var panel = row.querySelector("[data-accordion-panel]");
      var icon = row.querySelector("[data-accordion-icon]");
      if (!button || !panel) return;

      function setOpen(open) {
        button.setAttribute("aria-expanded", open ? "true" : "false");
        panel.style.gridTemplateRows = open ? "1fr" : "0fr";
        if (icon) icon.style.transform = open ? "rotate(45deg)" : "none";
      }

      button.addEventListener("click", function () {
        setOpen(button.getAttribute("aria-expanded") !== "true");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initReveal();
    initBlurWords();
    initWordReveal();
    initCountUp();
    initAccordion();
  });
})();
