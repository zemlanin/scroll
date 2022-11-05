async function inbox(req, res) {
  console.log(req.url);
  console.log(JSON.stringify(req.post));

  return {};
}

module.exports = inbox;
