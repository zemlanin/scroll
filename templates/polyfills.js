/* eslint-env browser */
var script;
var head = document.getElementsByTagName("head")[0];
var element = document.createElement("details");
var elementIsNative =
  typeof HTMLDetailsElement != "undefined" &&
  element instanceof HTMLDetailsElement;
if (!elementIsNative) {
  script = document.createElement("script");
  script.setAttribute("src", "/details-element-polyfill.js");
  script.setAttribute("type", "application/javascript");
  head.insertBefore(script, head.firstChild);
}
