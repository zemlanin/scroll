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

  for (const thumb of mediaBar.querySelectorAll(".media-thumbnail")) {
    thumb.addEventListener("click", mediaThumbnailClick);
  }

  for (const button of mediaBar.querySelectorAll("button[data-media-path]")) {
    button.addEventListener("click", mediaPathClick);
  }
});
