const fs = require('fs');
const path = require('path');

module.exports = () => {
  const dir = path.join(__dirname, 'commands');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    out.push(...[].concat(require(path.join(dir, f))));
  }
  return out;
};
