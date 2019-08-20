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
});

document.addEventListener("DOMContentLoaded", function() {
  var settingsIcon = document.getElementById("settings-icon");
  if (!settingsIcon) {
    return;
  }

  settingsIcon.addEventListener("click", function(event) {
    var rect = settingsIcon.getBoundingClientRect();
    var top = window.screenY + rect.top + rect.height;
    var left = window.screenX + rect.left + rect.width;

    window.open(
      settingsIcon.href,
      "Settings",
      "height=200,width=300,top=" + top + ",left=" + left
    );

    event.preventDefault();
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
