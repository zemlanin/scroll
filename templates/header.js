/* eslint-env browser */
document.addEventListener("DOMContentLoaded", function() {
  var nightModeCheckbox = document.getElementById("night-mode");
  var classList = document.body.classList;

  nightModeCheckbox.checked =
    document.cookie && document.cookie.match(/(^|; )night-mode=1(;|$)/);

  if (nightModeCheckbox.checked) {
    classList.add("dark");
  }

  nightModeCheckbox.addEventListener("change", function() {
    if (nightModeCheckbox.checked) {
      classList.add("dark");
      document.cookie = "night-mode=1; path=/";
    } else {
      classList.remove("dark");
      document.cookie = "night-mode=0; path=/";
    }
  });
});

document.addEventListener("DOMContentLoaded", function() {
  function handleFutureFrame(e) {
    if (e.ctrlKey || e.metaKey) {
      return true;
    }

    var target = e.currentTarget;
    target.removeEventListener("click", handleFutureFrame);
    target.classList.add("loading");
    var i = document.createElement("iframe");
    i.setAttribute("src", target.getAttribute("data-src"));
    i.setAttribute("frameborder", 0);
    i.setAttribute("width", 640);
    i.setAttribute("height", 0);
    i.setAttribute("allow", "autoplay; encrypted-media");
    i.setAttribute("allowfullscreen", 1);
    target.parentNode.insertBefore(i, target);
    i.addEventListener("load", function() {
      i.setAttribute("height", 360);
      target.style.display = "none";
    });
    e.preventDefault();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("a.future-frame[data-src]"),
    function(ff) {
      ff.addEventListener("click", handleFutureFrame);
    }
  );
});
