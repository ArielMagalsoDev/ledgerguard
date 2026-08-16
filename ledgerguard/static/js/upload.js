// Upload sandbox state machine.
// Stages: disclosure -> ready -> busy -> result | error.
(function () {
  const root = document.getElementById("upload-flow");
  if (!root) return;

  const rateLimitPerHour = Number(root.dataset.rateLimitPerHour || "5");
  const turnstileSiteKey = root.dataset.turnstileSiteKey || "";
  const stages = root.querySelectorAll(".upload-stage");

  let file = null;
  let turnstileToken = null;
  let turnstileWidgetId = null;
  let currentInvoiceId = null;
  let currentExpiresAt = null;
  let countdownTimer = null;
  let pollTimeout = null;

  function setStage(name) {
    stages.forEach((el) => {
      el.hidden = el.dataset.stage !== name;
    });
  }

  function showError(message) {
    root.querySelector("#upload-error-message").textContent = message;
    setStage("error");
  }

  // --- Disclosure gate ---
  const ackCheckbox = root.querySelector("#upload-ack");
  const continueBtn = root.querySelector("#upload-continue");
  ackCheckbox.addEventListener("change", () => {
    continueBtn.disabled = !ackCheckbox.checked;
  });
  continueBtn.addEventListener("click", () => setStage("ready"));

  // --- File picker ---
  const dropzone = root.querySelector("#upload-dropzone");
  const fileInput = root.querySelector("#upload-file-input");
  const chooseBtn = root.querySelector("#upload-choose");
  const fileChosenBox = root.querySelector("#upload-file-chosen");
  const fileNameEl = root.querySelector("#upload-file-name");
  const fileSizeEl = root.querySelector("#upload-file-size");
  const removeBtn = root.querySelector("#upload-file-remove");
  const errorEl = root.querySelector("#upload-error");
  const submitBtn = root.querySelector("#upload-submit");

  chooseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFileChosen(fileInput.files && fileInput.files[0]));

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-ink", "bg-ink/5");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("border-ink", "bg-ink/5"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-ink", "bg-ink/5");
    const dropped = e.dataTransfer.files && e.dataTransfer.files[0];
    if (dropped) handleFileChosen(dropped);
  });

  function handleFileChosen(chosen) {
    errorEl.classList.add("hidden");
    file = chosen || null;
    if (file) {
      fileNameEl.textContent = file.name;
      fileSizeEl.textContent = `${(file.size / 1024).toFixed(0)} KB`;
      fileChosenBox.classList.remove("hidden");
      fileChosenBox.classList.add("flex");
    } else {
      fileChosenBox.classList.add("hidden");
      fileChosenBox.classList.remove("flex");
    }
    updateSubmitEnabled();
  }

  removeBtn.addEventListener("click", () => handleFileChosen(null));

  function updateSubmitEnabled() {
    const turnstileRequired = !!turnstileSiteKey;
    submitBtn.disabled = !file || (turnstileRequired && !turnstileToken);
  }

  // --- Turnstile ---
  function renderTurnstile() {
    const container = root.querySelector("#turnstile-container");
    if (!turnstileSiteKey || !container || !window.turnstile || turnstileWidgetId) return;
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      callback: (token) => {
        turnstileToken = token;
        updateSubmitEnabled();
      },
      "expired-callback": () => {
        turnstileToken = null;
        updateSubmitEnabled();
      },
    });
  }

  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId) window.turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
    updateSubmitEnabled();
  }

  if (turnstileSiteKey) {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;
    document.head.appendChild(script);
  }

  // --- Submit ---
  submitBtn.addEventListener("click", handleSubmit);

  async function handleSubmit() {
    if (!file) return;
    setStage("busy");
    errorEl.classList.add("hidden");

    const formData = new FormData();
    formData.append("file", file);
    if (turnstileToken) formData.append("turnstileToken", turnstileToken);

    let res, data;
    try {
      res = await fetch("/api/upload", { method: "POST", body: formData });
      data = await res.json().catch(() => ({}));
    } catch {
      showError("Couldn't reach the server. Check your connection and try again.");
      return;
    }

    if (res.status === 201) {
      currentInvoiceId = data.invoiceId;
      pollForResult(data.invoiceId, 3);
      return;
    }
    if (res.status === 202) {
      currentInvoiceId = data.invoiceId;
      pollForResult(data.invoiceId, 14);
      return;
    }
    if (res.status === 422) {
      showError(data.message || "This file couldn't be validated.");
      return;
    }
    if (res.status === 429) {
      showError(data.message || "Too many uploads — try again later.");
      return;
    }
    if (res.status === 403) {
      resetTurnstile();
      showError("Verification failed — please try again.");
      return;
    }
    showError(data.message || "Something went wrong processing this upload.");
  }

  async function pollForResult(invoiceId, attemptsLeft) {
    let res;
    try {
      res = await fetch(`/api/upload/session?invoiceId=${invoiceId}`);
    } catch {
      res = null;
    }
    if (res && res.status === 200) {
      const data = await res.json();
      if (data.state === "ready") {
        showResult(data.scenario, data.expiresAt, invoiceId);
        return;
      }
    }
    if (attemptsLeft <= 0) {
      showError("Processing is taking longer than expected. Refresh this page in a moment, or try again.");
      return;
    }
    pollTimeout = setTimeout(() => pollForResult(invoiceId, attemptsLeft - 1), 2000);
  }

  // --- Result rendering ---
  function outcomeLabel(outcome) {
    return outcome.replace(/_/g, " ");
  }

  function fieldRow(field) {
    if (!field) return "";
    const status = field.status || "missing";
    const value = field.value == null ? "—" : field.value;
    return `<div class="flex items-center justify-between gap-3 border-b border-rule pb-1.5">
      <span class="text-ink-faint text-xs">${field.field || ""}</span>
      <span class="font-tabular text-ink">${value} <span class="text-[10px] text-ink-faint">(${status})</span></span>
    </div>`;
  }

  function showResult(scenario, expiresAt, invoiceId) {
    currentExpiresAt = expiresAt;
    root.querySelector("#result-title").textContent = scenario.title;
    root.querySelector("#result-outcome-badge").innerHTML =
      `<span class="tag-pill">${outcomeLabel(scenario.outcome)}</span>`;

    const isUnmatched = scenario.match && scenario.match.supplierMatch === "none";
    root.querySelector("#result-unmatched-notice").classList.toggle("hidden", !isUnmatched);

    root.querySelector("#result-pdf-frame").src = `/api/upload/session/file?invoiceId=${invoiceId}`;

    const extracted = scenario.extracted || {};
    const headerFields = ["invoiceNumber", "invoiceDate", "dueDate", "supplierName", "supplierTaxId", "purchaseOrderNumber", "currency", "subtotal", "tax", "total", "remittanceDetails"];
    root.querySelector("#result-extracted-fields").innerHTML = headerFields.map((k) => fieldRow(extracted[k])).join("");

    const match = scenario.match || {};
    root.querySelector("#result-match").innerHTML = `
      <div>Supplier match: <strong class="text-ink">${match.supplierMatch || "none"}</strong></div>
      <div>PO match: <strong class="text-ink">${match.purchaseOrderMatch || "none"}</strong></div>
      <div>Duplicate candidates: <strong class="text-ink">${(match.duplicateCandidates || []).length}</strong></div>
    `;

    root.querySelector("#result-controls").innerHTML = (scenario.controls || [])
      .map((c) => `<div class="flex items-start justify-between gap-3 border-b border-rule pb-1.5">
          <span class="text-ink-muted">${c.label}</span>
          <span class="shrink-0 text-xs font-medium ${c.status === "passed" ? "text-ready" : c.status === "failed" ? "text-blocked" : "text-exception"}">${c.status}</span>
        </div>`)
      .join("");

    const decision = scenario.decision || {};
    root.querySelector("#result-action").innerHTML = `
      <p>${decision.reason || ""}</p>
      ${(decision.requiredActions || []).length ? `<ul class="mt-2 list-disc pl-4">${decision.requiredActions.map((a) => `<li>${a}</li>`).join("")}</ul>` : ""}
    `;

    root.querySelector("#result-audit").innerHTML = (scenario.auditEvents || [])
      .map((e) => `<div class="flex items-center justify-between gap-3 border-b border-rule pb-1"><span>${e.label}</span><span class="font-tabular text-ink-faint">${e.latencyMs != null ? e.latencyMs + "ms" : ""}</span></div>`)
      .join("");

    root.querySelector("#result-deleted-panel").classList.add("hidden");
    root.querySelector("#result-content").classList.remove("hidden");
    root.querySelector("#upload-deleted-confirmed").classList.add("hidden");
    root.querySelector("#upload-delete-now").classList.remove("hidden");

    startCountdown();
    setStage("result");
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const el = root.querySelector("#result-countdown");
    function update() {
      if (!currentExpiresAt) {
        el.textContent = "";
        return;
      }
      const msRemaining = new Date(currentExpiresAt).getTime() - Date.now();
      const minutesLeft = Math.max(0, Math.round(msRemaining / 60000));
      el.textContent = minutesLeft > 0 ? `Deleted automatically in ${minutesLeft} min` : "Deleting shortly";
    }
    update();
    countdownTimer = setInterval(update, 1000);
  }

  root.querySelector("#upload-delete-now").addEventListener("click", async () => {
    if (!currentInvoiceId) return;
    await fetch(`/api/upload/session?invoiceId=${currentInvoiceId}`, { method: "DELETE" });
    if (countdownTimer) clearInterval(countdownTimer);
    root.querySelector("#result-content").classList.add("hidden");
    root.querySelector("#result-deleted-panel").classList.remove("hidden");
    root.querySelector("#upload-delete-now").classList.add("hidden");
    root.querySelector("#upload-deleted-confirmed").classList.remove("hidden");
  });

  function reset() {
    file = null;
    turnstileToken = null;
    currentInvoiceId = null;
    currentExpiresAt = null;
    if (countdownTimer) clearInterval(countdownTimer);
    if (pollTimeout) clearTimeout(pollTimeout);
    handleFileChosen(null);
    resetTurnstile();
    setStage("ready");
  }

  root.querySelector("#upload-retry").addEventListener("click", reset);
  root.querySelector("#upload-try-another-1").addEventListener("click", reset);
  root.querySelector("#upload-try-another-2").addEventListener("click", reset);

  setStage("disclosure");
})();
