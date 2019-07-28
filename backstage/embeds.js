const url = require("url");

const cheerio = require("cheerio");
const rp = require("request-promise-native");

const { render } = require("../common.js");

const { authed, sendToAuthProvider } = require("./auth.js");

/*
  urls with opengraph data:
    https://vimeo.com/150001920 (xss)
    https://anton.click/npm (redirect)
    https://www.youtube.com/watch?v=PA6mzvHeMk4 (iframe)
    https://eidolamusic.bandcamp.com/album/to-speak-to-listen (iframe)
    https://m.imgur.com/t/cats/vSfGFEH (native video)
    http://dobyfriday.com/142 (twitter card player; audio)
    https://overcast.fm/%2BFNoE1mS94 (twitter card player; audio; escaped `+`)
    https://atp.fm/episodes/300 (no image -> no card)
    https://music.apple.com/ua/album/no-stopping-us-feat-jenny/1215204298?i=1215204497
    https://twitter.com/mikeyface/status/774823160852217856
    https://500ish.com/screwing-your-vocal-minority-dd4deb72448d
    https://www.theverge.com/2019/6/4/18651872/apple-macos-catalina-zsh-bash-shell-replacement-features
    http://foursquare.com/v/lab-by-dk/5ad36e49ad910e7bb2af114e
    https://www.imdb.com/title/tt4154796/
    https://soundcloud.com/fairtomidland/the-greener-grass
*/

const hasContent = meta => meta.content;
const metaInitial = meta => meta.name === "url" || meta.name === "title";
const tupleInitial = meta => [meta.name, meta.content];
const metaNameOG = meta => meta.name && meta.name.startsWith("og:");
const tupleNameOG = meta => [meta.name.slice(3), meta.content];
const metaPropertyOG = meta => meta.property && meta.property.startsWith("og:");
const tuplePropertyOG = meta => [meta.property.slice(3), meta.content];
const metaNameTwitter = meta => meta.name && meta.name.startsWith("twitter:");
const tupleNameTwitter = meta => [meta.name.slice(8), meta.content];

const cheerioAttrs = (i, el) => el.attribs;

const isSimpleProp = prop =>
  prop === "url" ||
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
  prop === "audio:type";

const isNumericProp = prop =>
  prop === "image:width" ||
  prop === "image:height" ||
  prop === "video:width" ||
  prop === "video:height" ||
  prop === "player:width" ||
  prop === "player:height";

// https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/markup
// https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/player-card
const isPlayerProp = prop =>
  prop === "player" ||
  prop === "player:width" ||
  prop === "player:height" ||
  prop === "player:stream" ||
  prop === "player:stream:content_type";

const numericIfNeeded = ([prop, value]) =>
  !isNumericProp(prop) || value.match(/^[0-9]+$/);

const rawMetaReducer = (acc, meta) => {
  if (meta.property) {
    return [...acc, { property: meta.property, content: meta.content }];
  } else {
    return [...acc, { name: meta.name, content: meta.content }];
  }
};

const metaPropertiesReducer = (acc, [prop, value]) => {
  let patch = {};

  if (isSimpleProp(prop) && !acc[prop]) {
    patch = { [prop]: value };
  } else if (isBasicMediaProp(prop)) {
    if (acc[prop] && acc[prop].length > 0) {
      const prevObj = acc[prop].pop();

      if (!prevObj.url) {
        patch = {
          [prop]: [...acc[prop], { ...prevObj, url: value }]
        };
      } else {
        patch = { [prop]: [...acc[prop], prevObj, { url: value }] };
      }
    } else {
      patch = { [prop]: [{ url: value }] };
    }
  } else if (isInitialMediaProp(prop)) {
    const prop0 = prop.split(":")[0]; // "image" or "video"

    if (acc[prop0] && acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      if (!prevObj.url) {
        patch = {
          [prop0]: [...acc[prop0], { ...prevObj, url: value }]
        };
      } else {
        patch = { [prop0]: [...acc[prop0], prevObj, { url: value }] };
      }
    } else {
      patch = { [prop0]: [{ url: value }] };
    }
  } else if (isMediaProp(prop) || isSecureUrlMediaProp(prop)) {
    let [prop0, prop1] = prop.split(":");

    if (isSecureUrlMediaProp(prop)) {
      prop1 = "url";
    }

    if (acc[prop0] && acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      patch = {
        [prop0]: [...acc[prop0], { ...prevObj, [prop1]: value }]
      };
    } else {
      patch = { [prop0]: [{ [prop1]: value }] };
    }
  } else if (isPlayerProp(prop)) {
    // prop0 = "player"
    // prop1 = undefined | "width" | "height" | "stream"
    // prop2 = undefined | "content_type"
    let [/* prop0 */ prop1, prop2] = prop.split(":").slice(1);

    if (prop === "player") {
      patch = {
        player: {
          url: value,
          ...(acc.player || {})
        }
      };
    } else if (prop1 !== "stream") {
      patch = {
        player: {
          [prop1]: value,
          ...(acc.player || {})
        }
      };
    } else {
      // else if (prop1 === "stream")
      if (prop1 === "stream" && prop2 === undefined) {
        prop2 = "url";
      }

      patch = {
        player: {
          ...(acc.player || {}),
          stream: {
            [prop2]: value,
            ...((acc.player && acc.player.stream) || {})
          }
        }
      };
    }
  }

  return {
    ...acc,
    ...patch
  };
};

