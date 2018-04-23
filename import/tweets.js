const { importTweet } = require("./tweet.js");
const sqlite = require("sqlite");
const _fs = require("fs");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

async function importTweets() {
  const files = (await fs.readdir("./import/tweets/")).filter(v =>
    v.startsWith("20")
  ); //.slice(-5)

  const db = await sqlite.open("./posts.db");

  for (const file of files) {
    const content = (await fs.readFile("./import/tweets/" + file))
      .toString()
      .replace(/^.+=/, "");
    const tweets = JSON.parse(content).sort((a, b) => {
      if (a.created_at != b.created_at) {
        return a.created_at > b.created_at ? 1 : -1;
      }

      return a.id_str > b.id_str ? 1 : -1;
    });

    for (let tweet of tweets) {
      await importTweet(tweet, db);
    }
  }
}

importTweets()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
