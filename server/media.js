const url = require("url");
const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const multiparty = require("multiparty");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists),
  rename: promisify(_fs.rename)
};
const { authed, logout } = require("./auth.js");
const sqlite = require("sqlite");
const mustache = require("mustache");

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(tmpl), data, {
    header: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "header.mustache")
    ),
    footer: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "footer.mustache")
    )
  });
}

const PAGE_SIZE = 20;

module.exports = {
get: async (req, res) => {
  const query = url.parse(req.url, true).query;

  const user = authed(req, res);

  if (!user) {
    return `<a href="/backstage/">auth</a>`;
  }

  const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
  const offset = +query.offset || 0;
  const media = await db.all(
    `
      SELECT
        id,
        ext
      FROM media
      ORDER BY created DESC
      LIMIT ?2 OFFSET ?1
    `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const moreMedia = media.length > PAGE_SIZE;

  return render(path.resolve(__dirname, "templates", "media.mustache"), {
    user: user,
    media: media.slice(0, PAGE_SIZE).map(m => Object.assign(m, {
      type: {
        image: m.ext.match("^(gif|jpe?g|png)$"),
        video: m.ext.match("^(mp4)$"),
        audio: m.ext.match("^(mp3)$"),
        text: m.ext.match("^(md|txt|markdown|html|js|css)$"),
      }
    })),
    urls: { moreMedia: moreMedia && `/backstage/media/?offset=${offset + PAGE_SIZE}` },
  });
},
post: async (req, res) => {
  const user = authed(req, res);

  if (!user) {
    return `<a href="/backstage/">auth</a>`;
  }

  const {fields, files} = await new Promise((resolve, reject) => {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
      if (err) { return reject(err) }
      
      return resolve({fields, files})
    })
  })

  console.log(files.files)

  for (const f of files.files) {
    await fs.rename(f.path, `${process.env.DIST}/media/testing-${f.originalFilename}`)
  }
  
  res.writeHead(302, { Location: `/media/testing-${files.files[0].originalFilename}`})
  res.end()
  return
}
};
