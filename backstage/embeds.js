const path = require("path");

const mime = require("mime");
const cheerio = require("cheerio");
const caseless = require("caseless");
const { RequestError } = require("request-promise-native/errors");
const oEmbedProviders = require("oembed-providers");
const faTiktok = require("@fortawesome/free-brands-svg-icons/faTiktok.js");

const {
  DIST,
  getLinkId,
  getBlogObject,
  writeFileWithGzip,
} = require("../common.js");
const generatePost = require("../generate-post.js");
const {
  generateLinkblogPage,
  generateLinkblogRSSPage,
  notifyWebSub,
} = require("../linkblog.js");

const { render } = require("./render.js");
const {
  renderCard,
  isNativeVideoMimetype,
  isAppleMusicCard,
  isApplePodcastsCard,
  isTwitterCard,
  isTikTokCard,
  isCoubCard,
  isVimeoCard,
  isYoutubeCard,
  isGiphyCard,
} = require("./render-card.js");

const { getSession, sendToAuthProvider } = require("./auth.js");

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
    https://media.giphy.com/media/POZAVqMVRAmjY7jh4L/giphy.gif (giphy doesn't serve `image/gif` when client `Accept`s `text/html`)
*/

const hasContent = (meta) => meta.content;
const metaInitial = (meta) =>
  meta.name === "url" ||
  meta.name === "title" ||
  meta.name === "mimetype" ||
  meta.name === "author";
const tupleInitial = (meta) => (meta.link ? null : [meta.name, meta.content]);
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
  prop === "site" ||
  prop === "author" ||
  prop === "description" ||
  prop === "type";

const isBasicMediaProp = (prop) =>
  prop === "image" || prop === "video" || prop === "audio";

