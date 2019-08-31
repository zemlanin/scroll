/* eslint-env browser */
document.addEventListener("DOMContentLoaded", function() {
  var enabledNightModeCookie =
    document.cookie && document.cookie.match(/(^|; )night-mode=1(;|$)/);
  var disabledNightModeCookie =
    document.cookie && document.cookie.match(/(^|; )night-mode=0(;|$)/);

  var classList = document.body.classList;

  if (enabledNightModeCookie) {
    classList.add("dark");
  } else if (disabledNightModeCookie) {
    classList.add("light");
  }

  var nightModeForm = document.getElementById("night-mode");
  if (!nightModeForm) {
    return;
  }

  if (enabledNightModeCookie) {
    nightModeForm["night-mode"].value = "on";
  } else if (disabledNightModeCookie) {
    nightModeForm["night-mode"].value = "off";
  }

  nightModeForm.addEventListener("change", function() {
    if (nightModeForm["night-mode"].value === "on") {
      classList.add("dark");
      classList.remove("light");
      document.cookie = "night-mode=1; path=/";
    } else if (nightModeForm["night-mode"].value === "off") {
      classList.remove("dark");
      classList.add("light");
      document.cookie = "night-mode=0; path=/";
    } else if (nightModeForm["night-mode"].value === "system") {
      classList.remove("dark");
      classList.remove("light");
      document.cookie = "night-mode=; path=/";
    }
  });
});

document.addEventListener("DOMContentLoaded", function() {
  function handleFutureFrame(e) {
    if (e.ctrlKey || e.metaKey) {
      return true;
    }

    var target = e.currentTarget;
    var img = target.querySelector("img");
    var width = Math.min(
      +target.getAttribute("data-width") || Infinity,
      (img && (img.width || img.clientWidth)) || 640
    );
    var height = Math.min(
      +target.getAttribute("data-height") || Infinity,
      (img && (img.height || img.clientHeight)) || 360
    );
    var background = target.getAttribute("data-background");
    target.removeEventListener("click", handleFutureFrame);
    target.classList.add("loading");
    var i = document.createElement("iframe");
    i.setAttribute("src", target.getAttribute("data-src"));
    i.setAttribute("frameborder", 0);
    i.setAttribute("width", width);
    i.setAttribute("height", 0);
    i.setAttribute("allow", "autoplay; encrypted-media");
    i.setAttribute("allowfullscreen", 1);
    if (background) {
      i.style.background = background;
    }
    target.parentNode.insertBefore(i, target);
    i.addEventListener("load", function() {
      i.setAttribute("height", height);
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
  function handleAudioControl(e) {
    if (e.ctrlKey || e.metaKey) {
      return true;
    }

    var target = e.currentTarget;
    var src = target.getAttribute("data-src");
    if (!src) {
      return true;
    }

    var audio = document.querySelector('audio[src="' + src + '"]');
    if (!audio) {
      return true;
    }

    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }

    e.preventDefault();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("figure.card img.audio-control"),
    function(ac) {
      ac.addEventListener("click", handleAudioControl);
    }
  );
});
