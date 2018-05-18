const url = require("url");
const path = require("path");

const { authed } = require("./auth.js");
const sqlite = require("sqlite");

module.exports = async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }

    const query = url.parse(req.url, true).query;
    const existingPostId = query.id || (req.post && req.post.id);

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));

    await db.run(
      `DELETE FROM posts WHERE id = ?1`,
      {
        1: existingPostId,
      }
    );

    res.writeHead(303, {
      Location: url.resolve(req.absolute, `/backstage`)
    });

    return;
  }
