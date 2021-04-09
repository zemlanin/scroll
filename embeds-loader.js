const cheerio = require("cheerio");

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

const {
  loadMetadata,
  generateCardJSON,
  renderCard,
  queryEmbed,
} = require("./backstage/embeds.js");

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

  if (embed.site_name || embed.site_name === "") {
    result = {
      ...result,
      site_name: embed.site_name,
    };
  }

  return result;
}

module.exports = class EmbedsLoader {
  constructor(db, insertOnLoad = true) {
    this.db = db;
    this.insertOnLoad = insertOnLoad;

    this.cache = {};
  }

  async query(urls) {
    for (const url of urls) {
      if (!url || this.cache[url]) {
        continue;
      }

      const embedFromDB = await queryEmbed(this.db, url);
      if (embedFromDB) {
        this.cache[url] = generateCardJSON(embedFromDB.raw_metadata);
        continue;
      }

      let raw_metadata;

      try {
        raw_metadata = await loadMetadata(url);
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

      const cardWithMetadata = generateCardJSON(raw_metadata);

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
      return html;
    }

    await this.query(urlsToLoad);

    const cache = this.cache;

    $("x-embed").each(function () {
      const $this = $(this);
      if (!$this.text()) {
        return;
      }

      const embed = JSON.parse($this.text());

      if (cache[embed.href]) {
        const card = overwriteFromEmbed(cache[embed.href], embed);

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

    return $("body").html();
  }
};
