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
  return function() {
    const result = fn.apply(this, arguments);
    return typeof result === "string" ? decode(result) : result;
  };
}

cheerio.load = function() {
  const instance = load.apply(this, arguments);

  instance.html = wrapHtml(instance.html);
  instance.prototype.html = wrapHtml(instance.prototype.html);

  return instance;
};

const {
  loadMetadata,
  generateCardJSON,
  renderCard,
  queryEmbed
} = require("./backstage/embeds.js");

module.exports = class EmbedsLoader {
  constructor(db, insertOnLoad = true) {
    this.db = db;
    this.insertOnLoad = insertOnLoad;

    this.cache = {};
  }

  async query(urls) {
    const urlsToQuery = urls.filter(u => !this.cache[u]);

    for (const url of urlsToQuery) {
      const embedFromDB = await queryEmbed(this.db, url);
      if (embedFromDB) {
        this.cache[url] = await renderCard(
          generateCardJSON(embedFromDB.raw_metadata)
        );
      }
    }

    const urlsToRequest = urlsToQuery.filter(u => !this.cache[u]);
    for (const url of urlsToRequest) {
      let raw_metadata;

      try {
        raw_metadata = await loadMetadata(url);
      } catch (e) {
        console.error(e);
        // `${e.name}${e.statusCode ? ": " + e.statusCode : ""}`;
      }

      if (!raw_metadata) {
        continue;
      }

      const cardWithMetadata = generateCardJSON(raw_metadata);

      if (!cardWithMetadata) {
        continue;
      }

      const rendered_html = await renderCard(cardWithMetadata);

      if (this.insertOnLoad) {
        await this.db.run(
          `INSERT INTO embeds
            (original_url, raw_metadata, mimetype, created)
            VALUES (?1, ?2, ?4, ?5)`,
          {
            1: url,
            2: JSON.stringify(raw_metadata),
            4: cardWithMetadata.mimetype,
            5: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
          }
        );
      }

      this.cache[url] = rendered_html;
    }
  }

  async load(html) {
    const $ = cheerio.load(html);

    const urlsToLoad = [];

    $("x-embed").each(function() {
      const { href } = JSON.parse($(this).text());
      urlsToLoad.push(href);
    });

    if (!urlsToLoad.length) {
      return html;
    }

    await this.query(urlsToLoad);

    const cache = this.cache;

    $("x-embed").each(function() {
      const $this = $(this);
      const { href, text } = JSON.parse($this.text());
      $this.replaceWith(cache[href] || `<a href="${href}">${text || href}</a>`);
    });

    return $("body").html();
  }
};
