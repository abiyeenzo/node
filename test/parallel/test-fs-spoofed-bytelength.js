'use strict';

// A TypedArray whose own `byteLength` property is shadowed must not be able
// to abort the process through fs.read*()/fs.write*(). The JS layer validates
// against `buffer.byteLength`, so the native layer has to validate against the
// real length and throw.

const common = require('../common');
const assert = require('assert');
const fs = require('fs');
const tmpdir = require('../common/tmpdir');

tmpdir.refresh();

const file = tmpdir.resolve('spoofed-bytelength.txt');
fs.writeFileSync(file, 'x'.repeat(64));

function spoofed() {
  const buf = new Uint8Array(16);
  Object.defineProperty(buf, 'byteLength', { value: 2 ** 20 });
  return buf;
}

const expected = { code: 'ERR_OUT_OF_RANGE' };
const fd = fs.openSync(file, 'r+');

assert.throws(() => fs.writeSync(fd, spoofed()), expected);
assert.throws(() => fs.readSync(fd, spoofed(), 0, 2 ** 19, 0), expected);
assert.throws(() => fs.writeFileSync(fd, spoofed()), expected);
assert.throws(() => fs.appendFileSync(fd, spoofed()), expected);
assert.throws(() => fs.write(fd, spoofed(), common.mustNotCall()), expected);
assert.throws(() => fs.read(fd, spoofed(), 0, 2 ** 19, 0,
                            common.mustNotCall()), expected);

// A well-formed buffer must still work.
const ok = Buffer.alloc(8, 'a');
assert.strictEqual(fs.writeSync(fd, ok), 8);
assert.strictEqual(fs.readSync(fd, ok, 0, 8, 0), 8);

fs.closeSync(fd);

(async () => {
  const handle = await fs.promises.open(file, 'r+');
  await assert.rejects(handle.read(spoofed(), 0, 2 ** 19, 0), expected);
  await assert.rejects(handle.write(spoofed()), expected);
  await handle.close();
})().then(common.mustCall());
