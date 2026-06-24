(function () {
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var stored = localStorage.getItem("lab-theme");

  if (stored) {
    root.setAttribute("data-theme", stored);
  }

  function updateIcon() {
    toggle.textContent = root.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
  }

  updateIcon();

  toggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("lab-theme", next);
    updateIcon();
  });
})();
