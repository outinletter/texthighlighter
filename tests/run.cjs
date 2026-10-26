const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

let failures = 0;
for (const name of readdirSync(__dirname).filter(name => name.endsWith('.test.cjs')).sort()) {
  console.log('\n' + name);
  const result = spawnSync(process.execPath, [join(__dirname, name)], { stdio: 'inherit' });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failures++;
}
process.exitCode = failures ? 1 : 0;
