/* eslint-env browser */
document.addEventListener("DOMContentLoaded", function() {
  const mediaBar = document.getElementById("media-bar");

  function mediaThumbnailClick(event) {
    const mediaId = event.currentTarget.dataset.id;
    const mediaExtra = document.querySelector(
      `.media-extra[data-id="${mediaId}"]`
    );

    mediaExtra.classList.toggle("is-hidden");
    event.currentTarget.classList.toggle("with-extra");

    if (event.currentTarget.classList.contains("with-extra")) {
      mediaBar.scrollTo({
        left: event.currentTarget.offsetLeft - 1,
        behavior: "smooth"
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
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })
      .then(resp => {
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

  for (const thumb of mediaBar.querySelectorAll(".media-thumbnail")) {
    thumb.addEventListener("click", mediaThumbnailClick);
  }

  for (const insertButton of mediaBar.querySelectorAll(
    "button[data-media-path]"
  )) {
    insertButton.addEventListener("click", mediaPathClick);
  }

  for (const convertButton of mediaBar.querySelectorAll(
    'button[data-convert-action="create"]'
  )) {
    convertButton.addEventListener("click", convertButtonClick);
  }
});
