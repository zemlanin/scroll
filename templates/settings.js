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

  var openerClassList = window.opener.document.body.classList;
  var classList = document.body.classList;

  if (enabledNightModeCookie) {
    classList.add("dark");
    openerClassList.add("dark");
    nightModeForm["night-mode"].value = "on";
  } else if (disabledNightModeCookie) {
    classList.add("light");
    openerClassList.add("light");
    nightModeForm["night-mode"].value = "off";
  }

  nightModeForm.addEventListener("change", function() {
    if (nightModeForm["night-mode"].value === "on") {
      classList.add("dark");
      classList.remove("light");
      openerClassList.add("dark");
      openerClassList.remove("light");
      document.cookie = "night-mode=1; path=/";
    } else if (nightModeForm["night-mode"].value === "off") {
      classList.remove("dark");
      classList.add("light");
      openerClassList.remove("dark");
      openerClassList.add("light");
      document.cookie = "night-mode=0; path=/";
    } else if (nightModeForm["night-mode"].value === "system") {
      classList.remove("dark");
      classList.remove("light");
      openerClassList.remove("dark");
      openerClassList.remove("light");
      document.cookie = "night-mode=; path=/";
    }
  });
});

document.addEventListener("DOMContentLoaded", function() {
  var ESCAPE = 27;

  document.addEventListener("keydown", function(event) {
    if (event.keyCode === ESCAPE) {
      window.close();
    }
  });
});
