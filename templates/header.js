/* eslint-env browser */
document.addEventListener("DOMContentLoaded", function() {
  var nightModeForm = document.getElementById("night-mode");
  if (!nightModeForm) {
    return;
  }

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

document.addEventListener("DOMContentLoaded", function() {
  if (typeof matchMedia === "undefined" && !("connection" in navigator)) {
    return;
  }

  function doAutoplay(v) {
    v.setAttribute("autoplay", "");

    if (v.paused) {
      v.play();
    }
  }

  function doControls(v) {
    v.removeAttribute("autoplay");
    v.setAttribute("controls", "");
    v.setAttribute("preload", "metadata");

    if (!v.paused) {
      v.pause();
    }
  }

  var motionQuery =
    typeof matchMedia === "undefined"
      ? null
      : matchMedia("(prefers-reduced-motion)");

  function handleLoopedVideos() {
    var prefersReducedMotion = motionQuery && motionQuery.matches;
    var saveData =
      "connection" in navigator &&
      (navigator.connection.saveData === true ||
        navigator.connection.effectiveType === "slow-2g" ||
        navigator.connection.effectiveType === "2g");

    Array.prototype.forEach.call(
      document.querySelectorAll("video[loop][muted]"),
      prefersReducedMotion || saveData ? doControls : doAutoplay
    );
  }

  handleLoopedVideos();

  if (motionQuery) {
    motionQuery.addListener(handleLoopedVideos);
  }

  if ("connection" in navigator) {
    navigator.connection.addEventListener("change", handleLoopedVideos);
  }
});

document.addEventListener("DOMContentLoaded", function() {
  function scrollToCenter(parent, child) {
    if (!child) {
      return;
    }

    var centering = Math.abs(parent.clientWidth - child.clientWidth) / 2;

    parent.scrollTo(-centering + child.offsetLeft - parent.offsetLeft, 0);
  }

  function findFirstLeftOfCenter(node) {
    var nodeViewportCenter = Math.floor(node.offsetLeft + node.clientWidth / 2);
    var listItems = node.querySelectorAll("li");
    var listItemsLength = listItemsLength;
    var itemCenter;

    // assuming that items flow from left to right (= `index = 0` on the leftmost element)
    for (var i = listItems.length - 1; i >= 0; i--) {
      itemCenter =
        Math.floor(
          listItems[i].offsetLeft -
            node.scrollLeft +
            listItems[i].clientWidth / 2
        ) + 1;

      if (itemCenter < nodeViewportCenter) {
        return listItems[i];
      }
    }
  }

  function findFirstRightOfCenter(node) {
    var nodeViewportCenter = Math.floor(node.offsetLeft + node.clientWidth / 2);
    var listItems = node.querySelectorAll("li");
    var listItemsLength = listItems.length;
    var itemCenter;

    // assuming that items flow from left to right (= `index = 0` on the leftmost element)
    for (var i = 0; i < listItemsLength; i++) {
      itemCenter =
        Math.floor(
          listItems[i].offsetLeft -
            node.scrollLeft +
            listItems[i].clientWidth / 2
        ) - 1;

      if (nodeViewportCenter < itemCenter) {
        return listItems[i];
      }
    }
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("ul[data-gallery]"),
    function initGallery(node) {
      node.tabIndex = 0;

      node.addEventListener("keydown", function(e) {
        var LEFT = 37;
        var RIGHT = 39;

        if (e.keyCode === LEFT) {
          e.preventDefault();
          scrollToCenter(node, findFirstLeftOfCenter(node));
        } else if (e.keyCode === RIGHT) {
          e.preventDefault();
          scrollToCenter(node, findFirstRightOfCenter(node));
        }
      });

      Array.prototype.forEach.call(node.querySelectorAll("li"), function(li) {
        li.addEventListener("click", function() {
          scrollToCenter(node, li);
        });
      });

      node.querySelector("li > img").addEventListener("load", function(e) {
        Array.prototype.forEach.call(
          node.querySelectorAll("li > img"),
          function(img) {
            img.style.maxHeight = e.target.clientHeight + "px";
          }
        );
      });
    }
  );
});
