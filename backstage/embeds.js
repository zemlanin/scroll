const fs = require("fs");
const url = require("url");
const path = require("path");

const mime = require("mime");
const cheerio = require("cheerio");
const caseless = require("caseless");
const mustache = require("mustache");
const { RequestError } = require("request-promise-native/errors");

const { render } = require("./render.js");

const { getSession, sendToAuthProvider } = require("./auth.js");

const CARD_TEMPLATE_PATH = path.resolve(
  __dirname,
  "templates",
  "card.mustache"
);

/*
  urls with opengraph data:
    https://vimeo.com/150001920 (xss)
    https://anton.click/npm (redirect)
    https://www.youtube.com/watch?v=PA6mzvHeMk4 (iframe)
    https://eidolamusic.bandcamp.com/album/to-speak-to-listen (iframe)
    https://m.imgur.com/t/cats/vSfGFEH (native video)
    http://dobyfriday.com/142 (twitter card player; audio)
    https://overcast.fm/+R7DXHWA8I (twitter card player; audio)
    https://atp.fm/episodes/300 (no image -> no card)
    https://music.apple.com/ua/album/no-stopping-us-feat-jenny/1215204298?i=1215204497
    https://twitter.com/mikeyface/status/774823160852217856
    https://500ish.com/screwing-your-vocal-minority-dd4deb72448d
    https://www.theverge.com/2019/6/4/18651872/apple-macos-catalina-zsh-bash-shell-replacement-features
    http://foursquare.com/v/lab-by-dk/5ad36e49ad910e7bb2af114e
    https://www.imdb.com/title/tt4154796/
    https://soundcloud.com/fairtomidland/the-greener-grass
*/

function loadCardTemplate() {
  if (loadCardTemplate.cache && process.env.NODE_ENV !== "development") {
    return loadCardTemplate.cache;
  }

  return (loadCardTemplate.cache = fs
    .readFileSync(CARD_TEMPLATE_PATH)
    .toString());
}
loadCardTemplate.cache = "";

const hasContent = (meta) => meta.content;
const metaInitial = (meta) =>
  meta.name === "url" || meta.name === "title" || meta.name === "mimetype";
const tupleInitial = (meta) => [meta.name, meta.content];
const metaNameOG = (meta) => meta.name && meta.name.startsWith("og:");
const tupleNameOG = (meta) => [meta.name.slice(3), meta.content];
const metaPropertyOG = (meta) =>
  meta.property && meta.property.startsWith("og:");
const tuplePropertyOG = (meta) => [meta.property.slice(3), meta.content];
const metaNameTwitter = (meta) => meta.name && meta.name.startsWith("twitter:");
const tupleNameTwitter = (meta) => [meta.name.slice(8), meta.content];
const metaPropertyTwitter = (meta) =>
  meta.property && meta.property.startsWith("twitter:");
const tuplePropertyTwitter = (meta) => [meta.property.slice(8), meta.content];

const cheerioAttrs = (i, el) => el.attribs;

const isSimpleProp = (prop) =>
  prop === "url" ||
  prop === "title" ||
  prop === "mimetype" ||
  prop === "site_name" ||
  prop === "description";

const isBasicMediaProp = (prop) =>
  prop === "image" || prop === "video" || prop === "audio";

const isInitialMediaProp = (prop) =>
  prop === "image:url" || prop === "video:url" || prop === "audio:url";

const isSecureUrlMediaProp = (prop) =>
  prop === "image:secure_url" ||
  prop === "video:secure_url" ||
  prop === "audio:secure_url";

const isMediaProp = (prop) =>
  prop === "image:type" ||
  prop === "image:width" ||
  prop === "image:height" ||
  prop === "image:alt" ||
  prop === "image:user_generated" ||
  prop === "video:type" ||
  prop === "video:width" ||
  prop === "video:height" ||
  prop === "audio:type";

const isNumericProp = (prop) =>
  prop === "image:width" ||
  prop === "image:height" ||
  prop === "video:width" ||
  prop === "video:height" ||
  prop === "player:width" ||
  prop === "player:height";

// https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/markup
// https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/player-card
const isPlayerProp = (prop) =>
  prop === "player" ||
  prop === "player:width" ||
  prop === "player:height" ||
  prop === "player:stream" ||
  prop === "player:stream:content_type";

