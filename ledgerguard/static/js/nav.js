/*
 * Site-header behavior:
 * the mobile hamburger menu (Escape closes + focus return, body scroll
 * lock while open) and the desktop "Evidence" dropdown (click to toggle,
 * click-outside to close, Escape to close).
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // --- Mobile hamburger menu ---------------------------------------------
    var menuButton = document.getElementById("mobile-menu-button");
    var mobileNav = document.getElementById("mobile-navigation");
    var iconMenu = document.getElementById("nav-icon-menu");
    var iconClose = document.getElementById("nav-icon-close");

    if (menuButton && mobileNav) {
      var setMobileOpen = function (open) {
        menuButton.setAttribute("aria-expanded", open ? "true" : "false");
        menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        mobileNav.classList.toggle("hidden", !open);
        document.body.style.overflow = open ? "hidden" : "";
        if (iconMenu && iconClose) {
          iconMenu.classList.toggle("hidden", open);
          iconClose.classList.toggle("hidden", !open);
        }
      };

      menuButton.addEventListener("click", function () {
        setMobileOpen(menuButton.getAttribute("aria-expanded") !== "true");
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
          setMobileOpen(false);
          menuButton.focus();
        }
      });

      mobileNav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          setMobileOpen(false);
        });
      });
    }

    // --- Desktop "Evidence" dropdown ---------------------------------------
    var evidenceWrap = document.querySelector("[data-evidence-menu]");
    var evidenceButton = document.getElementById("evidence-toggle");
    var evidencePanel = document.getElementById("evidence-panel");
    var evidenceChevron = document.getElementById("evidence-chevron");

    if (evidenceWrap && evidenceButton && evidencePanel) {
      var setEvidenceOpen = function (open) {
        evidenceButton.setAttribute("aria-expanded", open ? "true" : "false");
        evidenceButton.classList.toggle("is-active", open);
        evidencePanel.classList.toggle("hidden", !open);
        if (evidenceChevron) evidenceChevron.classList.toggle("rotate-180", open);
      };

      evidenceButton.addEventListener("click", function () {
        setEvidenceOpen(evidenceButton.getAttribute("aria-expanded") !== "true");
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") setEvidenceOpen(false);
      });

      document.addEventListener("mousedown", function (event) {
        if (!evidenceWrap.contains(event.target)) setEvidenceOpen(false);
      });

      evidencePanel.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          setEvidenceOpen(false);
        });
      });
    }
  });
})();
