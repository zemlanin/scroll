const fs = require("fs");
const path = require("path");

const mustache = require("mustache");

module.exports = {
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
};

const CARD_TEMPLATE_PATH = path.resolve(
  __dirname,
  "templates",
  "card.mustache"
);

function renderCard(card, options) {
  if (!card) {
    return "";
  }

  if (options && options.maxWidth) {
    card = {
      ...card,
      img: card.img
        ? {
            ...card.img,
          }
        : null,
      video: card.video
        ? {
            ...card.video,
          }
        : null,
      iframe: card.iframe
        ? {
            ...card.iframe,
          }
        : null,
    };
    for (const target of [card.img, card.video, card.iframe]) {
      if (!target) {
        continue;
      }

      if (!target.width && !target.height) {
        continue;
      }

      if (target.width <= options.maxWidth) {
        continue;
      }

      const aspectRatio = target.width / target.height;
      target.width = options.maxWidth;
      target.height = target.width / aspectRatio;
    }
  }

  if (
    card.mimetype === "image/gif" &&
    card.video &&
    card.video.src &&
    !card.title
  ) {
    return `<video
        playsinline
        autoplay muted loop disableRemotePlayback
        src="${card.video.src}"
        ${card.description ? `title="${card.description}"` : ""}
        ${card.video.width ? `width=${card.video.width}` : ""}
        ${card.video.height ? `height=${card.video.height}` : ""}
      ></video>`;
  }

  if (!card.title && !card.description && card.mimetype.startsWith("image/")) {
    if (card.img) {
      return `<img
          src="${card.img.src}"
          title="${card.description || ""}"
          ${card.description ? `title="${card.description}"` : ""}
          ${card.img.width ? `width=${card.img.width}` : ""}
          ${card.img.height ? `height=${card.img.height}` : ""}
        />`;
    }

    return `<img
        src="${card.url}"
        title="${card.description || ""}"
      />`;
  }

  if (isNativeVideoMimetype(card.mimetype) && !card.title) {
    return `<video
        playsinline
        controls
        preload="metadata"
        src="${card.url}"
        ${card.img && card.img.src ? `poster="${card.img.src}"` : ""}
        ${card.video.width ? `width=${card.video.width}` : ""}
        ${card.video.height ? `height=${card.video.height}` : ""}
      ></video>`;
  }

  if (card.mimetype.startsWith("audio/") && !card.title) {
    return `<audio controls preload="metadata" src="${card.url}"></audio>`;
  }

  const useAuthorNameAsSuffix =
    card.author_name &&
    !card.title.endsWith(card.author_name) &&
    (isYoutubeCard(card.url) ||
      isVimeoCard(card.url) ||
      isGiphyCard(card.url) ||
      isButtondownEmailCard(card.url) ||
      isSubstackCard(card.url));

  const useSiteNameAsSuffix =
    card.site_name && !card.title.endsWith(card.site_name);

  card._titleSuffix = useAuthorNameAsSuffix
    ? ` • ${card.author_name}`
    : useSiteNameAsSuffix
    ? ` • ${card.site_name}`
    : "";

  if (!card.img && !card.audio && !card.video && !card.iframe && !card.quote) {
    const title = card.title || card.url;
    return `<a href="${card.url}">${title}${card._titleSuffix}</a>`;
  }

  if (!card.img && card.iframe) {
    const title = card.title || card.url;
    return `<a href="${card.url}">${title}${card._titleSuffix}</a>`;
  }

  if (card.error) {
    return "";
  }

  if (
    card._truncateDescription &&
    card.description &&
    card.description.includes("<br>")
  ) {
    card._descriptionFirstLine = card.description
      .split("<br>")
      .map((l) => l && l.trim())
      .find(Boolean);
  } else if (card.description) card._descriptionFirstLine = card.description;

  return mustache.render(loadCardTemplate(), {
    card,
    externalFrames: options && options.externalFrames,
    withoutLinkedTitle: card.url.startsWith("data:"),
  });
}

const MP4_MIMETYPE = "video/mp4";
const M3U8_MIMETYPE = "application/vnd.apple.mpegurl";

function isNativeVideoMimetype(type) {
  return type === MP4_MIMETYPE || type === M3U8_MIMETYPE;
}

function isAppleMusicCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";

  return hostname === "music.apple.com" || hostname === "itunes.apple.com";
}

function isApplePodcastsCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";

  return hostname === "podcasts.apple.com";
}

function isTwitterCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";

  return hostname === "twitter.com";
}

function isYoutubeCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return (
    hostname === "youtube.com" ||
    hostname === "youtu.be" ||
    hostname.endsWith(".youtube.com")
  );
}

function isTikTokCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
}

function isGiphyCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return hostname === "giphy.com" || hostname.endsWith(".giphy.com");
}

function isVimeoCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return hostname === "vimeo.com" || hostname.endsWith(".vimeo.com");
}

function isButtondownEmailCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return (
    hostname === "buttondown.email" || hostname.endsWith(".buttondown.email")
  );
}

function isSubstackCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return hostname === "substack.com" || hostname.endsWith(".substack.com");
}

function isCoubCard(cardURL) {
  const hostname = cardURL ? new URL(cardURL).hostname : "";
  return hostname === "coub.com" || hostname.endsWith(".coub.com");
}

function loadCardTemplate() {
  if (loadCardTemplate.cache && process.env.NODE_ENV !== "development") {
    return loadCardTemplate.cache;
  }

  return (loadCardTemplate.cache = fs
    .readFileSync(CARD_TEMPLATE_PATH)
    .toString());
}
loadCardTemplate.cache = "";