const isRestrictionsProp = (prop) => prop === "restrictions:age";

const isAgeRestricted = (graph) => {
  return Boolean(
    graph && graph.restrictions && graph.restrictions.age === "18+"
  );
};

const numericIfNeeded = ([prop, value]) =>
  !isNumericProp(prop) || value.match(/^[0-9]+$/);

const getURLMimetype = (href) => {
  const pathname = new URL(href).pathname;
  return (pathname && mime.getType(pathname)) || null;
};

const rawMetaReducer = (acc, meta) => {
  if (meta.property) {
    return [...acc, { property: meta.property, content: meta.content }];
  } else {
    return [...acc, { name: meta.name, content: meta.content }];
  }
};

function isInsecureSquarespaceCDNurl(url) {
  // https://support.squarespace.com/hc/en-us/articles/205812748-Image-and-file-URLs-in-Squarespace
  return (
    url &&
    (url.startsWith("http://static1.squarespace.com/") ||
      url.startsWith("http://images.squarespace-cdn.com/") ||
      url.startsWith("http://static.squarespace.com/"))
  );
}

const metaPropertiesReducer = (acc, [prop, value]) => {
  let patch = {};

  if (isSimpleProp(prop) && !acc[prop]) {
    patch = { [prop]: value };
  } else if (isBasicMediaProp(prop)) {
    const patchNode = {
      url: value,
    };

    if (isInsecureSquarespaceCDNurl(value)) {
      patchNode.secure_url = value.replace(/^http:/, "https:");
    }

    if (acc[prop] && acc[prop].length > 0) {
      const prevObj = acc[prop].pop();

      if (!prevObj.url) {
        patch = {
          [prop]: [...acc[prop], { ...prevObj, ...patchNode }],
        };
      } else {
        patch = { [prop]: [...acc[prop], prevObj, patchNode] };
      }
    } else {
      patch = { [prop]: [patchNode] };
    }
  } else if (isInitialMediaProp(prop) || isSecureUrlMediaProp(prop)) {
    let [prop0, prop1] = prop.split(":");

    const patchNode = {
      [prop1]: value,
    };

    if (isSecureUrlMediaProp(prop)) {
      patchNode.url = value;
    } else if (isInsecureSquarespaceCDNurl(patchNode.url)) {
      patchNode.secure_url = patchNode.url.replace(/^http:/, "https:");
    }

    if (acc[prop0] && acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      if (!prevObj.url) {
        patch = {
          [prop0]: [...acc[prop0], { ...prevObj, ...patchNode }],
        };
      } else {
        patch = { [prop0]: [...acc[prop0], prevObj, patchNode] };
      }
    } else {
      patch = { [prop0]: [patchNode] };
    }
  } else if (isMediaProp(prop)) {
    let [prop0, prop1] = prop.split(":");

    const patchNode = { [prop1]: value };

    if (acc[prop0] && acc[prop0].length > 0) {
      const prevObj = acc[prop0].pop();

      patch = {
        [prop0]: [...acc[prop0], { ...prevObj, ...patchNode }],
      };
    } else {
      patch = { [prop0]: [patchNode] };
    }
  } else if (isPlayerProp(prop)) {
    // prop0 = "player"
    // prop1 = undefined | "width" | "height" | "stream"
    // prop2 = undefined | "content_type"
    let [/* prop0, */ prop1, prop2] = prop.split(":").slice(1);

    if (prop === "player") {
      patch = {
        player: {
          url: value,
          ...(acc.player || {}),
        },
      };
    } else if (prop1 !== "stream") {
      patch = {
        player: {
          [prop1]: value,
          ...(acc.player || {}),
        },
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
            ...((acc.player && acc.player.stream) || {}),
          },
        },
      };
    }
  } else if (isRestrictionsProp(prop)) {
    // prop0 = "restrictions"
    // prop1 = "age"
    let [prop0, prop1] = prop.split(":");

    if (prop1 === "age") {
      patch = {
        ...(acc[prop0] || {}),
        [prop0]: {
          [prop1]: value,
        },
      };
    }
  }

  return {
    ...acc,
    ...patch,
  };
};

