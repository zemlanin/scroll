const url = require("url");

const cheerio = require("cheerio");
const mustache = require("mustache");
const rp = require("request-promise-native");

const { authed, sendToAuthProvider } = require("./auth.js");

/*
  urls with opengraph data:
    https://vimeo.com/150001920 (xss)
    https://anton.click/npm (redirect)
    https://www.youtube.com/watch?v=PA6mzvHeMk4 (iframe)
    https://eidolamusic.bandcamp.com/album/to-speak-to-listen (iframe)
    https://music.apple.com/ua/album/no-stopping-us-feat-jenny/1215204298?i=1215204497
    https://twitter.com/mikeyface/status/774823160852217856
    https://500ish.com/screwing-your-vocal-minority-dd4deb72448d
    https://www.theverge.com/2019/6/4/18651872/apple-macos-catalina-zsh-bash-shell-replacement-features
    http://foursquare.com/v/lab-by-dk/5ad36e49ad910e7bb2af114e
    https://www.imdb.com/title/tt4154796/
    https://soundcloud.com/fairtomidland/the-greener-grass
*/

const hasContent = v => v.content;

const isSimpleProp = prop =>
  prop === "url" ||
  prop === "type" ||
  prop === "title" ||
  prop === "site_name" ||
  prop === "description";

const isBasicMediaProp = prop =>
  prop === "image" || prop === "video" || prop === "audio";

const isInitialMediaProp = prop =>
  prop === "image:url" || prop === "video:url" || prop === "audio:url";

const isSecureUrlMediaProp = prop =>
  prop === "image:secure_url" ||
  prop === "video:secure_url" ||
  prop === "audio:secure_url";

const isMediaProp = prop =>
  prop === "image:type" ||
  prop === "image:width" ||
  prop === "image:height" ||
  prop === "image:alt" ||
  prop === "video:type" ||
  prop === "video:width" ||
  prop === "video:height" ||
  prop === "aduio:type";

const isNumericProp = prop =>
  prop === "image:width" ||
  prop === "image:height" ||
  prop === "video:width" ||
  prop === "video:height";

const numericIfNeeded = ([prop, value]) =>
  !isNumericProp(prop) || value.match(/^[0-9]+$/);

const metaPropertiesReducer = (acc, [prop, value]) => {
  let patch = {};

  if (isSimpleProp(prop)) {
    patch = { [prop]: value };
  } else if (isBasicMediaProp(prop)) {
    patch = { [prop]: [...(acc[prop] || []), { url: value }] };
  } else if (isInitialMediaProp(prop)) {
    const prop0 = prop.split(":")[0]; // "image" or "video"

    if (acc[prop0] && acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      if (prevObj.url !== value) {
        patch = {
          [prop0]: [...acc[prop0], { ...prevObj, url: value }]
        };
      } else {
        patch = { [prop0]: [...acc[prop0], prevObj, { url: value }] };
      }
    } else {
      patch = { [prop0]: [...(acc[prop0] || []), { url: value }] };
    }
  } else if (isMediaProp(prop) || isSecureUrlMediaProp(prop)) {
    let [prop0, prop1] = prop.split(":");

    if (isSecureUrlMediaProp(prop)) {
      prop1 = "url";
    }

    if (acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      patch = {
        [prop0]: [...acc[prop0], { ...prevObj, [prop1]: value }]
      };
    }
  }

  return {
    ...acc,
    ...patch,
    _raw: [...acc._raw, { [prop]: value }]
  };
};

module.exports = {
  loadOpenGraph: async ogPageURL => {
    let $;
    try {
      $ = await rp.get({
        url: ogPageURL,
        followRedirect: true,
        headers: {
          Accept: "text/html",
          "User-Agent": "request (+https://zemlan.in)"
        },
        transform: body => cheerio.load(body),
        transform2xxOnly: true
      });
    } catch (e) {
      return null;
    }

    const htmlTitle = $(`head title`)
      .text()
      .trim()
      .replace(`\n`, ` `);

    const graph = $(`head meta[property^="og:"]`)
      .map((i, el) => el.attribs)
      .get()
      .filter(hasContent)
      .map(meta => [meta.property.slice(3), meta.content])
      .filter(numericIfNeeded)
      .reduce(metaPropertiesReducer, {
        _raw: [],
        title: htmlTitle,
        url: url
      });

    if (!(graph.title && graph.url && graph.image)) {
      return null;
    }

    return graph;
  },

  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;
    if (!query.url) {
      res.statusCode = 404;
      return `404`;
    }

    const graph = await module.exports.loadOpenGraph(query.url);

    if (!graph) {
      return `no opengraph data`;
    }

    let iframe = null;
    if (graph.video && graph.video.some(v => v.url && v.type === "text/html")) {
      const video = graph.video.find(v => v.url && v.type === "text/html");
      iframe = {
        src: video.url,
        width: video.width || 640,
        height: video.height || 360
      };
    }

    let img = null;
    if (graph.image && graph.image.some(v => v.url)) {
      const image = graph.image.find(v => v.url);
      img = {
        src: image.url,
        alt: image.alt,
        width: image.width,
        height: image.height
      };
    }

    return mustache.render(
      `
        <div>
          {{# iframe }}
            <iframe
              width="{{width}}"
              height="{{height}}"
              src="{{src}}"
            ></iframe><br/>
          {{/ iframe }}
          {{# img }}
            <img
              {{# alt}}
                alt="{{alt}}"
              {{/ alt}}
              {{# width}}
                width="{{width}}"
              {{/ width}}
              {{# height}}
                height="{{height}}"
              {{/ height}}
              src="{{src}}"
            ><br/>
          {{/ img }}
          <a href="{{ graph.url }}"><b>{{ graph.title }}</b> • {{ graph.site_name }}</a><br/>
          {{# graph.description }}
            <i>{{ graph.description }}</i>
          {{/ graph.description }}
        </div>
        <pre><code>{{ graphJSON }}</code></pre>
      `,
      { graph, iframe, img, graphJSON: JSON.stringify(graph, null, 2) }
    );
  }
};
