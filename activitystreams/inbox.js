async function inbox(req, res) {
  console.log(req.url);
  console.log(req.headers["signature"]);
  console.log(JSON.stringify(req.post));

  return {};
}

module.exports = inbox;