const getVideoIframe = (graph) =>
  graph &&
  ((graph.video && graph.video.find((v) => v.url && v.type === "text/html")) ||
    (graph.player && {
      url: graph.player.url,
      width: graph.player.width,
      height: graph.player.height,
    }));

const getVideoNative = (graph) => {
  if (!graph) {
    return null;
  }

  let video = null;

  if (!video && graph.video) {
    video = graph.video.find((v) => v.url && v.type === "video/mp4");
  }

  if (
    !video &&
    graph.player &&
    graph.player.stream &&
    graph.player.stream.url &&
    graph.player.stream.content_type === "video/mp4"
  ) {
    video = {
      url: graph.player.stream.url,
      width: graph.player.width,
      height: graph.player.height,
      type: graph.player.stream.content_type,
    };
  }

  if (video) {
    video.poster = getImageNative(graph, { static: true });
  }

  return video;
};

const getAudioNative = (graph) => {
  if (!graph) {
    return null;
  }

  let audio = null;

  if (
    !audio &&
    graph.player &&
    graph.player.stream &&
    graph.player.stream.url &&
    graph.player.stream.content_type === "audio/mpeg"
  ) {
    audio = {
      url: graph.player.stream.url,
    };
  }

  if (!audio && graph.audio) {
    for (const entry of graph.audio) {
      if (
        entry.url &&
        (entry.type === "audio/vnd.facebook.bridge" ||
          entry.type === "audio/mpeg")
      ) {
        audio = {
          url: entry.url,
        };
        break;
      }
    }
  }

  if (audio) {
    audio.poster = getImageNative(graph);
  }

  return audio;
};

const getImageNative = (graph, options) => {
  if (!(graph && graph.image && graph.image.length)) {
    return null;
  }

  const isGif = (v) =>
    "image/gif" === (v.type ? v.type : getURLMimetype(v.url));

  if (options && options.static) {
    return (
      graph.image.find((v) => v.secure_url && !isGif(v)) ||
      graph.image.find((v) => v.url && !isGif(v))
    );
  }

  return (
    graph.image.find((v) => v.secure_url) || graph.image.find((v) => v.url)
  );
};

//                                    ($1          )              ($2)
const APPLE_MUSIC_REGEX = /^https:\/\/(itunes|music)\.apple\.com\/(.+)/;

const getFrameFallback = (graphUrl) => {
  const funnyOrDieId = graphUrl.match(
    /\/\/www\.funnyordie\.com\/videos\/([0-9a-f]+)/
  );
  if (funnyOrDieId) {
    return {
      video: [
        {
          url: `https://www.funnyordie.com/embed/${funnyOrDieId[1]}`,
          type: "text/html",
        },
      ],
    };
  }

  const vimeoId = graphUrl.match(/(vimeo\.com\/)(\d+)/);
  if (vimeoId) {
    return {
      video: [
        {
          url: `https://player.vimeo.com/video/${vimeoId[2]}`,
          type: "text/html",
        },
      ],
    };
  }

  const appleMusicPath = graphUrl.match(APPLE_MUSIC_REGEX);
  if (appleMusicPath) {
    return {
      video: [
        {
          url: `https://embed.music.apple.com/${appleMusicPath[2]}`,
          type: "text/html",
        },
      ],
    };
  }

  return {};
};

const isTwitterCard = (cardURL) => {
  return cardURL && cardURL.startsWith("https://twitter.com/");
};

const isYoutubeCard = (cardURL) => {
  return cardURL && cardURL.startsWith("https://www.youtube.com/watch");
};

const shouldDescriptionBeTruncated = (cardURL) => {
  if (isTwitterCard(cardURL)) {
    return false;
  }

  return true;
};

const prepareEmbed = (embed) => {
  embed.original_url_encoded = encodeURIComponent(embed.original_url);
  embed.raw_metadata = JSON.parse(embed.raw_metadata);
  embed.created = new Date(parseInt(embed.created))
    .toISOString()
    .replace(/:\d{2}\.\d{3}Z$/, "");

  return embed;
};

async function queryEmbed(db, embedURL) {
  if (!embedURL) {
    return null;
  }

  const embed = await db.get(
    `
      SELECT
        original_url,
        strftime('%s000', created) created,
        mimetype,
        raw_metadata
      FROM embeds
      WHERE original_url = ?1
    `,
    { 1: embedURL }
  );

  if (!embed) {
    return null;
  }

  return prepareEmbed(embed);
}

