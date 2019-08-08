const fontAwesomeSVGReducer = (acc, icon) => {
  // icon.icon: undefined | [width, height, ???, unicode, path]
  if (icon.icon) {
    acc[icon.iconName] = {
      viewBox: `0 0 ${icon.icon[0]} ${icon.icon[1]}`,
      path: icon.icon[4],
      toString: () => icon.icon[4]
    };
  }

  return acc;
};

const renderFontAwesome = fontAwesomeModule => {
  const blockFunction = function() {
    return function(text, render) {
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

module.exports = renderFontAwesome;
