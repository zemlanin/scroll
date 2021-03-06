document.addEventListener("DOMContentLoaded", function () {
  const mediaBar = document.getElementById("media-bar");
  mediaBar.scrollLeft = 0;
  let moreMediaIntersectionObserver = null;

  async function replaceMediaBarHTML(response) {
    const htmlTag = document.createElement("html");
    htmlTag.innerHTML = await response.text();

    if (moreMediaIntersectionObserver) {
      if (moreMediaIntersectionObserver.unobserve) {
        const moreMediaButton = mediaBar.querySelector("[data-more-media-url]");

        if (moreMediaButton) {
          moreMediaIntersectionObserver.unobserve(moreMediaButton);
        }
      } else if (moreMediaIntersectionObserver.disconnect) {
        moreMediaIntersectionObserver.disconnect();
      }
    }

    mediaBar.querySelector(".media-thumbnail-list").remove();
    mediaBar.insertBefore(htmlTag.querySelector(".media-thumbnail-list"), null);
    htmlTag.innerHTML = "";
    bindThumbnailHandlers(mediaBar.querySelector(".media-thumbnail-list"));

    const newMoreButton = mediaBar.querySelector("[data-more-media-url]");

    if (newMoreButton) {
      moreMediaIntersectionObserver.observe(newMoreButton);
    }
  }

  function loadMore() {
    const moreMediaButton = mediaBar.querySelector("[data-more-media-url]");
    if (!moreMediaButton) {
      return;
    }

    if (moreMediaButton.classList.contains("loading")) {
      return;
    }

    moreMediaButton.classList.add("loading");
    const moreMediaButtonLi = moreMediaButton.closest("li");

    const parent = moreMediaButton.closest("ul");
    const url = moreMediaButton.getAttribute("data-more-media-url");
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const htmlTag = document.createElement("html");
        htmlTag.innerHTML = await r.text();

        bindThumbnailHandlers(htmlTag);

        for (const thumb of htmlTag.querySelectorAll(".media-thumbnail")) {
          parent.insertBefore(thumb.closest("li"), moreMediaButtonLi);
          parent.insertBefore(document.createTextNode(" "), moreMediaButtonLi);
        }

        const newMoreButton = htmlTag.querySelector("[data-more-media-url]");

        if (newMoreButton) {
          moreMediaButton.setAttribute(
            "data-more-media-url",
            newMoreButton.getAttribute("data-more-media-url")
          );
        } else {
          if (moreMediaIntersectionObserver) {
            if (moreMediaIntersectionObserver.unobserve) {
              moreMediaIntersectionObserver.unobserve(moreMediaButton);
            } else if (moreMediaIntersectionObserver.disconnect) {
              moreMediaIntersectionObserver.disconnect();
            }
          }
          parent.removeChild(moreMediaButtonLi);
        }
      })
      .catch((e) => {
        moreMediaButton.innerText = e.toString();
      })
      .then(() => {
        moreMediaButton.classList.remove("loading");
      });
  }

  function mediaThumbnailClick(event) {
    const mediaId = event.currentTarget.dataset.id;
    const mediaExtra = mediaBar.querySelector(
      `.media-extra[data-id="${mediaId}"]`
    );

    mediaExtra.classList.toggle("is-hidden");
    event.currentTarget.classList.toggle("with-extra");

    if (
      event.currentTarget.classList.contains("with-extra") &&
      mediaBar.scrollLeft + mediaBar.clientWidth <
        mediaExtra.offsetLeft + mediaExtra.clientWidth
    ) {
      mediaBar.scrollTo({
        left: Math.min(
          // left border of expanded thumbnail
          event.currentTarget.offsetLeft - 1,
          // rigth border of expanded thumbnail
          mediaExtra.offsetLeft +
            mediaExtra.clientWidth -
            mediaBar.clientWidth +
            1
        ),
        behavior: "smooth",
      });
    }
  }

  function mediaPathClick(event) {
    const text = event.currentTarget.getAttribute("data-media-path").trim();

    const textarea = document.querySelector('textarea[name="text"]');
    const { selectionStart, selectionEnd } = textarea;
    // insert just path instead of ![](path)
    const needsPoster = Boolean(
      selectionStart === selectionEnd &&
        textarea.value &&
        textarea.value.slice(0, selectionStart).match(/poster=['"]?$/i)
    );

    textarea.value =
      textarea.value.slice(0, selectionStart) +
      (needsPoster ? text : `![](${text})`) +
      textarea.value.slice(selectionEnd);

    textarea.focus();
    textarea.selectionStart = selectionStart;
    textarea.selectionEnd = selectionEnd + text.length + needsPoster ? 0 : 5;
  }

  function convertButtonClick(event) {
    const button = event.currentTarget;
    const id = button.getAttribute("data-convert-id");
    const tag = button.getAttribute("data-convert-tag");

    button.innerText = "…";
    button.setAttribute("disabled", true);
    fetch(`/backstage/convert`, {
      method: "POST",
      body: `id=${id}&tag=${tag}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
      .then((resp) => {
        if (200 <= resp.status && resp.status < 300) {
          for (const insertButton of mediaBar.querySelectorAll(
            `button[data-media-path*="/${id}/${tag}"]`
          )) {
            insertButton.removeAttribute("disabled");
          }

          button.innerText = "✓";
          button.classList.add("is-info");
          button.classList.remove("is-danger");
        } else {
          button.innerText = "!";
          button.removeAttribute("disabled");
          button.classList.add("is-danger");
        }
      })
      .catch(() => {
        button.innerText = "!";
        button.removeAttribute("disabled");
        button.classList.add("is-danger");
      });
  }

  function bindThumbnailHandlers(parentEl) {
    for (const thumb of parentEl.querySelectorAll(".media-thumbnail")) {
      thumb.addEventListener("click", mediaThumbnailClick);
    }

    for (const insertButton of parentEl.querySelectorAll(
      "button[data-media-path]"
    )) {
      insertButton.addEventListener("click", mediaPathClick);
    }

    for (const convertButton of parentEl.querySelectorAll(
      'button[data-convert-action="create"]'
    )) {
      convertButton.addEventListener("click", convertButtonClick);
    }

    const moreMediaButton = parentEl.querySelector("[data-more-media-url]");
    if (moreMediaButton) {
      moreMediaButton.addEventListener("click", loadMore);
    }
  }

  bindThumbnailHandlers(mediaBar);

  const moreMediaButton = mediaBar.querySelector("[data-more-media-url]");
  if (moreMediaButton) {
    if (typeof IntersectionObserver != "undefined") {
      const observerCallback = (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.1) {
            loadMore();
          }
        }
      };
      moreMediaIntersectionObserver = new IntersectionObserver(
        observerCallback,
        {
          root: mediaBar,
          threshold: [0, 0.1],
        }
      );
      moreMediaIntersectionObserver.observe(moreMediaButton);
    }
  }

  const uploadForm = document.getElementById("upload-form");
  uploadForm.addEventListener("change", function () {
    const data = new FormData(uploadForm);

    fetch(uploadForm.action, {
      method: uploadForm.method,
      body: data,
      credentials: "include",
    }).then(replaceMediaBarHTML);
  });

  const newMediaUploadButton = mediaBar.querySelector(
    "[data-new-media-upload]"
  );
  if (newMediaUploadButton) {
    newMediaUploadButton.addEventListener("click", function () {
      uploadForm.querySelector("input").click();
    });
  }

  let dndCounter = 0;

  window.addEventListener("dragover", (event) => {
    event.stopPropagation();
    event.preventDefault();
    return false;
  });
  window.addEventListener("dragenter", (event) => {
    dndCounter++;
    event.dataTransfer.dropEffect = "copy";

    event.stopPropagation();
    event.preventDefault();

    if (newMediaUploadButton) {
      newMediaUploadButton.classList.add("has-background-info");
    }

    return false;
  });
  window.addEventListener("dragleave", (event) => {
    dndCounter--;

    event.stopPropagation();
    event.preventDefault();

    if (newMediaUploadButton && dndCounter === 0) {
      newMediaUploadButton.classList.remove("has-background-info");
    }

    return false;
  });
  window.addEventListener("drop", (event) => {
    dndCounter = 0;

    event.stopPropagation();
    event.preventDefault();

    if (newMediaUploadButton) {
      newMediaUploadButton.style.backgroundColor = "inherit";
    }

    const data = new FormData();

    if (event.dataTransfer.items) {
      for (const item of event.dataTransfer.items) {
        if (item.kind === "file") {
          data.append("files", item.getAsFile());
        }
      }
    } else {
      for (const item of event.dataTransfer.files) {
        data.append("files", item.getAsFile());
      }
    }

    fetch(uploadForm.action, {
      method: uploadForm.method,
      body: data,
      credentials: "include",
    }).then(replaceMediaBarHTML);
  });
});
