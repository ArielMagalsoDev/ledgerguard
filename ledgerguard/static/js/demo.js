/* AP workbench interactions: scenario tab switching + click-to-trace
 * (substring evidence-text matching between an extracted field and the
 * source-document line it came from).
 *
 * All 5 scenario workbenches are server-rendered into the page at once;
 * this file only toggles which one is visible and which field/line is
 * highlighted. Every element that can change appearance carries the exact
 * Tailwind class string(s) to apply as a `data-*` attribute (set in
 * demo.html), so this file never invents a class name that wasn't already
 * present in the template source for the Tailwind build step to see.
 */
(function () {
  "use strict";

  function addClasses(el, classString) {
    if (!classString) return;
    classString.split(" ").filter(Boolean).forEach(function (c) {
      el.classList.add(c);
    });
  }

  function removeClasses(el, classString) {
    if (!classString) return;
    classString.split(" ").filter(Boolean).forEach(function (c) {
      el.classList.remove(c);
    });
  }

  function setScenarioCardActive(card, active) {
    var base = card.dataset.baseClass || "";
    var extra = active ? card.dataset.activeExtra : card.dataset.inactiveExtra;
    card.className = extra ? base + " " + extra : base;
    card.setAttribute("aria-pressed", active ? "true" : "false");

    var bar = card.querySelector('[data-role="active-bar"]');
    if (bar) bar.classList.toggle("hidden", !active);

    var orderNumber = card.querySelector('[data-role="order-number"]');
    if (orderNumber) {
      var obase = orderNumber.dataset.baseClass || "";
      var oextra = active ? orderNumber.dataset.activeClass : orderNumber.dataset.inactiveClass;
      orderNumber.className = oextra ? obase + " " + oextra : obase;
    }
  }

  // Undoes any field-selection / document-line highlight left over in a
  // workbench panel, so switching scenarios always starts clean.
  function clearHighlights(panel) {
    panel.querySelectorAll("[data-field-highlight]").forEach(function (btn) {
      removeClasses(btn, btn.dataset.selectedClass);
      btn.classList.remove("is-selected-active");
    });
    var docContainer = panel.querySelector("[data-doc-lines]");
    if (!docContainer) return;
    var highlightClass = docContainer.dataset.highlightClass;
    docContainer.querySelectorAll("[data-line-text]").forEach(function (line) {
      removeClasses(line, highlightClass);
      addClasses(line, line.dataset.flaggedClass);
    });
  }

  function activateScenario(scenarioId) {
    document.querySelectorAll(".workbench-panel").forEach(function (panel) {
      var isActive = panel.dataset.scenarioId === scenarioId;
      panel.classList.toggle("hidden", !isActive);
      clearHighlights(panel);
    });
    document.querySelectorAll('[data-role="scenario-card"]').forEach(function (card) {
      setScenarioCardActive(card, card.dataset.scenarioId === scenarioId);
    });
  }

  // Click-to-trace: selecting an extracted field (or a line-item row)
  // highlights every document line whose text contains that field's
  // evidence text — a plain substring match. Clicking the same field
  // again clears the selection (toggle).
  function selectField(panel, fieldEl) {
    var text = fieldEl.dataset.fieldHighlight;
    if (!text) return;
    var wasSelected = fieldEl.classList.contains("is-selected-active");

    clearHighlights(panel);
    if (wasSelected) return;

    addClasses(fieldEl, fieldEl.dataset.selectedClass);
    fieldEl.classList.add("is-selected-active");

    var docContainer = panel.querySelector("[data-doc-lines]");
    if (!docContainer) return;
    var highlightClass = docContainer.dataset.highlightClass;
    docContainer.querySelectorAll("[data-line-text]").forEach(function (line) {
      var lineText = line.dataset.lineText || "";
      if (lineText.indexOf(text) !== -1) {
        removeClasses(line, line.dataset.flaggedClass);
        addClasses(line, highlightClass);
      }
    });
  }

  document.addEventListener("click", function (event) {
    var card = event.target.closest('[data-role="scenario-card"]');
    if (card) {
      activateScenario(card.dataset.scenarioId);
      return;
    }
    var fieldEl = event.target.closest("[data-field-highlight]");
    if (fieldEl) {
      var panel = fieldEl.closest(".workbench-panel");
      if (panel) selectField(panel, fieldEl);
    }
  });

  // Initial scenario comes from ?scenario= when present and valid
  // — read client-side since all 5 panels are already server-rendered
  // with the first one visible by default.
  document.addEventListener("DOMContentLoaded", function () {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get("scenario");
    if (!requested) return;
    var target = document.querySelector('[data-role="scenario-card"][data-scenario-id="' + CSS.escape(requested) + '"]');
    if (target) activateScenario(requested);
  });
})();