async function getSingleEmbed(req, _res) {
  const query = url.parse(req.url, true).query;

  const db = await req.db();

  const existingEmbed = await queryEmbed(db, query.url);

  if (existingEmbed) {
    existingEmbed.backstageUrl = `/backstage/embeds?url=${encodeURIComponent(
      existingEmbed.original_url
    )}`;
  }

  let mimetype;
  let cardHTML;
  let rawMetadata;
  let requested;
  if (!existingEmbed || query.request) {
    let error;
    try {
      rawMetadata = query.url
        ? await module.exports.loadMetadata(query.url)
        : null;
    } catch (e) {
      error = e.name;

      if (e.statusCode) {
        error = error + ": " + e.statusCode;
        rawMetadata = [
          { name: "url", content: query.url },
          { name: "mimetype", content: "text/html" },
        ];
      } else if (e instanceof RequestError) {
        error = error + ": " + e.error.code;
        rawMetadata = [
          { name: "url", content: query.url },
          { name: "mimetype", content: "text/html" },
        ];
      } else {
        console.error(e);
      }
    }

    const cardWithMetadata = rawMetadata
      ? module.exports.generateCardJSON(rawMetadata)
      : null;

    let parsedMetadata = null;
    let card = null;

    if (cardWithMetadata) {
      ({ _parsedMetadata: parsedMetadata, ...card } = cardWithMetadata);
    }

    mimetype = cardWithMetadata ? cardWithMetadata.mimetype : null;
    cardHTML = cardWithMetadata
      ? module.exports.renderCard(cardWithMetadata)
      : null;

    requested = {
      cardJSON: JSON.stringify(error || card, null, 2),
      parsedMetadataJSON:
        parsedMetadata && JSON.stringify(parsedMetadata, null, 2),
    };
  } else if (existingEmbed) {
    mimetype = existingEmbed.mimetype;
    rawMetadata = existingEmbed.raw_metadata;
    const cardWithMetadata = module.exports.generateCardJSON(rawMetadata);
    cardHTML = module.exports.renderCard(cardWithMetadata);
  }

  return render("embed.mustache", {
    url: query.url,
    existingEmbed,
    mimetype,
    cardHTML,
    requested,
    rawMetadata,
    rawMetadataJSON: rawMetadata && JSON.stringify(rawMetadata),
    status: {
      saved: !query.request && Boolean(existingEmbed),
      requested: cardHTML && (!existingEmbed || Boolean(query.request)),
    },
  });
}

const PAGE_SIZE = 20;

async function getEmbedsList(req, _res) {
  const db = await req.db();
  const query = url.parse(req.url, true).query;

  const offset = +query.offset || 0;

  let embeds;

  if (query.q) {
    embeds = (
      await db.all(
        `
          SELECT
            original_url,
            strftime('%s000', created) created,
            mimetype,
            raw_metadata
          FROM embeds
          WHERE instr(original_url, ?3)
          ORDER BY datetime(created) DESC, original_url DESC
          LIMIT ?2 OFFSET ?1
        `,
        {
          1: offset,
          2: PAGE_SIZE + 1,
          3: query.q && decodeURIComponent(query.q),
        }
      )
    ).map(prepareEmbed);
  } else {
    embeds = (
      await db.all(
        `
          SELECT
            original_url,
            strftime('%s000', created) created,
            mimetype,
            raw_metadata
          FROM embeds
          ORDER BY datetime(created) DESC, original_url DESC
          LIMIT ?2 OFFSET ?1
        `,
        { 1: offset, 2: PAGE_SIZE + 1 }
      )
    ).map(prepareEmbed);
  }

  const moreEmbeds = embeds.length > PAGE_SIZE;

  return render(`embeds.mustache`, {
    embeds,
    q: query.q || "",
    urls: {
      older: moreEmbeds
        ? url.resolve(
            req.absolute,
            `/backstage/embeds?offset=${offset + PAGE_SIZE}${
              query.q ? "&q=" + query.q : ""
            }`
          )
        : null,
      newest:
        offset > PAGE_SIZE
          ? url.resolve(
              req.absolute,
              `/backstage/embeds/${query.q ? "?q=" + query.q : ""}`
            )
          : null,
      newer: +offset
        ? url.resolve(
            req.absolute,
            `/backstage/embeds?offset=${Math.max(offset - PAGE_SIZE, 0)}${
              query.q ? "&q=" + query.q : ""
            }`
          )
        : null,
    },
  });
}

