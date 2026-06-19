// Shared theme toggle (persists across the mockup pages)
(function () {
  var saved = localStorage.getItem("mt-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  window.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    function render() {
      var t = document.documentElement.getAttribute("data-theme");
      btn.textContent = t === "dark" ? "☀️" : "🌙";
    }
    render();
    btn.addEventListener("click", function () {
      var t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("mt-theme", t);
      render();
    });
  });
})();
