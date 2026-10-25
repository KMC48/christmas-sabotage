// Run after npm run sync. Catch stale native bundles before either OS is built.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const id = 'jp.kmccreativelab.christmassabotage';
const read = p => readFileSync(p, 'utf8');
assert.equal(JSON.parse(read('capacitor.config.json')).appId, id);
for (const p of ['android/app/src/main/assets/capacitor.config.json', 'ios/App/App/capacitor.config.json']) {
  assert.equal(JSON.parse(read(p)).appId, id, p);
}
const gradle = read('android/app/build.gradle');
assert.ok(gradle.includes(`namespace = "${id}"`) && gradle.includes(`applicationId "${id}"`));
assert.ok(read('android/app/src/main/java/jp/kmccreativelab/christmassabotage/MainActivity.java').includes(`package ${id};`));
const xcode = read('ios/App/App.xcodeproj/project.pbxproj');
const bundles = [...xcode.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)];
assert.equal(bundles.length, 2);
assert.ok(bundles.every(m => m[1] === id));
const html = read('www/index.html');
assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html));
assert.ok(html.includes('恋愛至上主義に支配された「日本のクリスマス」を粉砕するのだ！'));
let count = 0;
function walk(dir, rel = '') {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const path = join(rel, f.name);
    if (f.isDirectory()) walk(join(dir, f.name), path);
    else {
      const source = readFileSync(join('www', path));
      for (const dest of ['android/app/src/main/assets/public', 'ios/App/App/public']) {
        assert.deepEqual(readFileSync(join(dest, path)), source, `${dest}/${path}`);
      }
      count++;
    }
  }
}
walk('www');
assert.equal(readdirSync('www/fonts').filter(f => f.endsWith('.woff2')).length, 5);
assert.equal(readdirSync('www/fonts').filter(f => f.startsWith('OFL-')).length, 3);
console.log(`PASS: app IDs, title copy, five local fonts, three licenses, and ${count} byte-identical files on both platforms`);
