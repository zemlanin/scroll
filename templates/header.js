document.addEventListener("DOMContentLoaded", function () {
  var nightModeForm = document.getElementById("theme-switcher");
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

  Array.prototype.forEach.call(
    nightModeForm["theme-switcher"],
    function (checkbox) {
      if (enabledNightModeCookie) {
        checkbox.checked = checkbox.value === "dark";
      } else if (disabledNightModeCookie) {
        checkbox.checked = checkbox.value === "light";
      }
    }
  );

  nightModeForm.addEventListener("change", function (event) {
    if (event.target.checked) {
      Array.prototype.forEach.call(
        nightModeForm["theme-switcher"],
        function (checkbox) {
          checkbox.checked = checkbox.value === event.target.value;
        }
      );
    }

    if (event.target.value === "dark" && event.target.checked) {
      classList.add("dark");
      classList.remove("light");
      document.cookie = "night-mode=1; path=/";
    } else if (event.target.value === "light" && event.target.checked) {
      classList.remove("dark");
      classList.add("light");
      document.cookie = "night-mode=0; path=/";
    } else if (!event.target.checked) {
      classList.remove("dark");
      classList.remove("light");
      document.cookie = "night-mode=; path=/";
    }
  });

  nightModeForm.addEventListener("keypress", function (event) {
    var SPACE = 32;
    if (event.keyCode === SPACE && event.target.tagName === "LABEL") {
      event.preventDefault();
      event.target.click();
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {
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
    var initialHeight = target.height || target.clientHeight;
    var height = Math.min(
      +target.getAttribute("data-height") || Infinity,
      initialHeight
    );
    var background = target.getAttribute("data-background");
    target.removeEventListener("click", handleFutureFrame);
    target.classList.add("loading");
    var i = document.createElement("iframe");
    i.setAttribute(
      "src",
      target.getAttribute("data-src") || target.getAttribute("href")
    );
    i.setAttribute("frameborder", 0);
    i.setAttribute("width", width);
    i.setAttribute("height", 0);
    i.style.width = width + "px";
    i.style.height = 0;
    i.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    i.setAttribute("allowfullscreen", 1);
    if (background) {
      i.style.background = background;
    }
    target.parentNode.insertBefore(i, target);
    i.addEventListener("load", function () {
      target.style.display = "none";
      i.setAttribute("height", height);
      i.style.height = height + "px";
      if (height < initialHeight) {
        i.style.marginTop = i.style.marginBottom =
          (initialHeight - height) / 2 + "px";
      }
    });
    e.preventDefault();
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("a.future-frame[data-src],a.future-frame[href]"),
    function (ff) {
      ff.addEventListener("click", handleFutureFrame);
    }
  );
});

document.addEventListener("DOMContentLoaded", function () {
  if (!document.querySelector("a.embedded-pdf[href]")) {
    return;
  }

  function getFallbackLink() {
    var lang = document.documentElement && document.documentElement.lang;
    if (lang === "en") {
      return "<p>This browser does not support inline PDFs. <a href='[url]'>Download PDF</a></p>";
    }
    if (lang === "uk") {
      return "<p>Цей браузер не підтримує вбудоване відображення PDF. <a href='[url]'>Завантажити PDF</a></p>";
    }
    return "<p>Этот браузер не поддерживает встроенное отображение PDF. <a href='[url]'>Скачать PDF</a></p>";
  }

  function handleEmbeddedPDF(e) {
    if (e.ctrlKey || e.metaKey) {
      return true;
    }

    var target = e.currentTarget;
    var img = target.querySelector("img");
    var width = Math.min(
      +target.getAttribute("data-width") || Infinity,
      (img && (img.width || img.clientWidth)) || 640
    );
    var initialHeight = target.height || target.clientHeight;
    var height = Math.min(
      +target.getAttribute("data-height") || Infinity,
      initialHeight
    );
    var background = target.getAttribute("data-background");
    target.removeEventListener("click", handleEmbeddedPDF);
    target.classList.add("loading");

    var div = document.createElement("div");
    if (background) {
      div.style.background = background;
    }

    window.PDFObject.embed(
      target.href,
      div,
      // don't insert comma after the last object value
      // prettier-ignore
      {
        width: width + "px",
        height: height + "px",
        fallbackLink: getFallbackLink()
      }
    );
    target.parentNode.insertBefore(div, target);
    target.style.display = "none";
    e.preventDefault();
  }

  var head = document.getElementsByTagName("head")[0];
  var pdfObjectScript = document.createElement("script");
  pdfObjectScript.setAttribute("src", "/pdfobject.min.js");
  pdfObjectScript.setAttribute("type", "application/javascript");
  pdfObjectScript.addEventListener("load", function () {
    Array.prototype.forEach.call(
      document.querySelectorAll("a.embedded-pdf[href]"),
      function (ep) {
        if (window.PDFObject.supportsPDFs) {
          ep.addEventListener("click", handleEmbeddedPDF);
        } else {
          ep.target = "_blank";
        }
      }
    );
  });
  head.insertBefore(pdfObjectScript, head.firstChild);
});

document.addEventListener("DOMContentLoaded", function () {
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
    function (ac) {
      ac.addEventListener("click", handleAudioControl);
    }
  );
});

document.addEventListener("DOMContentLoaded", function () {
  if (typeof matchMedia === "undefined" && !("connection" in navigator)) {
    return;
  }

  function ignoreAbortError(e) {
    if (e && e.name === "AbortError") {
      return;
    }

    throw e;
  }

  function doAutoplay(v) {
    v.setAttribute("autoplay", "");

    if (v.paused) {
      v.play().catch(ignoreAbortError);
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

document.addEventListener("DOMContentLoaded", function () {
  var supportsRAF = "requestAnimationFrame" in window;

  function noop() {}

  function wrapInRAF(f, arg) {
    var timeout;

    var _f =
      arg === undefined
        ? f
        : function () {
            return f(arg);
          };

    return function () {
      if (timeout) {
        window.cancelAnimationFrame(timeout);
      }

      timeout = window.requestAnimationFrame(_f);
    };
  }

  function onResize(node) {
    fillTheFillers(node);
    scrollToCenter(node, findCentermost(node));
  }

  var resizeObserver =
    "ResizeObserver" in window
      ? new ResizeObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            onResize(entries[i].target);
          }
        })
      : null;

  function fillTheFillers(node) {
    var first = node.querySelector('li[data-filler="first"]');
    var last = node.querySelector('li[data-filler="last"]');

    first.style.width =
      Math.floor(
        Math.max(node.clientWidth - first.nextElementSibling.clientWidth, 0) / 2
      ) + "px";

    last.style.width =
      Math.floor(
        Math.max(
          node.clientWidth - last.previousElementSibling.clientWidth,
          0
        ) / 2
      ) + "px";
  }

  function scrollToCenter(parent, child) {
    if (!child) {
      return;
    }

    var centering = Math.abs(parent.clientWidth - child.clientWidth) / 2;
    var scrollPosition = -centering + child.offsetLeft - parent.offsetLeft;

    if (scrollPosition !== parent.scrollLeft) {
      parent.scrollTo(scrollPosition, 0);
    }
  }

  function findFirstLeftOfCenter(node) {
    var nodeViewportCenter = Math.floor(node.offsetLeft + node.clientWidth / 2);
    var listItems = node.querySelectorAll("li");
    var itemCenter;

    // assuming that items flow from left to right (= `index = 0` on the leftmost element)
    for (var i = listItems.length - 1; i >= 0; i--) {
      if (listItems[i].getAttribute("data-filler")) {
        continue;
      }

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
      if (listItems[i].getAttribute("data-filler")) {
        continue;
      }

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

  function findCentermost(node) {
    var nodeViewportCenter = Math.floor(node.offsetLeft + node.clientWidth / 2);
    var listItems = node.querySelectorAll("li");
    var listItemsLength = listItems.length;
    var itemLeftBorder;

    // assuming that items flow from left to right (= `index = 0` on the leftmost element)
    for (var i = 0; i < listItemsLength; i++) {
      if (listItems[i].getAttribute("data-filler")) {
        continue;
      }

      itemLeftBorder = listItems[i].offsetLeft - node.scrollLeft;

      if (
        itemLeftBorder < nodeViewportCenter &&
        nodeViewportCenter < itemLeftBorder + listItems[i].clientWidth
      ) {
        return listItems[i];
      }
    }
  }

  function addFillers(node) {
    var filler = document.createElement("li");
    filler.setAttribute("data-filler", "first");
    filler.setAttribute("aria-hidden", "true");
    filler.setAttribute("role", "presentation");
    node.insertBefore(filler.cloneNode(), node.querySelector("li"));
    filler.setAttribute("data-filler", "last");
    node.insertBefore(filler, null);
  }

  function highlightCentermost(node) {
    var centermost = findCentermost(node);
    var firstLeftOfCenter = findFirstLeftOfCenter(node);
    var firstRightOfCenter = findFirstRightOfCenter(node);

    if (centermost) {
      centermost.classList.remove("dim");
    } else {
      firstLeftOfCenter.classList.remove("dim");
      firstRightOfCenter.classList.remove("dim");
    }

    var listItems = node.querySelectorAll("li:not(.dim)");
    var listItemsLength = listItems.length;

    for (var i = 0; i < listItemsLength; i++) {
      var isCentermost = centermost
        ? listItems[i] === centermost
        : listItems[i] === firstLeftOfCenter ||
          listItems[i] === firstRightOfCenter;
      if (!isCentermost) {
        listItems[i].classList.add("dim");
      }
    }
  }

  function styleArrowCursors(node) {
    var centermost = findCentermost(node);
    var firstLeftOfCenter = findFirstLeftOfCenter(node);
    var firstRightOfCenter = findFirstRightOfCenter(node);

    var listItems = node.querySelectorAll("li");
    var listItemsLength = listItems.length;
    var isBeforeCentermost = true;

    if (centermost) {
      centermost.classList.remove("before-centermost");
      centermost.classList.remove("after-centermost");
    } else {
      firstLeftOfCenter.classList.remove("before-centermost");
      firstLeftOfCenter.classList.remove("after-centermost");

      firstRightOfCenter.classList.remove("before-centermost");
      firstRightOfCenter.classList.remove("after-centermost");
    }

    for (var i = 0; i < listItemsLength; i++) {
      var isCentermost = centermost
        ? listItems[i] === centermost
        : listItems[i] === firstLeftOfCenter ||
          listItems[i] === firstRightOfCenter;

      if (isCentermost) {
        isBeforeCentermost = false;
      } else if (isBeforeCentermost) {
        listItems[i].classList.add("before-centermost");
        listItems[i].classList.remove("after-centermost");
      } /* isAfterCentermost */ else {
        listItems[i].classList.remove("before-centermost");
        listItems[i].classList.add("after-centermost");
      }
    }
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("ul[data-gallery]"),
    function initGallery(node) {
      var wrappedHighlightCentermost = supportsRAF
        ? wrapInRAF(highlightCentermost, node)
        : noop;

      var wrappedStyleArrowCursors = supportsRAF
        ? wrapInRAF(styleArrowCursors, node)
        : noop;

      window.addEventListener("keydown", function (e) {
        var LEFT = 37;
        var RIGHT = 39;
        var BOUNDS_OFFSET = 40;

        var bounding = node.getBoundingClientRect();
        var galleryTakesTheWholeScreen =
          bounding.top - BOUNDS_OFFSET < 0 &&
          bounding.bottom + BOUNDS_OFFSET >
            (window.innerHeight || document.documentElement.clientHeight);

        if (
          !galleryTakesTheWholeScreen &&
          (bounding.top + BOUNDS_OFFSET < 0 ||
            bounding.bottom - BOUNDS_OFFSET >
              (window.innerHeight || document.documentElement.clientHeight))
        ) {
          return;
        }

        if (e.keyCode === LEFT) {
          e.preventDefault();
          scrollToCenter(node, findFirstLeftOfCenter(node));
          wrappedHighlightCentermost();
          wrappedStyleArrowCursors();
        } else if (e.keyCode === RIGHT) {
          e.preventDefault();
          scrollToCenter(node, findFirstRightOfCenter(node));
          wrappedHighlightCentermost();
          wrappedStyleArrowCursors();
        }
      });

      Array.prototype.forEach.call(node.querySelectorAll("li"), function (li) {
        li.addEventListener("click", function () {
          scrollToCenter(node, li);
          wrappedHighlightCentermost();
          wrappedStyleArrowCursors();
        });
      });

      addFillers(node);

      function refreshLayout() {
        fillTheFillers(node);
        wrappedHighlightCentermost();
        wrappedStyleArrowCursors();
      }

      function refreshLayoutOnChildrenLoad(parent) {
        Array.prototype.forEach.call(
          parent.querySelectorAll("img"),
          function (img) {
            img.addEventListener("load", refreshLayout);
          }
        );

        Array.prototype.forEach.call(
          parent.querySelectorAll("video"),
          function (video) {
            var img;

            video.addEventListener("loadedmetadata", refreshLayout);
            if (video.poster) {
              img = new Image();
              img.addEventListener("load", refreshLayout);
              img.src = video.poster;
            }
          }
        );
      }

      refreshLayoutOnChildrenLoad(
        node.querySelector('li[data-filler="first"]').nextElementSibling
      );

      refreshLayoutOnChildrenLoad(
        node.querySelector('li[data-filler="last"]').previousElementSibling
      );

      if (resizeObserver /* && supportsRAF */) {
        resizeObserver.observe(node);
        node.addEventListener("scroll", wrappedHighlightCentermost, false);
        node.addEventListener("scroll", wrappedStyleArrowCursors, false);
      } else if (supportsRAF) {
        window.addEventListener("resize", wrapInRAF(onResize, node), false);
        node.addEventListener("scroll", wrappedHighlightCentermost, false);
        node.addEventListener("scroll", wrappedStyleArrowCursors, false);
      }
    }
  );
});
