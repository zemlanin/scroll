const cheerio = require("cheerio");
const common = require("./common");
const { renderCard } = require("./backstage/render-card.js");

const load = cheerio.load;

function decode(string) {
  return string.replace(/&#x([0-9a-f]{1,6});/gi, (entity, code) => {
    code = parseInt(code, 16);

    // Don't unescape ASCII characters, assuming they're encoded for a good reason
    if (code < 0x80) return entity;

    return String.fromCodePoint(code);
  });
}

function wrapHtml(fn) {
  return function () {
    const result = fn.apply(this, arguments);
    return typeof result === "string" ? decode(result) : result;
  };
}

cheerio.load = function () {
  const instance = load.apply(this, arguments);

  instance.html = wrapHtml(instance.html);
  instance.prototype.html = wrapHtml(instance.prototype.html);

  return instance;
};

function overwriteFromEmbed(card, embed) {
  let result = card;
  if (embed.title) {
    result = {
      ...result,
      title: embed.title,
      img: {
        ...result.img,
        alt: embed.title,
      },
    };

    if (result.img) {
      result.img = {
        ...result.img,
        alt: embed.title,
      };
    }
  }

  if (embed.poster) {
    result = {
      ...result,
      img: {
        alt: result.img ? result.img.alt : embed.title || "",
        src: embed.poster,
      },
    };
  }

  if (embed.description || embed.description === "") {
    result = {
      ...result,
      description: embed.description,
      _truncateDescription: false,
    };
  }

  if (embed.author_name || embed.author_name === "") {
    result = {
      ...result,
      author_name: embed.author_name,
    };
  }

  if (embed.site_name || embed.site_name === "") {
    result = {
      ...result,
      site_name: embed.site_name,
    };
  }

  if (embed.mimetype) {
    result = {
      ...result,
      mimetype: embed.mimetype,
    };
  }

  if (embed.href && embed.href.startsWith("data:")) {
    result = {
      ...result,
      url: embed.href,
      iframe: {
        src: embed.href,
        width: 720,
        height: 405,
      },
    };
  }

  return result;
}

class OwnMediaDimensionsLoader {
  constructor(db) {
    this.db = db;

    this.cache = {};
  }

  async query(urls) {
    for (const url of urls) {
      if (!url || this.cache[url] || !common.isOwnMedia(url)) {
        continue;
      }

      let dimensions = null;

      const { pathname } = new URL(url, "http://example.com/");

      // `['', 'media', mediaId (`id` or `id.ext`), conversion (`undefined` or `tag.ext`)]`
      const [mediaId, conversion] = pathname.split("/").slice(2);

      if (conversion) {
        const [tag] = conversion.split(".");

        dimensions = await this.db.get(
          `
            SELECT size, width, height, duration_ms
            FROM converted_media_dimensions
            WHERE media_id = ?1 AND tag = ?2
            LIMIT 1
          `,
          { 1: mediaId, 2: tag }
        );
      } else if (mediaId) {
        const [id] = mediaId.split(".");

        dimensions = await this.db.get(
          `
            SELECT size, width, height, duration_ms
            FROM media_dimensions
            WHERE id = ?1
            LIMIT 1
          `,
          { 1: id }
        );
      }

      this.cache[url] = dimensions || {};
    }

    return urls.reduce((acc, url) => {
      return [...acc, this.cache[url]];
    }, []);
  }

  async load(html) {
    if (!html) {
      return html;
    }

    const $ = cheerio.load(html);

    const urlsToLoad = [];

    $("img[src]").each(function () {
      const $this = $(this);
      const src = $this.attr("src");

      if (!src) {
        return;
      }

      urlsToLoad.push(src);
    });

    if (!urlsToLoad.length) {
      return html;
    }

    await this.query(urlsToLoad);

    const cache = this.cache;

    $("img[src]").each(function () {
      const $this = $(this);

      const src = $this.attr("src");
      if (!src) {
        return;
      }

      const dimensions = cache[src];
      if (!dimensions) {
        return;
      }

      if (!$this.attr("width") && !$this.attr("height")) {
        if (dimensions.width) {
          $this.attr("width", dimensions.width);
        }

        if (dimensions.height) {
          $this.attr("height", dimensions.height);
        }
      }
    });

    return $("body").html();
  }
}

module.exports = class EmbedsLoader {
  constructor(db, insertOnLoad = true) {
    this.db = db;
    this.insertOnLoad = insertOnLoad;

    this.cache = {};

    this.ownMediaDimensionsLoader = new OwnMediaDimensionsLoader(db);
  }

  async query(urls) {
    for (const url of urls) {
      if (!url || this.cache[url]) {
        continue;
      }

      if (url.startsWith("data:")) {
        continue;
      }

      const embedFromDB = await embeds.queryEmbed(this.db, url);
      if (embedFromDB) {
        this.cache[url] = embeds.generateCardJSON(embedFromDB.raw_metadata);
        continue;
      }

      let raw_metadata;

      try {
        raw_metadata = await embeds.loadMetadata(url);
      } catch (e) {
        console.error(e);

        raw_metadata = [
          { name: "url", content: url },
          { name: "mimetype", content: "text/html" },
        ];
      }

      if (!raw_metadata) {
        continue;
      }

      const cardWithMetadata = embeds.generateCardJSON(raw_metadata);

      if (!cardWithMetadata) {
        continue;
      }

      if (this.insertOnLoad) {
        await this.db.run(
          `INSERT INTO embeds
            (original_url, raw_metadata, mimetype, created)
            VALUES (?1, ?2, ?4, ?5)`,
          {
            1: url,
            2: JSON.stringify(raw_metadata),
            4: cardWithMetadata.mimetype,
            5: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          }
        );
      }

      this.cache[url] = cardWithMetadata;
    }

    return urls.reduce((acc, url) => {
      return [...acc, this.cache[url]];
    }, []);
  }

  async load(html, options) {
    const $ = cheerio.load(html);

    const urlsToLoad = [];

    $("x-embed").each(function () {
      const $this = $(this);

      if (!$this.text()) {
        return;
      }

      const { href } = JSON.parse($this.text());
      urlsToLoad.push(href);
    });

    if (!urlsToLoad.length) {
      return await this.ownMediaDimensionsLoader.load(html);
    }

    await this.query(urlsToLoad);

    const cache = this.cache;

    $("x-embed").each(function () {
      const $this = $(this);
      if (!$this.text()) {
        return;
      }

      const embed = JSON.parse($this.text());

      let card;
      if (cache[embed.href]) {
        card = overwriteFromEmbed(cache[embed.href], embed);
      } else if (embed.mimetype && embed.poster) {
        card = overwriteFromEmbed({}, embed);
      }

      if (card) {
        $this.replaceWith(
          renderCard(card, {
            externalFrames: options && options.externalFrames,
            maxWidth: options && options.maxWidth,
          })
        );
        return;
      }

      const { href, text } = embed;
      $this.replaceWith(`<a href="${href}">${text || href}</a>`);
    });

    return await this.ownMediaDimensionsLoader.load(await $("body").html());
  }
};

var embeds = require("./backstage/embeds.js");
