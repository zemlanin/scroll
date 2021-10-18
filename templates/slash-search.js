window["slash-search"] = function slashSearch(selector) {
  var SLASH_KEY_CODE = 47;
  var ESCAPE_KEY_CODE = 27;
  var input;

  var ignore = function () {
    return (
      document.activeElement &&
      (document.activeElement.tabIndex !== -1 ||
        document.activeElement.tagName === "A" ||
        document.activeElement.tagName === "BUTTON" ||
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.tagName === "DETAILS" ||
        document.activeElement.tagName === "SUMMARY" ||
        document.activeElement.tagName === "AUDIO" ||
        document.activeElement.tagName === "VIDEO")
    );
  };

  selector = selector || 'input[name="q"]';

  function initInput() {
    if (input) {
      return input;
    }

    input = document.querySelector(selector);

    if (input) {
      input.addEventListener("focus", catchFocus);
    }

    return input;
  }

  function catchSlash(event) {
    if (event.keyCode !== SLASH_KEY_CODE) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    input = initInput();

    if (!input) {
      return;
    }

    if (
      input === document.activeElement ||
      (document.body !== document.activeElement && ignore())
    ) {
      return;
    }

    input.focus();
    event.preventDefault();
  }

  function catchFocus() {
    if (!input) {
      return;
    }

    input.addEventListener("keypress", catchEscape);
    input.addEventListener("blur", catchBlur);
  }

  function catchBlur() {
    if (!input) {
      return;
    }

    input.removeEventListener("keypress", catchEscape);
    input.removeEventListener("blur", catchBlur);
  }

  function catchEscape(event) {
    if (event.keyCode !== ESCAPE_KEY_CODE) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    input = initInput();

    if (!input) {
      return;
    }

    if (input !== document.activeElement) {
      return;
    }

    input.blur();
  }

  document.addEventListener("keypress", catchSlash);
  document.addEventListener("keypress", catchEscape);
};
