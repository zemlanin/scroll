const cheerio = require("cheerio");
const rp = require("request-promise-native");

const { authed, sendToAuthProvider } = require("./auth.js");

module.exports = {
  loadOpenGraph: async ogPageURL => {
    const $ = await rp.get({
      url: ogPageURL,
      followRedirect: true,
      headers: { Accept: "text/html" },
      transform: body => cheerio.load(body),
      transform2xxOnly: true
    });
    const graph = $(`head meta[property^="og:"]`)
      .map((i, el) => el.attribs)
      .get()
      .filter(meta => meta.content)
      .reduce(
        (acc, meta) => ({ ...acc, [meta.property.slice(3)]: meta.content }),
        {}
      );

    if (!(graph.title && graph.url && graph.image)) {
      return null;
    }

    return graph;
  }
};