const getVideoIframe = graph =>
  graph &&
  ((graph.video && graph.video.find(v => v.url && v.type === "text/html")) ||
    (graph.player && {
      url: graph.player.url,
      width: graph.player.width,
      height: graph.player.height
    }));

const getVideoNative = graph =>
  graph &&
  ((graph.video && graph.video.find(v => v.url && v.type === "video/mp4")) ||
    (graph.player &&
      graph.player.stream &&
      graph.player.stream.url &&
      graph.player.stream.content_type === "video/mp4" && {
        url: graph.player.stream.url,
        width: graph.player.width,
        height: graph.player.height,
        type: graph.player.stream.content_type
      }));

const getAudioNative = graph =>
  graph &&
  graph.player &&
  graph.player.stream &&
  graph.player.stream.url &&
  graph.player.stream.content_type === "audio/mpeg" && {
    url: graph.player.stream.url
  };

const getOpengraphFrameOverride = graphUrl => {
  let iframeUrl = null;

  const funnyOrDieId = graphUrl.match(
    /\/\/www\.funnyordie\.com\/videos\/([0-9a-f]+)/
  );
  if (funnyOrDieId) {
    iframeUrl = `https://www.funnyordie.com/embed/${funnyOrDieId[1]}`;
  }

  const vimeoId = graphUrl.match(/(vimeo\.com\/)(\d+)/);
  if (vimeoId) {
    iframeUrl = `https://player.vimeo.com/video/${vimeoId[2]}`;
  }

  const appleMusicPath = graphUrl.match(
    //         ($1          )              ($2)
    /https:\/\/(itunes|music)\.apple\.com\/(.+)/
  );
  if (appleMusicPath) {
    iframeUrl = `https://embed.music.apple.com/${appleMusicPath[2]}`;
  }

  if (iframeUrl) {
    return {
      url: iframeUrl,
      type: "text/html"
    };
  }

  return null;
};

const shouldDescriptionBeTruncated = metadata => {
  if (
    metadata &&
    metadata.url &&
    metadata.url.startsWith("https://twitter.com/")
  ) {
    return false;
  }

  return true;
};

