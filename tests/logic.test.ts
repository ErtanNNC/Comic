/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync, strToU8 } from 'fflate';

import { detectKind, extractZip } from '../src/lib/archive';
import { parseDriveLink, parseFolderHtml } from '../src/lib/drive';
import { readImageSize } from '../src/lib/image-size';
import { parseComicName } from '../src/lib/naming';

test('parseComicName splits series and issue', () => {
  assert.deepEqual(parseComicName('Batman_012_(2016)_[Tayfa].cbz'), { title: 'Batman 012 (2016) [Tayfa]', series: 'Batman', issue: 12 });
  assert.equal(parseComicName('Tex - Sayı 45.cbz').series, 'Tex');
  assert.equal(parseComicName('Tex - Sayı 45.cbz').issue, 45);
  assert.equal(parseComicName('Spider-Man #3.cbr').series, 'Spider-Man');
  assert.equal(parseComicName('Spider-Man #3.cbr').issue, 3);
  assert.equal(parseComicName('Watchmen Cilt 2.zip').issue, 2);
  assert.deepEqual(parseComicName('Maus.cbz'), { title: 'Maus', series: 'Maus' });
  const copy = parseComicName('Yeni İntikamcılar 001 (Enygma&Glint).pdf adlı dosyanın kopyası');
  assert.deepEqual(copy, { title: 'Yeni İntikamcılar 001 (Enygma&Glint)', series: 'Yeni İntikamcılar', issue: 1 });
  assert.equal(parseComicName('Copy of Tex 5 (1).cbz').issue, 5);
});

test('parseDriveLink understands common share URLs', () => {
  assert.deepEqual(parseDriveLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing'), { kind: 'file', id: '1AbCdEfGhIjKlMnOpQrStUv' });
  assert.deepEqual(parseDriveLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv'), { kind: 'file', id: '1AbCdEfGhIjKlMnOpQrStUv' });
  assert.deepEqual(parseDriveLink('https://drive.google.com/drive/folders/1FoLdErIdXyZ123456?usp=sharing'), { kind: 'folder', id: '1FoLdErIdXyZ123456' });
  assert.deepEqual(parseDriveLink('https://drive.google.com/drive/u/0/folders/1FoLdErIdXyZ123456'), { kind: 'folder', id: '1FoLdErIdXyZ123456' });
  assert.equal(parseDriveLink('https://example.com'), null);
});

test('parseFolderHtml reads embeddedfolderview markup', () => {
  const html = `<html><head><title>Tex Arşivi &amp; Özel</title></head><body><div class="flip-entries">
  <div class="flip-entry" id="entry-1SubFolderAAAA" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/drive/folders/1SubFolderAAAA" target="_blank"><div class="flip-entry-visual"></div><div class="flip-entry-list-icon"></div><div class="flip-entry-title">Ciltler</div></a></div></div>
  <div class="flip-entry" id="entry-1FileBBBBBBBB" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/file/d/1FileBBBBBBBB/view?usp=drive_web" target="_blank"><div class="flip-entry-visual"></div><div class="flip-entry-title">Tex 001 &#39;Kızıl&#39;.cbz adlı dosyanın kopyası</div></a></div><div class="flip-entry-last-modified"><div>12 Mar 2021</div></div></div>
  </div></body></html>`;
  const r = parseFolderHtml(html);
  assert.equal(r.title, 'Tex Arşivi & Özel');
  assert.deepEqual(r.entries, [
    { id: '1SubFolderAAAA', isFolder: true, name: 'Ciltler' },
    { id: '1FileBBBBBBBB', isFolder: false, name: "Tex 001 'Kızıl'.cbz" },
  ]);
});

function png(w: number, h: number) {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number) {
  // SOI, APP0 (len 16), SOF0
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

test('readImageSize handles PNG and JPEG headers', () => {
  assert.deepEqual(readImageSize(png(1988, 3056)), { w: 1988, h: 3056 });
  assert.deepEqual(readImageSize(jpeg(1200, 1800)), { w: 1200, h: 1800 });
});

test('detectKind sniffs archives and HTML error pages', () => {
  assert.equal(detectKind(strToU8('PK\x03\x04rest')), 'zip');
  assert.equal(detectKind(strToU8('Rar!\x1a\x07')), 'rar');
  assert.equal(detectKind(strToU8('%PDF-1.7')), 'pdf');
  assert.equal(detectKind(strToU8('<!DOCTYPE html>')), 'html');
});

test('extractZip streams images out in natural order and skips junk', async () => {
  const zip = zipSync({
    'Comic/page10.jpg': jpeg(100, 150),
    'Comic/page2.png': png(200, 300),
    'Comic/page1.jpg': [jpeg(10, 20), { level: 0 }],
    '__MACOSX/Comic/._page1.jpg': strToU8('junk'),
    'Comic/info.txt': strToU8('hello'),
    'Comic/.hidden.jpg': jpeg(1, 1),
  });
  const written = new Map<string, Uint8Array>();
  let offset = 0;
  const pages = await extractZip({
    totalBytes: zip.length,
    read: async () => {
      if (offset >= zip.length) return null;
      const c = zip.subarray(offset, offset + 7); // tiny chunks to exercise streaming
      offset += c.length;
      return c;
    },
    write: (name, bytes) => written.set(name, bytes),
  });
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((p) => [p.w, p.h]), [[10, 20], [200, 300], [100, 150]]);
  assert.equal(written.size, 3);
  for (const p of pages) assert.ok(written.has(p.file));
});
