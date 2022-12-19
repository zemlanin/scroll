const { generateKeyPairSync } = require("crypto");

require("dotenv").config();

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const { ACTIVITYSTREAMS_DB, getBlogObject } = require("../common.js");

generateActor(process.argv[2]).then(
  () => {
    console.log("done");
  },
  (error) => {
    console.error(error);
  }
);

async function generateActor(name) {
  if (!name) {
    throw new Error(`name argument is required`);
  }

  const db = await sqlite.open({
    filename: ACTIVITYSTREAMS_DB,
    driver: sqlite3.Database,
  });

  const blog = await getBlogObject();

  const id = new URL(`actor/${name}`, blog.url).toString();

  if (await db.get("SELECT id FROM actors WHERE id = ?1", { 1: id })) {
    throw new Error(`actor already exists: ${id}`);
  }

  const keyId = new URL(`actor/${name}#main-key`, blog.url).toString();

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "pkcs1",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  await db.run(
    `INSERT INTO actors (
      id,
      key_id,
      public_key,
      private_key
    ) VALUES (
      ?1,
      ?2,
      ?3,
      ?4
    )`,
    {
      1: id,
      2: keyId,
      3: publicKey,
      4: privateKey,
    }
  );
}