module.exports = {
  loadMetadata: async ogPageURL => {
    if (ogPageURL && ogPageURL.startsWith("https://mobile.twitter.com/")) {
      ogPageURL = ogPageURL.replace(
        "https://mobile.twitter.com/",
        "https://twitter.com/"
      );
    }

    const $ = await rp.get({
      url: ogPageURL,
      followRedirect: true,
      headers: {
        Accept: "text/html",
        "User-Agent": "request (+https://zemlan.in)"
      },
      transform: body => cheerio.load(body),
      transform2xxOnly: true
    });

    const htmlTitle = $(`head title`)
      .text()
      .trim()
      .replace(`\n`, ` `);

    const rawMeta = $(
      `head meta[property^="og:"], head meta[name^="og:"], head meta[name^="twitter:"]`
    )
      .map(cheerioAttrs)
      .get()
      .filter(hasContent)
      .reduce(rawMetaReducer, [
        { name: "url", content: ogPageURL },
        { name: "title", content: htmlTitle }
      ]);

    return rawMeta;
  },
  generateCardJSON: rawMeta => {
    if (rawMeta.error) {
      return null;
    }

    const rawInitial = rawMeta.filter(metaInitial).map(tupleInitial);

    let rawOpengraph = rawMeta.filter(metaPropertyOG).map(tuplePropertyOG);

    if (rawOpengraph.length === 0) {
      // overcast.fm has incorrect <meta> tags
      // https://overcast.fm/+FNoE1mS94
      rawOpengraph = rawMeta.filter(metaNameOG).map(tupleNameOG);
    }

    const rawTwitter = rawMeta.filter(metaNameTwitter).map(tupleNameTwitter);

    const parsedMetadata = [...rawOpengraph, ...rawTwitter, ...rawInitial]
      .filter(numericIfNeeded)
      .reduce(metaPropertiesReducer, {});

    if (!(parsedMetadata.title && parsedMetadata.url && parsedMetadata.image)) {
      return {
        error: "not enough info",
        _parsedMetadata: parsedMetadata
      };
    }

    parsedMetadata._truncateDescription = shouldDescriptionBeTruncated(
      parsedMetadata
    );

    if (!getVideoIframe(parsedMetadata) && !getVideoNative(parsedMetadata)) {
      const videoOverride = getOpengraphFrameOverride(parsedMetadata.url);

      if (videoOverride) {
        parsedMetadata.video = [videoOverride, ...(parsedMetadata.video || [])];
      }
    }

    let img = null;
    let video = null;
    let audio = null;
    let iframe = null;

    let videoNative = getVideoNative(parsedMetadata);
    if (videoNative) {
      video = {
        src: videoNative.url,
        width: videoNative.width || 640,
        height: videoNative.height || 360
      };
    }

    let audioNative = getAudioNative(parsedMetadata);
    if (audioNative) {
      audio = {
        src: audioNative.url
      };
    }

    let videoIframe =
      videoNative || audioNative ? null : getVideoIframe(parsedMetadata);
    if (videoIframe) {
      iframe = {
        src: videoIframe.url,
        width: videoIframe.width || 640,
        height: videoIframe.height || 360
      };
    }

    const image = parsedMetadata.image && parsedMetadata.image.find(v => v.url);
    if (image) {
      img = {
        src: image.url,
        alt: image.alt,
        width: image.width,
        height: image.height
      };
    }

    const card = parsedMetadata
      ? {
          _parsedMetadata: parsedMetadata,
          title: parsedMetadata.title || "",
          url: parsedMetadata.url,
          description: parsedMetadata.description,
          _truncateDescription: parsedMetadata._truncateDescription,
          site_name: parsedMetadata.site_name,
          audio,
          video,
          iframe,
          img
        }
      : null;

    return card;
  },
  renderCard: async card => {
    if (!card || card.error) {
      return "";
    }

    return await render(`templates/card.mustache`, {
      card
    });
  },

  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }
  },

  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;

    let rawMetadata;
    let error;
    try {
      rawMetadata = query.url
        ? await module.exports.loadMetadata(query.url)
        : null;
    } catch (e) {
      error = `${e.name}${e.statusCode ? ": " + e.statusCode : ""}`;
    }

    const cardWithMetadata = rawMetadata
      ? await module.exports.generateCardJSON(rawMetadata)
      : null;

    let parsedMetadata = null;
    let card = null;

    if (cardWithMetadata) {
      ({ _parsedMetadata: parsedMetadata, ...card } = cardWithMetadata);
    }

    const cardHTML = cardWithMetadata
      ? await module.exports.renderCard(cardWithMetadata)
      : null;

    return render(`backstage/templates/embeds.mustache`, {
      blog: { title: "embed" },
      title: card ? card.title : "",
      url: query.url,
      card,
      cardHTML,
      cardJSON: JSON.stringify(error || card, null, 2),
      parsedMetadataJSON:
        parsedMetadata && JSON.stringify(parsedMetadata, null, 2),
      rawMetadata,
      rawMetadataJSON: rawMetadata && JSON.stringify(rawMetadata),
      status: {
        saved: true,
        preview: true,
        empty: true
      }
    });
  }
};
