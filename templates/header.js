/* eslint-env browser */
document.addEventListener("DOMContentLoaded", function() {
  var nightModeCheckbox = document.getElementById("night-mode");
  var classList = document.body.classList;

  var enabledNightModeCookie =
    document.cookie && document.cookie.match(/(^|; )night-mode=1(;|$)/);
  var disabledNightModeCookie =
    document.cookie && document.cookie.match(/(^|; )night-mode=0(;|$)/);

  nightModeCheckbox.checked =
    enabledNightModeCookie ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches &&
      !disabledNightModeCookie);

  if (enabledNightModeCookie) {
    classList.add("dark");
  } else if (disabledNightModeCookie) {
    classList.add("light");
  }

  nightModeCheckbox.addEventListener("change", function() {
    if (nightModeCheckbox.checked) {
      classList.add("dark");
      classList.remove("light");
      document.cookie = "night-mode=1; path=/";
    } else {
      classList.remove("dark");
      classList.add("light");
      document.cookie = "night-mode=0; path=/";
    }
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addListener(function(colorSchemeMedia) {
      nightModeCheckbox.checked = colorSchemeMedia.matches;
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

document.addEventListener("DOMContentLoaded", function() {
  function handleFuturePDF(e) {
    if (e.ctrlKey || e.metaKey) {
      return true;
    }

    var target = e.currentTarget;
    target.removeEventListener("click", handleFuturePDF);
    target.classList.add("loading");
    var href = target.getAttribute("data-src");

    var objEl = document.createElement("object");
    var embedEl = document.createElement("embed");
    var pEl = document.createElement("p");
    pEl.innerHTML =
      'This browser does not support PDFs. <a href="' +
      href +
      '">Download PDF</a>.';
    embedEl.appendChild(pEl);

    embedEl.setAttribute("src", href);
    embedEl.setAttribute("type", "application/pdf");
    objEl.appendChild(embedEl);

    objEl.setAttribute("data", href);
    objEl.setAttribute("type", "application/pdf");
    objEl.setAttribute("width", "800px");
    objEl.setAttribute(
      "height",
      "" + (20 + 800 * target.clientHeight / target.clientWidth) + "px"
    );
    objEl.setAttribute("allowfullscreen", 1);
    target.parentNode.insertBefore(objEl, target);
    target.style.display = "none";
    e.preventDefault();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("a.future-pdf[data-src]"),
    function(fpdf) {
      fpdf.addEventListener("click", handleFuturePDF);
    }
  );
});