const isInitialMediaProp = (prop) =>
  prop === "image:url" ||
  prop === "image:src" ||
  prop === "video:url" ||
  prop === "audio:url";

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
  const pathname = new URL(href, "https://example.com").pathname;
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

    if (prop1 === "src") {
      prop1 = "url";
    }

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

      if (
        !prevObj.url ||
        prevObj.url === patchNode.url ||
        prevObj.secure_url === patchNode.url ||
        prevObj.url === patchNode.secure_url
      ) {
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

const ABSOLUTE_URL_REGEX = /^[a-z][a-z\d+-.]*:/;

const isAbsoluteUrl = (url) => Boolean(url && ABSOLUTE_URL_REGEX.test(url));

const getVideoIframe = (graph) => {
  if (!graph) {
    return null;
  }

  if (graph.video) {
    const videoHtmlPlayer = graph.video.find(
      (v) => v.url && v.type === "text/html"
    );

    if (videoHtmlPlayer) {
      return {
        url: videoHtmlPlayer.url,
        width: videoHtmlPlayer.width
          ? parseInt(videoHtmlPlayer.width, 10)
          : null,
        height: videoHtmlPlayer.height
          ? parseInt(videoHtmlPlayer.height, 10)
          : null,
      };
    }
  }

  if (graph.player) {
    return {
      url: graph.player.url,
      width: graph.player.width ? parseInt(graph.player.width, 10) : null,
      height: graph.player.height ? parseInt(graph.player.height, 10) : null,
    };
  }
};

const getOEmbedVideoIframe = (oEmbed, options = {}) => {
  if (!oEmbed || !oEmbed.html) {
    return null;
  }

  if (
    !(oEmbed.type === "video" || (oEmbed.type === "rich" && options.allowRich))
  ) {
    return null;
  }

  const frameBody =
    // `<base>` is for iframes with protocol-less urls, like `//coub.com/embed/2pc24rpb`
    '<base href="https://example.com/"><style>html,body,iframe{padding:0;margin:0;height:100%;max-height:100%;max-width:100%;}</style>' +
    oEmbed.html;

  const frameURL = `data:text/html;charset=utf-8;base64,${Buffer.from(
    frameBody
  ).toString("base64")}`;

  return {
    url: frameURL,
    width: oEmbed.width ? parseInt(oEmbed.width, 10) : null,
    height: oEmbed.height ? parseInt(oEmbed.height, 10) : null,
  };
};

function findWithFallbacks(arr, ...conditions) {
  if (arr.length === 0) {
    return undefined;
  }

  for (const cond of conditions) {
    const result = arr.find(cond);

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

const MP4_MIMETYPE = "video/mp4";
const M3U8_MIMETYPE = "application/vnd.apple.mpegurl";

const getVideoNative = (graph) => {
  if (!graph) {
    return null;
  }

  let video = null;

  if (!video && graph.video) {
    video = findWithFallbacks(
      graph.video.filter((v) => v.url),
      (v) => v.type === MP4_MIMETYPE,
      (v) => getURLMimetype(v.url) === MP4_MIMETYPE,
      (v) => v.type === M3U8_MIMETYPE,
      (v) => getURLMimetype(v.url) === M3U8_MIMETYPE
    );
  }

  if (
    !video &&
    graph.player &&
    graph.player.stream &&
    graph.player.stream.url &&
    isNativeVideoMimetype(graph.player.stream.content_type)
  ) {
    video = {
      url: graph.player.stream.url,
      width: graph.player.width ? parseInt(graph.player.width, 10) : null,
      height: graph.player.height ? parseInt(graph.player.height, 10) : null,
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

  let entry;
  if (options && options.static) {
    entry =
      graph.image.find((v) => v.secure_url && !isGif(v)) ||
      graph.image.find((v) => v.url && !isGif(v));
  } else {
    entry =
      graph.image.find((v) => v.secure_url) || graph.image.find((v) => v.url);
  }

  if (!entry) {
    return null;
  }

  return {
    url: entry.url,
    secure_url: entry.secure_url,
    alt: entry.alt,
    user_generated: entry.user_generated,
    width: entry.width ? parseInt(entry.width, 10) : null,
    height: entry.height ? parseInt(entry.height, 10) : null,
  };
};

const getOEmbedImageNative = (oEmbed, options) => {
  if (!oEmbed) {
    return null;
  }

  const isTypePhoto = oEmbed.type === "photo";

  const imageURL = isTypePhoto ? oEmbed.url : oEmbed.thumbnail_url;

  if (!imageURL) {
    return null;
  }

  if (options && options.static && "image/gif" === getURLMimetype(imageURL)) {
    return null;
  }

  if (isTypePhoto) {
    return {
      url: oEmbed.url,
      width: oEmbed.width ? parseInt(oEmbed.width, 10) : null,
      height: oEmbed.height ? parseInt(oEmbed.height, 10) : null,
    };
  }

  return {
    url: oEmbed.thumbnail_url,
    width: oEmbed.thumbnail_width ? parseInt(oEmbed.thumbnail_width, 10) : null,
    height: oEmbed.thumbnail_height
      ? parseInt(oEmbed.thumbnail_height, 10)
      : null,
  };
};

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

  if (isAppleMusicCard(graphUrl)) {
    const videoURL = new URL(graphUrl);

    videoURL.hostname = "embed.music.apple.com";

    return {
      video: [
        {
          url: videoURL.toString(),
          type: "text/html",
        },
      ],
    };
  }

  if (isApplePodcastsCard(graphUrl)) {
    const videoURL = new URL(graphUrl);
    const singleEpisodeEmbed = videoURL.searchParams.has("i");

    videoURL.hostname = "embed.podcasts.apple.com";

    return {
      video: [
        {
          url: videoURL.toString(),
          type: "text/html",
          width: 660,
          height: singleEpisodeEmbed ? 175 : 450,
        },
      ],
    };
  }

  return {};
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

const prepareLinkblogEntry = (entry) => {
  entry.original_url_encoded = encodeURIComponent(entry.original_url);
  entry.created = new Date(parseInt(entry.created))
    .toISOString()
    .replace(/:\d{2}\.\d{3}Z$/, "");

  return entry;
};

async function queryLinkblog(db, original_url) {
  if (!original_url) {
    return null;
  }

  const linkblogEntry = await db.get(
    `
      SELECT
        id,
        source_id,
        original_url,
        strftime('%s000', created) created,
        private
      FROM linklist
      WHERE
        original_url = ?1
    `,
    { 1: original_url }
  );

  if (!linkblogEntry) {
    return null;
  }

  return prepareLinkblogEntry(linkblogEntry);
}

async function getSingleEmbed(req, _res) {
  const { searchParams } = new URL(req.url, req.absolute);
  const urlParam = searchParams.get("url");

  const db = await req.db();

  const existingEmbed = await queryEmbed(db, urlParam);

  if (existingEmbed) {
    existingEmbed.backstageUrl = `/backstage/embeds?url=${encodeURIComponent(
      existingEmbed.original_url
    )}`;
  }

  let mimetype;
  let cardHTML;
  let rawMetadata;
  let requested;
  let naked = !!searchParams.get("naked");
  if (!existingEmbed || searchParams.get("request")) {
    let error;
    try {
      rawMetadata = urlParam
        ? await module.exports.loadMetadata(urlParam)
        : null;
    } catch (e) {
      error = e.name;

      if (e.statusCode) {
        error = error + ": " + e.statusCode;
        rawMetadata = [
          { name: "url", content: urlParam },
          { header: true, key: "content-type", value: "text/html" },
        ];
      } else if (e instanceof RequestError) {
        error = error + ": " + e.error.code;
        rawMetadata = [
          { name: "url", content: urlParam },
          { header: true, key: "content-type", value: "text/html" },
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
      ? renderCard(cardWithMetadata, { externalFrames: naked })
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
    cardHTML = renderCard(cardWithMetadata, {
      externalFrames: naked,
    });
  }

  if (naked) {
    cardHTML = `<iframe width="100%" style="min-height: 80vh;" src="data:text/html;charset=utf8,${encodeURIComponent(
      "<style>html,body,iframe,img{max-width:100%;}</style>" + cardHTML
    )}"/>`;
  }

  const linkblogEntry = existingEmbed
    ? await queryLinkblog(db, urlParam)
    : null;

  return render("embed.mustache", {
    url: urlParam,
    existingEmbed,
    mimetype,
    cardHTML,
    requested,
    rawMetadata,
    rawMetadataJSON: rawMetadata && JSON.stringify(rawMetadata),
    status: {
      saved: !searchParams.get("request") && Boolean(existingEmbed),
      requested:
        cardHTML && (!existingEmbed || Boolean(searchParams.get("request"))),
    },
    linkblog: linkblogEntry && !linkblogEntry.private ? linkblogEntry : null,
  });
}

const PAGE_SIZE = 20;

async function getEmbedsList(req, res) {
  const db = await req.db();
  const { searchParams } = new URL(req.url, req.absolute);

  const offset = +searchParams.get("offset") || 0;

  let embeds;
  const query = searchParams.get("q");

  if (query) {
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
          3: query,
        }
      )
    ).map(prepareEmbed);
  } else if (searchParams.has("q")) {
    res.statusCode = 302;
    res.setHeader("Location", "/backstage/embeds");
    return;
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
    q: query || "",
    urls: {
      older: moreEmbeds
        ? new URL(
            `/backstage/embeds?` +
              new URLSearchParams({
                ...(query ? { q: query } : null),
                offset: offset + PAGE_SIZE,
              }),
            req.absolute
          ).toString()
        : null,
      newest:
        offset > PAGE_SIZE
          ? new URL(
              `/backstage/embeds` +
                (query
                  ? "?" +
                    new URLSearchParams({
                      q: query,
                    })
                  : ""),
              req.absolute
            ).toString()
          : null,
      newer:
        +offset && +offset <= PAGE_SIZE
          ? new URL(
              `/backstage/embeds` +
                (query
                  ? "?" +
                    new URLSearchParams({
                      q: query,
                    })
                  : ""),
              req.absolute
            ).toString()
          : +offset
          ? new URL(
              `/backstage/embeds?` +
                new URLSearchParams({
                  ...(query ? { q: query } : null),
                  offset: Math.max(offset - PAGE_SIZE, 0),
                }),
              req.absolute
            ).toString()
          : null,
    },
  });
}

function getUserAgent(_url) {
  // `Bot` in the user-agent helps with loading twitter.com opengraph data
  return "Scroll-EmbedsBot (+https://zemlan.in)";
}

function getOEmbedLinkFromProviders(url) {
  // https://www.tiktok.com/@hotvickkrishna/video/6937457241968643334

  for (const provider of oEmbedProviders) {
    for (const endpoint of provider.endpoints) {
      if (!endpoint.schemes) {
        if (url.startsWith(provider.provider_url)) {
          const href = new URL(endpoint.url.replace("{format}", "json"));
          href.searchParams.set("format", "json");
          href.searchParams.set("url", url);

          return {
            link: true,
            type: "application/json+oembed",
            href: href.toString(),
          };
        } else {
          continue;
        }
      }

      for (const scheme of endpoint.schemes) {
        if (!scheme.startsWith("http")) {
          continue;
        }

        const { protocol, hostname, pathname } = scheme.match(
          /^(?<protocol>https?:\/\/)(?<hostname>[^/]+)(?<pathname>\/.*)$/
        ).groups;

        if (
          !hostname.includes("*") &&
          !url.startsWith(`${protocol}${hostname}/`)
        ) {
          continue;
        }

        const schemeRegexp = new RegExp(
          `^${protocol}${hostname.replace(
            /\*/g,
            "[a-z0-9-]+"
          )}${pathname.replace(/\*/g, "[^/]+")}`
        );

        if (url.match(schemeRegexp)) {
          const href = new URL(endpoint.url.replace("{format}", "json"));
          href.searchParams.set("format", "json");
          href.searchParams.set("url", url);

          return {
            link: true,
            type: "application/json+oembed",
            href: href.toString(),
          };
        }
      }
    }
  }

  return null;
}

function tiktokPlaceholder() {
  const { width, height, svgPathData } = faTiktok;
  const iconX = 80 - faTiktok.width / 20;

  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 70">
          <defs><style type="text/css">
            text {
              font-size: 4px;
              font-family: "SF Mono", "Menlo-Regular", Consolas, "Andale Mono WT",
                "Andale Mono", "Lucida Console", "Lucida Sans Typewriter",
                "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Liberation Mono",
                "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
            }
          </style></defs>
          <rect x="0" y="0" height="70" width="160" fill="white" />
          <svg x="${iconX - 2}" y="${
        10 - 2
      }" xmlns="http://www.w3.org/2000/svg" width="${width / 10}px" height="${
        height / 10
      }px" viewBox="0 0 ${width} ${height}">
            <path fill="#69c9d0" d="${svgPathData}"></path>
          </svg>
          <svg x="${iconX + 2}" y="${
        10 + 2
      }" xmlns="http://www.w3.org/2000/svg" width="${width / 10}px" height="${
        height / 10
      }px" viewBox="0 0 ${width} ${height}">
            <path fill="#ee1d52" d="${svgPathData}"></path>
          </svg>
          <svg x="${iconX}" y="${10}" xmlns="http://www.w3.org/2000/svg" width="${
        width / 10
      }px" height="${height / 10}px" viewBox="0 0 ${width} ${height}">
            <path fill="#010101" d="${svgPathData}"></path>
          </svg>
        </svg>
      `.replace(/^\s+/gm, "")
    )
  );
}

async function getHeadersFromHEAD(url, jar) {
  const headResp = await require("request-promise-native").head({
    url,
    // youtube redirects to consent page when loaded with cookies from EU IPs
    jar: isYoutubeCard(url) ? null : jar,
    followRedirect: true,
    resolveWithFullResponse: true,
    timeout: 4000,
    headers: {
      Accept: "text/html,*/*;q=0.8",
      "User-Agent": getUserAgent(url),
    },
  });

  const cHeaders = headResp && headResp.headers && caseless(headResp.headers);

  return cHeaders || null;
}

function hardcodedURLReplacement(ogPageURL) {
  if (ogPageURL.startsWith("https://mobile.twitter.com/")) {
    return ogPageURL.replace(
      "https://mobile.twitter.com/",
      "https://twitter.com/"
    );
  } else if (ogPageURL.startsWith("https://www.youtube.com/embed/")) {
    return ogPageURL.replace(
      "https://www.youtube.com/embed/",
      "https://www.youtube.com/watch?v="
    );
  }

  return ogPageURL;
}

async function extractNative(ogPageURL, jar) {
  const expectedMimetype = getURLMimetype(ogPageURL);

  let nativeMediaMetadata = {};

  if (
    expectedMimetype &&
    (expectedMimetype.startsWith("image/") ||
      isNativeVideoMimetype(expectedMimetype) ||
      expectedMimetype.startsWith("audio/"))
  ) {
    let cHeaders;
    try {
      cHeaders = await getHeadersFromHEAD(ogPageURL, jar);
    } catch (e) {
      if (e && e.statusCode) {
        // 403 Forbidden
        // 405 Method Not Allowed
        // etc.
      } else {
        throw e;
      }
    }

    if (
      cHeaders &&
      cHeaders.get("content-type") &&
      mime.getType(mime.getExtension(cHeaders.get("content-type"))) ===
        expectedMimetype
    ) {
      nativeMediaMetadata["content-type"] = expectedMimetype;

      // flickr sets `imagewidth` and `imageheight` headers for image responses
      // https://live.staticflickr.com/3040/2362225867_4a87ab8baf_b.jpg
      if (cHeaders.get("imagewidth")) {
        nativeMediaMetadata.width = cHeaders.get("imagewidth");
      }

      if (cHeaders.get("imageheight")) {
        nativeMediaMetadata.height = cHeaders.get("imageheight");
      }
    }
  }

  let cHeaders;
  try {
    cHeaders = await getHeadersFromHEAD(ogPageURL, jar);
  } catch (e) {
    if (e && e.statusCode) {
      // 403 Forbidden
      // 405 Method Not Allowed
      // etc.
    } else {
      throw e;
    }
  }

  const mimetype =
    cHeaders &&
    cHeaders.get("content-type") &&
    mime.getType(mime.getExtension(cHeaders.get("content-type")));

  if (mimetype && !nativeMediaMetadata["content-type"]) {
    nativeMediaMetadata["content-type"] = mimetype;
  }

  return nativeMediaMetadata;
}

async function extractOpengraph(ogPageURL, jar) {
  let $;

  try {
    $ = await require("request-promise-native").get({
      url: ogPageURL,
      // youtube redirects to consent page when loaded with cookies from EU IPs
      jar: isYoutubeCard(ogPageURL) ? null : jar,
      followRedirect: true,
      timeout: 4000,
      headers: {
        Accept: "text/html; charset=utf-8",
        "User-Agent": getUserAgent(ogPageURL),
      },
      transform: (body) => cheerio.load(body),
      transform2xxOnly: true,
    });
  } catch (e) {
    if (e && e.statusCode) {
      // 403 Forbidden
      // etc.
      return [];
    } else {
      throw e;
    }
  }

  const htmlTitle = $(`head title`).text().trim().replace(`\n`, ` `);

  // http://microformats.org/wiki/existing-rel-values
  const relThumbnails = $(`head link[rel="thumbnail"]`)
    .map(cheerioAttrs)
    .get()
    .filter((link) => link.href)
    .map((link) => ({
      link: true,
      rel: link.rel,
      href: link.href,
      sizes: link.sizes,
      type:
        link.type || getURLMimetype(new URL(link.href, ogPageURL).toString()),
    }));

  const relImageSrcs = $(`head link[rel="image_src"]`)
    .map(cheerioAttrs)
    .get()
    .filter((link) => link.href)
    .map((link) => ({
      link: true,
      rel: link.rel,
      href: link.href,
      type:
        link.type || getURLMimetype(new URL(link.href, ogPageURL).toString()),
    }));

  const relIcons = $(
    `head link[rel="icon"], head link[rel="shortcut icon"], head link[rel="apple-touch-icon"]`
  )
    .map(cheerioAttrs)
    .get()
    .filter((link) => link.href)
    .map((link) => ({
      link: true,
      rel: link.rel,
      href: link.href,
      type:
        link.type || getURLMimetype(new URL(link.href, ogPageURL).toString()),
      sizes: link.sizes,
    }));

  const initialMeta = [
    htmlTitle && { name: "title", content: htmlTitle },
    ...relThumbnails,
    ...relImageSrcs,
    ...relIcons,
  ].filter(Boolean);

  const rawOpengraphMeta = $(
    `
      head meta[property^="og:"],
      head meta[name^="og:"],
      head meta[property^="twitter:"],
      head meta[name^="twitter:"],
      head meta[name="author"]
    `
  )
    .map(cheerioAttrs)
    .get()
    .filter(hasContent)
    .reduce(rawMetaReducer, initialMeta);

  const oEmbedDiscoveryEl = $(`head link[type="application/json+oembed"]`)
    .map(cheerioAttrs)
    .get(0);

  if (oEmbedDiscoveryEl && oEmbedDiscoveryEl.href) {
    rawOpengraphMeta.push({
      link: true,
      type: oEmbedDiscoveryEl.type,
      href: oEmbedDiscoveryEl.href,
    });
  }

  return rawOpengraphMeta;
}

async function extractOEmbed(ogPageURL, oEmbedURL) {
  const oEmbedEndpoint = new URL(oEmbedURL);
  oEmbedEndpoint.searchParams.set("maxwidth", 2000);
  oEmbedEndpoint.searchParams.set("maxheight", 2000);

  return await require("request-promise-native").get({
    url: oEmbedEndpoint.toString(),
    followRedirect: true,
    timeout: 4000,
    headers: {
      Accept: "application/json; charset=utf-8",
      "User-Agent": getUserAgent(ogPageURL),
    },
    transform: (body) => JSON.parse(body),
    transform2xxOnly: true,
  });
}

async function generateLinkblog(db) {
  const blog = await getBlogObject();

  await writeFileWithGzip(
    path.join(DIST, "linkblog.html"),
    await generateLinkblogPage(db, blog)
  );

  await writeFileWithGzip(
    path.join(DIST, "feeds/linkblog.xml"),
    await generateLinkblogRSSPage(db, blog)
  );

  const pagination = await generatePost.getPagination(db, null);
  const newestPage = pagination[0] || { index: 0, posts: [] };

  await writeFileWithGzip(
    path.join(DIST, "index.html"),
    await generatePost.generateIndexPage(db, blog, newestPage)
  );

  await notifyWebSub();
}

module.exports = {
  queryEmbed,
  loadMetadata: async (ogPageURL) => {
    if (!ogPageURL) {
      return null;
    }

    if (!isAbsoluteUrl(ogPageURL)) {
      const expectedMimetype = getURLMimetype(ogPageURL);

      return expectedMimetype
        ? [
            { name: "url", content: ogPageURL },
            { name: "mimetype", content: expectedMimetype },
          ]
        : null;
    }

    ogPageURL = hardcodedURLReplacement(ogPageURL);

    const jar = require("request-promise-native").jar();

    const nativeMediaMetadata = await extractNative(ogPageURL, jar);

    const initialMeta = [
      { name: "url", content: ogPageURL },
      {
        header: true,
        key: "content-type",
        value: nativeMediaMetadata["content-type"] || "text/html",
      },
    ];

    if (
      nativeMediaMetadata["content-type"] &&
      nativeMediaMetadata["content-type"] !== "text/html"
    ) {
      return [
        ...initialMeta,
        nativeMediaMetadata.width && {
          header: true,
          key: "width",
          value: nativeMediaMetadata.width,
        },
        nativeMediaMetadata.height && {
          header: true,
          key: "height",
          value: nativeMediaMetadata.height,
        },
      ].filter(Boolean);
    }

    const rawOpengraphMeta = await extractOpengraph(ogPageURL, jar);

    let oEmbedLink = rawOpengraphMeta.find(
      (m) => m.link && m.type === "application/json+oembed"
    );

    const rawOEmbedMeta = [];

    if (oEmbedLink) {
      // `oEmbedLink` is already in the result (because it is in `rawOpengraphMeta`)
      //
      // rawOEmbedMeta.push(oEmbedLink)
    } else {
      oEmbedLink = getOEmbedLinkFromProviders(ogPageURL);

      if (oEmbedLink) {
        rawOEmbedMeta.push(oEmbedLink);
      }
    }

    if (oEmbedLink) {
      let oEmbed;

      try {
        oEmbed = await extractOEmbed(ogPageURL, oEmbedLink.href);
      } catch (e) {
        //
      }

      if (oEmbed) {
        rawOEmbedMeta.push({
          oembed: oEmbed,
        });
      }
    }

    return [...initialMeta, ...rawOpengraphMeta, ...rawOEmbedMeta];
  },
  generateCardJSON: (rawMeta) => {
    let rawInitial = rawMeta
      .filter(metaInitial)
      .map(tupleInitial)
      .filter(Boolean)
      .filter(numericIfNeeded)
      .reduce(metaPropertiesReducer, {});
    const frameFallback = getFrameFallback(rawInitial.url);
    if (frameFallback.video) {
      rawInitial.video = frameFallback.video;
    }

    if (
      rawInitial.mimetype &&
      !rawMeta.some((v) => v.header && v.key === "content-type")
    ) {
      // support for legacy cards
      rawMeta.push({
        header: true,
        key: "content-type",
        value: rawInitial.mimetype,
      });
    }

    for (const header of rawMeta.filter((v) => v.header)) {
      if (header.key === "content-type") {
        rawInitial.mimetype = header.value;

        if (header.value.startsWith("image/")) {
          rawInitial.image = [
            {
              url: rawInitial.url,
              type: header.value,
            },
          ];
        } else if (isNativeVideoMimetype(header.value)) {
          rawInitial.video = [
            {
              url: rawInitial.url,
              type: header.value,
            },
          ];
        } else if (header.value.startsWith("audio/")) {
          rawInitial.audio = [
            {
              url: rawInitial.url,
              type: header.value,
            },
          ];
        }
      }

      if (
        header.key === "width" &&
        header.value &&
        rawInitial.image &&
        rawInitial.image[0]
      ) {
        rawInitial.image[0].width = header.value;
      }

      if (
        header.key === "height" &&
        header.value &&
        rawInitial.image &&
        rawInitial.image[0]
      ) {
        rawInitial.image[0].height = header.value;
      }
    }

    for (const link of rawMeta.filter((v) => v.link)) {
      if (link.rel === "thumbnail") {
        const parsedSizes = link.sizes
          ? link.sizes.match(/^(?<width>\d+)x(?<height>\d+)$/)
          : null;

        rawInitial.image = rawInitial.image || [];
        rawInitial.image.push({
          url: link.href,
          type: link.type,
          width:
            parsedSizes &&
            parsedSizes.groups.width &&
            parseInt(parsedSizes.groups.width, 10),
          height:
            parsedSizes &&
            parsedSizes.groups.height &&
            parseInt(parsedSizes.groups.height, 10),
        });
      } else if (link.rel === "image_src") {
        rawInitial.image = rawInitial.image || [];
        rawInitial.image.push({
          url: link.href,
          type: link.type,
        });
      }
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

    const rawOEmbed =
      rawMeta
        .map((v) => v.oembed)
        .filter(Boolean)
        .find(Boolean) || {};

    const card = {
      _parsedMetadata: {
        _: rawInitial,
        og: rawOpengraph,
        twitter: rawTwitter,
        oembed: rawOEmbed,
      },
      mimetype: rawInitial.mimetype || "text/html",
      title:
        rawOpengraph.title ||
        rawTwitter.title ||
        rawOEmbed.title ||
        rawInitial.title ||
        "",
      url:
        rawOpengraph.url || rawTwitter.url || rawOEmbed.url || rawInitial.url,
      description:
        rawOpengraph.description ||
        rawTwitter.description ||
        rawOEmbed.description ||
        rawInitial.description,
      _truncateDescription: false,
      site_name:
        rawOpengraph.site_name ||
        rawTwitter.site_name ||
        rawTwitter.site ||
        rawOEmbed.provider_name ||
        "",
      author_name: rawOEmbed.author_name || rawInitial.author || "",
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

    const videoNative =
      (isNativeVideoMimetype(card.mimetype) && getVideoNative(rawInitial)) ||
      getVideoNative(rawTwitter) ||
      getVideoNative(rawOpengraph) ||
      getVideoNative(rawInitial);
    if (videoNative && isAbsoluteUrl(videoNative.url)) {
      card.video = {
        src: videoNative.url,
        width: videoNative.width || null,
        height: videoNative.height || null,
        loop: isGiphyCard(card.url) || card.mimetype === "image/gif",
      };

      if (
        videoNative.type === M3U8_MIMETYPE ||
        (!videoNative.type && getURLMimetype(videoNative.url) === M3U8_MIMETYPE)
      ) {
        card.video.hls = true;
      }

      if (videoNative.poster && isAbsoluteUrl(videoNative.poster.url)) {
        card.img = {
          src: videoNative.poster.url,
          alt: videoNative.poster.alt,
          width: videoNative.poster.width,
          height: videoNative.poster.height,
        };
      }
    }

    const audioNative =
      (card.mimetype.startsWith("audio/") && getAudioNative(rawInitial)) ||
      getAudioNative(rawOpengraph) ||
      getAudioNative(rawTwitter) ||
      getAudioNative(rawInitial);
    if (audioNative && isAbsoluteUrl(audioNative.url)) {
      card.audio = {
        src: audioNative.url,
      };

      if (audioNative.poster && isAbsoluteUrl(audioNative.poster.url)) {
        card.img = {
          src: audioNative.poster.url,
          alt: audioNative.poster.alt,
          width: audioNative.poster.width,
          height: audioNative.poster.height,
        };
      }
    }

    if (!videoNative && !audioNative) {
      const hasOGtags =
        Object.keys(rawOpengraph).length || Object.keys(rawTwitter).length;

      let videoIframe =
        getVideoIframe(rawOpengraph) ||
        getVideoIframe(rawTwitter) ||
        getVideoIframe(rawInitial) ||
        getOEmbedVideoIframe(rawOEmbed, {
          allowRich:
            !hasOGtags ||
            (rawOpengraph.type &&
              (rawOpengraph.type === "music.playlist" ||
                rawOpengraph.type === "music.song" ||
                rawOpengraph.type === "music.album" ||
                rawOpengraph.type === "video.other" ||
                // bandcamp's opengraph lacks `music.` prefix in `og:type`
                rawOpengraph.type === "song" ||
                rawOpengraph.type === "album")),
        });

      if (isYoutubeCard(card.url) && isAgeRestricted(rawOpengraph)) {
        videoIframe = null;
      }

      if (videoIframe) {
        card.iframe = {
          src: videoIframe.url,
          width: videoIframe.width || 640,
          height: videoIframe.height || 360,
          _fullWidth: true,
        };

        const shouldAutoplay =
          isYoutubeCard(card.url) ||
          isVimeoCard(card.url) ||
          isCoubCard(card.url);

        if (shouldAutoplay) {
          const autoplaySrc = new URL(card.iframe.src);
          autoplaySrc.searchParams.set("autoplay", 1);
          card.iframe._autoplaySrc = autoplaySrc.toString();
        }
      }
    }

    if (!card.img) {
      const imageOptions = videoNative ? { static: true } : null;
      const image = isAppleMusicCard(card.url)
        ? getImageNative(rawTwitter, imageOptions) ||
          getImageNative(rawOpengraph, imageOptions) ||
          getImageNative(rawInitial, imageOptions) ||
          getOEmbedImageNative(rawOEmbed, imageOptions)
        : (card.mimetype.startsWith("image/") &&
            getImageNative(rawInitial, imageOptions)) ||
          getImageNative(rawOpengraph, imageOptions) ||
          getImageNative(rawTwitter, imageOptions) ||
          getImageNative(rawInitial, imageOptions) ||
          getOEmbedImageNative(rawOEmbed, imageOptions);

      if (
        image &&
        (isAbsoluteUrl(image.secure_url) || isAbsoluteUrl(image.url))
      ) {
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

    if (card.author_name) {
      card.author_name = card.author_name
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
        /(https:\/\/t\.co\/[0-9a-zA-Z]+)/g,
        `<a href="$1">$1</a>`
      );

      if (
        !card.audio &&
        !card.video &&
        !card.iframe &&
        (!card.img || card.img.src.includes("profile_images"))
      ) {
        card.quote = card.description;
        card.description = "";
        card.img = null;
      }
    }

    if (isTikTokCard(card.url)) {
      // tiktok uses expiring urls in its opengraph :rolling_eyes:
      card.video = null;
      card.img = {
        src: tiktokPlaceholder(),
      };
      // and has shitty oembed
      card.iframe = null;
    }

    return card;
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

    if (req.post["save-to-linkblog"] === "1") {
      if (!existingEmbed) {
        res.statusCode = 400;
        return `embed must be saved before publishing it in linkblog`;
      }

      const existingLinkblogEntry = await queryLinkblog(
        db,
        existingEmbed.original_url
      );

      if (!existingLinkblogEntry || existingLinkblogEntry.private) {
        await db.run(
          `
            INSERT INTO linklist
            (id, source_id, original_url, created)
            VALUES ($1, $2, $3, $4)
          `,
          {
            1: getLinkId(),
            2: new URL(
              `/backstage/embeds?url=${encodeURIComponent(original_url)}`,
              req.absolute
            ).toString(),
            3: existingEmbed.original_url,
            4: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          }
        );

        await generateLinkblog(db);
      } else {
        // just ignore public linkblog entry
      }

      res.writeHead(303, {
        Location: new URL(
          `/backstage/embeds?url=${encodeURIComponent(original_url)}`,
          req.absolute
        ).toString(),
      });

      return;
    } else if (req.post["delete-from-linkblog"] === "1") {
      const existingLinkblogEntry = await queryLinkblog(
        db,
        existingEmbed.original_url
      );

      if (existingLinkblogEntry && !existingLinkblogEntry.private) {
        await db.run(
          `
            DELETE FROM linklist
            WHERE original_url = ?1
          `,
          {
            1: existingEmbed.original_url,
          }
        );

        await generateLinkblog(db);
      }

      res.writeHead(303, {
        Location: new URL(
          `/backstage/embeds?url=${encodeURIComponent(original_url)}`,
          req.absolute
        ).toString(),
      });

      return;
    } else if (req.post.delete === "1") {
      if (existingEmbed) {
        await db.run(`DELETE FROM embeds WHERE original_url = ?1`, {
          1: original_url,
        });

        const existingLinkblogEntry = await queryLinkblog(
          db,
          existingEmbed.original_url
        );
        if (existingLinkblogEntry) {
          await db.run(`DELETE FROM linklist WHERE original_url = ?1`, {
            1: original_url,
          });

          await generateLinkblog(db);
        }

        res.writeHead(303, {
          Location: new URL(`/backstage/embeds`, req.absolute).toString(),
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
      Location: new URL(
        `/backstage/embeds?url=${encodeURIComponent(original_url)}`,
        req.absolute
      ).toString(),
    });

    return;
  },

  get: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const urlParam = new URL(req.url, req.absolute).searchParams.get("url");

    if (urlParam) {
      return await getSingleEmbed(req, res);
    }

    return await getEmbedsList(req, res);
  },
};
