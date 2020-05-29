const url = require("url");

const { getSession, sendToAuthProvider } = require("./auth.js");

module.exports = async (req, res) => {
  const session = await getSession(req, res);
  if (!session) {
    return sendToAuthProvider(req, res);
  }

  const query = url.parse(req.url, true).query;
  const existingPostId = query.id || (req.post && req.post.id);

  const db = await req.db();

  const dbPost = await db.get(
    `SELECT id, draft FROM posts WHERE id = ?1 AND draft = 1 LIMIT 1`,
    { 1: existingPostId }
  );

  if (!dbPost) {
    res.statusCode = 400;
    return `make post a draft before removing it`;
  }

  await db.run(`DELETE FROM posts WHERE id = ?1`, {
    1: existingPostId,
  });

  res.writeHead(303, {
    Location: url.resolve(req.absolute, `/backstage`),
  });

  return;
};
