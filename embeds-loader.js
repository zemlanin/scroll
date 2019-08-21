const cheerio = require("cheerio");

const {
  loadMetadata,
  generateCardJSON,
  renderCard,
  queryEmbed
} = require("./backstage/embeds.js");

module.exports = class EmbedsLoader {
  constructor(db) {
    this.db = db;

    this.cache = {};
  }

  async query(urls) {
    const urlsToQuery = urls.filter(u => !this.cache[u]);

    for (const url of urlsToQuery) {
      const embedFromDB = await queryEmbed(this.db, url);
      if (embedFromDB) {
        this.cache[url] = embedFromDB.rendered_html;
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
        continue;
      }

      if (!raw_metadata) {
        continue;
      }

      const cardWithMetadata = await generateCardJSON(raw_metadata);

      if (!cardWithMetadata) {
        continue;
      }

      const rendered_html = await renderCard(cardWithMetadata);

      await this.db.run(
        `INSERT INTO embeds
          (original_url, raw_metadata, rendered_html, mimetype, created)
          VALUES (?1, ?2, ?3, ?4, ?5)`,
        {
          1: url,
          2: raw_metadata,
          3: rendered_html,
          4: cardWithMetadata.mimetype,
          5: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
        }
      );

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

    await this.query(urlsToLoad);

    const cache = this.cache;

    $("x-embed").each(function() {
      const $this = $(this);
      const { href, text } = JSON.parse($this.text());
      $this.replaceWith(cache[href] || `<a href="${href}">${text || href}</a>`);
    });

    return $.html();
  }
};