const ABSOLUTE_URL_REGEX = /^[a-z][a-z\d+-.]*:/;

function getUserAgent(url) {
  if (url && url.startsWith("https://twitter.com/")) {
    // workaround until opengraph tags are included in newer Twitter design
    // https://twittercommunity.com/t/twitter-removed-opengraph-tags-from-server-rendered-tweet-page/138473/6
    return "DiscourseBot/1.0";
  }

  return "request (+https://zemlan.in)";
}

module.exports = {
  queryEmbed,
  loadMetadata: async (ogPageURL) => {
    if (!ogPageURL) {
      return null;
    }

    if (!ABSOLUTE_URL_REGEX.test(ogPageURL)) {
      const expectedMimetype = getURLMimetype(ogPageURL);

      return expectedMimetype
        ? [
            { name: "url", content: ogPageURL },
            { name: "mimetype", content: expectedMimetype },
          ]
        : null;
    }

    if (ogPageURL.startsWith("https://mobile.twitter.com/")) {
      ogPageURL = ogPageURL.replace(
        "https://mobile.twitter.com/",
        "https://twitter.com/"
      );
    } else if (ogPageURL.startsWith("https://www.youtube.com/embed/")) {
      ogPageURL = ogPageURL.replace(
        "https://www.youtube.com/embed/",
        "https://www.youtube.com/watch?v="
      );
    }

    const expectedMimetype = getURLMimetype(ogPageURL);

    let mimetypeFromURL = null;
    const jar = require("request-promise-native").jar();

    if (
      expectedMimetype &&
      (expectedMimetype.startsWith("image/") ||
        expectedMimetype.startsWith("video/") ||
        expectedMimetype.startsWith("audio/"))
    ) {
      const headers = await require("request-promise-native").head({
        url: ogPageURL,
        jar: jar,
        resolveWithFullResponse: true,
        followRedirect: true,
        timeout: 4000,
        headers: {
          Accept: mimetypeFromURL,
          "User-Agent": getUserAgent(ogPageURL),
        },
      });

      const cHeaders = headers && caseless(headers);

      if (
        cHeaders &&
        cHeaders.get("content-type") &&
        mime.getType(mime.getExtension(cHeaders.get("content-type"))) ===
          expectedMimetype
      ) {
        mimetypeFromURL = expectedMimetype;
      }
    }

    const headers = await require("request-promise-native").head({
      url: ogPageURL,
      jar: jar,
      followRedirect: true,
      timeout: 4000,
      headers: {
        Accept: "text/html,*/*;q=0.8",
        "User-Agent": getUserAgent(ogPageURL),
      },
    });

    const cHeaders = headers && caseless(headers);

    const mimetype =
      cHeaders &&
      cHeaders.get("content-type") &&
      mime.getType(mime.getExtension(cHeaders.get("content-type")));

    if (mimetype !== "text/html") {
      return [
        { name: "url", content: ogPageURL },
        { name: "mimetype", content: mimetype },
      ];
    }

    const $ = await require("request-promise-native").get({
      url: ogPageURL,
      jar: jar,
      followRedirect: true,
      timeout: 4000,
      headers: {
        Accept: "text/html; charset=utf-8",
        "User-Agent": getUserAgent(ogPageURL),
      },
      transform: (body) => cheerio.load(body),
      transform2xxOnly: true,
    });

    const htmlTitle = $(`head title`).text().trim().replace(`\n`, ` `);

    const initialMeta = [
      { name: "url", content: ogPageURL },
      htmlTitle && { name: "title", content: htmlTitle },
      { name: "mimetype", content: mimetypeFromURL || mimetype },
    ].filter(Boolean);

    const rawMeta = $(
      `
        head meta[property^="og:"],
        head meta[name^="og:"],
        head meta[property^="twitter:"],
        head meta[name^="twitter:"]
      `
    )
      .map(cheerioAttrs)
      .get()
      .filter(hasContent)
      .reduce(rawMetaReducer, initialMeta);

    return rawMeta;
  },
  generateCardJSON: (rawMeta) => {
    const rawInitial = rawMeta
      .filter(metaInitial)
      .map(tupleInitial)
      .filter(numericIfNeeded)
      .reduce(metaPropertiesReducer, {});
    const frameFallback = getFrameFallback(rawInitial.url);
    if (frameFallback.video) {
      rawInitial.video = frameFallback.video;
    }

    let rawOpengraph = rawMeta
      .filter(metaPropertyOG)
      .map(tuplePropertyOG)
      .filter(numericIfNeeded);

    if (rawOpengraph.length === 0) {
      // overcast.fm has incorrect <meta> tags
      // https://overcast.fm/+FNoE1mS94
      rawOpengraph = rawMeta
        .filter(metaNameOG)
        .map(tupleNameOG)
        .filter(numericIfNeeded);
    }

    rawOpengraph = rawOpengraph.reduce(metaPropertiesReducer, {});

    let rawTwitter = rawMeta
      .filter(metaNameTwitter)
      .map(tupleNameTwitter)
      .filter(numericIfNeeded);

    if (rawTwitter.length === 0) {
      // spotify has incorrect <meta> tags
      // https://open.spotify.com/playlist/3OyGj2MDXWtSn5vmaTFzQ0
      rawTwitter = rawMeta
        .filter(metaPropertyTwitter)
        .map(tuplePropertyTwitter)
        .filter(numericIfNeeded);
    }

    rawTwitter = rawTwitter.reduce(metaPropertiesReducer, {});

    const card = {
      _parsedMetadata: {
        _: rawInitial,
        og: rawOpengraph,
        twitter: rawTwitter,
      },
      mimetype: rawInitial.mimetype || "text/html",
      title: rawOpengraph.title || rawTwitter.title || rawInitial.title,
      url: rawOpengraph.url || rawTwitter.url || rawInitial.url,
      description:
        rawOpengraph.description ||
        rawTwitter.description ||
        rawInitial.description,
      _truncateDescription: false,
      site_name: rawOpengraph.site_name || rawTwitter.site_name || "",
      img: null,
      video: null,
      audio: null,
      iframe: null,
    };

    if (card.description && isTwitterCard(card.url)) {
      card.description = card.description.replace(/^“|”$/g, "");
    }

    if (shouldDescriptionBeTruncated(card.url)) {
      card._truncateDescription = true;
    }

    if (card.title && card.title.endsWith(card.site_name)) {
      card._hideRepeatedSiteName = true;
    }

    const videoNative =
      getVideoNative(rawTwitter) ||
      getVideoNative(rawOpengraph) ||
      getVideoNative(rawInitial);
    if (videoNative) {
      card.video = {
        src: videoNative.url,
        width: videoNative.width || 640,
        height: videoNative.height || 360,
        loop: getURLMimetype(card.url) === "image/gif",
      };

      if (videoNative.poster) {
        card.img = {
          src: videoNative.poster.url,
          alt: videoNative.poster.alt,
          width: videoNative.poster.width,
          height: videoNative.poster.height,
        };
      }
    }

    const audioNative =
      getAudioNative(rawOpengraph) ||
      getAudioNative(rawTwitter) ||
      getAudioNative(rawInitial);
    if (audioNative) {
      card.audio = {
        src: audioNative.url,
      };

      if (audioNative.poster) {
        card.img = {
          src: audioNative.poster.url,
          alt: audioNative.poster.alt,
          width: audioNative.poster.width,
          height: audioNative.poster.height,
        };
      }
    }

    if (!videoNative && !audioNative) {
      const videoIframe =
        getVideoIframe(rawOpengraph) ||
        getVideoIframe(rawTwitter) ||
        getVideoIframe(rawInitial);
      if (videoIframe && isYoutubeCard && !isAgeRestricted(rawOpengraph)) {
        card.iframe = {
          src: videoIframe.url,
          width: videoIframe.width || 640,
          height: videoIframe.height || 360,
        };
      }
    }

    if (!card.img) {
      const imageOptions = videoNative ? { static: true } : null;
      const image = card.url.match(APPLE_MUSIC_REGEX)
        ? getImageNative(rawTwitter, imageOptions) ||
          getImageNative(rawOpengraph, imageOptions) ||
          getImageNative(rawInitial, imageOptions)
        : getImageNative(rawOpengraph, imageOptions) ||
          getImageNative(rawTwitter, imageOptions) ||
          getImageNative(rawInitial, imageOptions);

      if (image) {
        card.img = {
          src: image.secure_url || image.url,
          alt: image.alt,
          width: image.width,
          height: image.height,
          user_generated: image.user_generated,
        };
      }
    }

    if (card.title) {
      if (card.img && !card.img.alt) {
        card.img.alt = card.title;
      }

      card.title = card.title
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    if (card.site_name) {
      card.site_name = card.site_name
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    if (card.description) {
      card.description = card.description
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/\n/g, "<br>");
    }

    if (isTwitterCard(card.url) && card.description) {
      card.description = card.description.replace(
        /(https:\/\/t.co\/[0-9a-zA-Z]+)/g,
        `<a href="$1">$1</a>`
      );

      if (
        !card.audio &&
        !card.video &&
        !card.iframe &&
        (!card.img || !card.img.user_generated)
      ) {
        card.quote = card.description;
        card.description = "";
        card.img = null;
      }
    }

    return card;
  },
  renderCard: (card) => {
    if (!card) {
      return "";
    }

    if (card.mimetype === "image/gif" && card.video && card.video.src) {
      return `<video playsinline autoplay muted loop src="${
        card.video.src
      }" title="${card.title || card.description || ""}"></video>`;
    }

    if (card.mimetype.startsWith("image/")) {
      return `<img src="${card.url}" title="${
        card.title || card.description || ""
      }" loading="lazy" />`;
    }

    if (card.mimetype.startsWith("video/")) {
      if (card.img && card.img.src) {
        return `<video playsinline controls preload="metadata" poster="${card.img.src}" src="${card.url}"></video>`;
      }

      return `<video playsinline controls preload="metadata" src="${card.url}"></video>`;
    }

    if (card.mimetype.startsWith("audio/")) {
      return `<audio controls preload="metadata" src="${card.url}"></audio>`;
    }

    if (
      !card.img &&
      !card.audio &&
      !card.video &&
      !card.iframe &&
      !card.quote
    ) {
      return `<a href="${card.url}">${card.title || card.url}</a>`;
    }

    if (card.error) {
      return "";
    }

    return mustache.render(loadCardTemplate(), { card });
  },

  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const db = await req.db();

    const original_url = req.post.original_url;

    if (!original_url) {
      res.statusCode = 400;
      return `original_url is required`;
    }

    const existingEmbed = await queryEmbed(db, original_url);

    if (req.post.delete === "1") {
      if (existingEmbed) {
        await db.run(`DELETE FROM embeds WHERE original_url = ?1`, {
          1: original_url,
        });

        res.writeHead(303, {
          Location: url.resolve(req.absolute, `/backstage/embeds`),
        });

        return;
      } else {
        res.statusCode = 404;
        return;
      }
    }

    if (!req.post.mimetype) {
      res.statusCode = 400;
      return `mimetype is required to save`;
    }

    if (!req.post.raw_metadata) {
      res.statusCode = 400;
      return `raw_metadata is required to save`;
    }

    try {
      JSON.parse(req.post.raw_metadata);
    } catch (e) {
      res.statusCode = 400;
      return `raw_metadata has to be in JSON format`;
    }

    if (existingEmbed) {
      await db.run(
        `UPDATE embeds SET
          raw_metadata = ?2,
          mimetype = ?4,
          created = ?5
          WHERE original_url = ?1`,
        {
          1: original_url,
          2: req.post.raw_metadata,
          4: req.post.mimetype,
          5: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        }
      );
    } else {
      await db.run(
        `INSERT INTO embeds
          (original_url, raw_metadata, mimetype, created)
          VALUES (?1, ?2, ?4, ?5)`,
        {
          1: original_url,
          2: req.post.raw_metadata,
          4: req.post.mimetype,
          5: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        }
      );
    }

    res.writeHead(303, {
      Location: url.resolve(
        req.absolute,
        `/backstage/embeds?url=${encodeURIComponent(original_url)}`
      ),
    });

    return;
  },

  get: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;

    if (query.url) {
      return await getSingleEmbed(req, res);
    }

    return await getEmbedsList(req, res);
  },
};
