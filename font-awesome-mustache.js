const fontAwesomeSVGReducer = (acc, icon) => {
  if (icon.icon) {
    // eslint-disable-next-line no-unused-vars
    const [width, height, _ligatures, _unicode, svgPathData] = icon.icon;

    acc[icon.iconName] = {
      viewBox: `0 0 ${width} ${height}`,
      path: svgPathData,
      toString: () => svgPathData,
    };
  }

  return acc;
};

const renderFontAwesome = (fontAwesomeModule) => {
  const blockFunction = function () {
    return function (text, render) {
      const iconName = render(text).trim();
      const icon = blockFunction[iconName];

      if (!icon) {
        throw new Error(`icon not found: ${iconName}`);
      }

      return render(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="${icon.viewBox}">` +
          `<path fill="currentColor" d="${icon.path}"></path>` +
          `</svg>`
      );
    };
  };

  return Object.values(fontAwesomeModule).reduce(
    fontAwesomeSVGReducer,
    blockFunction
  );
};

const fab = renderFontAwesome(
  require("@fortawesome/free-brands-svg-icons").fab
);
const far = renderFontAwesome(
  require("@fortawesome/free-regular-svg-icons").far
);
const fas = renderFontAwesome(require("@fortawesome/free-solid-svg-icons").fas);

module.exports = { fas, far, fab };
