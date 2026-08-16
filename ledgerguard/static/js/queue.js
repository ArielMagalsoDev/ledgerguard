// Queue row review actions. Each queue row is server-rendered
// (templates/queue.html); this file wires the plain
// Approve/Reject/Comment/Reassign buttons to POST /api/invoices/{id}/actions
// and reloads the page on success so the row reflects the new state.
(function () {
  "use strict";

  function showError(row, message) {
    var el = row.querySelector(".qra-error");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function clearError(row) {
    var el = row.querySelector(".qra-error");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  function setPending(row, pending) {
    var buttons = row.querySelectorAll(".qra-btn");
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = pending;
  }

  function submitAction(row, action) {
    clearError(row);

    var invoiceId = row.getAttribute("data-invoice-id");
    var name = row.querySelector(".qra-name").value.trim();
    var role = row.querySelector(".qra-role").value;
    var comment = row.querySelector(".qra-comment").value.trim();
    var reassignTo = row.querySelector(".qra-reassign-to").value;

    if (!name) {
      showError(row, "Your name is required.");
      return;
    }
    if ((action === "rejected" || action === "commented") && !comment) {
      showError(row, "A comment is required to " + (action === "rejected" ? "reject" : "comment") + ".");
      return;
    }

    var body = { action: action, actorRole: role, actorName: name };
    if (comment) body.comment = comment;
    if (action === "reassigned") body.reassignedTo = reassignTo;

    setPending(row, true);

    fetch("/api/invoices/" + invoiceId + "/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              throw new Error(data.detail || data.error || "Action failed.");
            });
        }
        return res.json();
      })
      .then(function () {
        window.location.reload();
      })
      .catch(function (err) {
        setPending(row, false);
        showError(row, err.message || "Action failed.");
      });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".qra-btn");
    if (!button) return;
    var row = button.closest("[data-queue-row]");
    if (!row) return;
    submitAction(row, button.getAttribute("data-action"));
  });
})();
