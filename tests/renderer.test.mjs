import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const rendererPath = process.env.PRINTER_BOT_RENDERER_PATH || resolve(dirname(fileURLToPath(import.meta.url)), '../v/2.5.0/renderer.html');
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PRINTER_BOT_BROWSER_PATH ? { executablePath: process.env.PRINTER_BOT_BROWSER_PATH } : {}),
  });
});

after(async () => {
  await browser?.close();
});

async function rendererPage() {
  const page = await browser.newPage({ viewport: { width: 272, height: 5000 }, deviceScaleFactor: 1 });
  await page.route(/^https?:\/\//, route => route.abort());
  await page.goto(pathToFileURL(rendererPath).href);
  assert.equal(await page.evaluate(() => window.PrinterBot?.ready), true, 'renderer script must pass its CSP hash');
  return page;
}

test('inline script matches the renderer CSP hash', () => {
  const html = readFileSync(rendererPath, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const allowedHash = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script && allowedHash);
  assert.equal(createHash('sha256').update(script).digest('base64'), allowedHash);
});

test('a paid order keeps every item and its ending inside the printed height', async () => {
  const page = await rendererPage();
  try {
    const event = { __source: 'FourthwallOrderPlaced', 'fw.total': 100, 'fw.currency': 'USD', 'fw.username': '' };
    for (let i = 0; i < 30; i++) {
      event[`fw.variants[${i}].quantity`] = 1;
      event[`fw.variants[${i}].name`] = `Premium limited collector print package with monochrome artwork number ${i + 1}`;
    }
    const actual = await page.evaluate(async data => {
      const result = await window.PrinterBot.render(data, {});
      const content = document.querySelector('#receipt-content');
      const lastPart = content.querySelector('.part:last-child');
      const footer = document.querySelector('#receipt-footer');
      return {
        result,
        contentText: content.textContent,
        contentBottom: content.getBoundingClientRect().bottom,
        lastPartBottom: lastPart.getBoundingClientRect().bottom,
        footerBottom: footer.getBoundingClientRect().bottom,
      };
    }, event);
    assert.equal(actual.result.ok, true);
    assert.match(actual.contentText, /artwork number 30/);
    assert.match(actual.contentText, /Thank you for your purchase!/);
    assert.ok(actual.lastPartBottom <= actual.contentBottom + 1, 'ending must not be clipped by content box');
    assert.ok(actual.footerBottom <= actual.result.height + 1, 'reported print height must contain the footer');
  } finally {
    await page.close();
  }
});

test('an order does not lift the buyer-written message limit', async () => {
  const page = await rendererPage();
  try {
    const actual = await page.evaluate(async () => {
      window.PrinterBot.setTheme('.part.message { font-size: 72px; }');
      const result = await window.PrinterBot.render({
        __source: 'FourthwallOrderPlaced', 'fw.total': 5, 'fw.currency': 'USD', 'fw.username': '',
        'fw.variants[0].quantity': 1, 'fw.variants[0].name': 'One item',
        'fw.statmessageus': 'X '.repeat(400),
      }, {});
      const content = document.querySelector('#receipt-content');
      const message = content.querySelector('.part.message');
      return { result, messageHeight: message.getBoundingClientRect().height, messageScrollHeight: message.scrollHeight,
        endingBottom: content.querySelector('.part:last-child').getBoundingClientRect().bottom,
        contentBottom: content.getBoundingClientRect().bottom };
    });
    assert.equal(actual.result.ok, true);
    assert.ok(actual.messageScrollHeight > 1600, 'fixture must exercise message overflow');
    assert.ok(actual.messageHeight <= 1600, 'buyer-written note remains bounded');
    assert.ok(actual.endingBottom <= actual.contentBottom + 1);
  } finally {
    await page.close();
  }
});

test('gift recipient suffixes remain visible at paper width', async () => {
  const page = await rendererPage();
  try {
    const names = ['W'.repeat(24) + 'A', 'W'.repeat(24) + 'Z'];
    const actual = await page.evaluate(async names => {
      const result = await window.PrinterBot.render({
        __source: 'TwitchGiftBomb', gifts: 2, totalGifts: 2, tier: 'tier 1',
        user: 'Gifter', userName: '-',
        'gift.recipientUser0': names[0], 'gift.recipientUser1': names[1],
      }, {});
      const content = document.querySelector('#receipt-content');
      const list = [...content.querySelectorAll('.part')].find(el => el.textContent.includes(names[0]) && el.textContent.includes(names[1]));
      const rightEdge = content.getBoundingClientRect().right;
      const endings = [...list.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => {
        const range = document.createRange();
        range.setStart(node, node.length - 1);
        range.setEnd(node, node.length);
        return range.getBoundingClientRect().right;
      });
      return { result, endings, rightEdge };
    }, names);
    assert.equal(actual.result.ok, true);
    assert.equal(actual.endings.length, 2);
    assert.ok(actual.endings.every(right => right <= actual.rightEdge + 1), 'both distinguishing suffixes must fit');
  } finally {
    await page.close();
  }
});

test('a long subscriber name stays on the paper', async () => {
  const page = await rendererPage();
  try {
    const actual = await page.evaluate(async () => {
      const result = await window.PrinterBot.render({
        __source: 'TwitchSub', tier: 'tier 1', userName: '-', user: 'W'.repeat(24) + 'Z',
      }, {});
      const subtitle = document.querySelector('#receipt-subtitle');
      const range = document.createRange();
      range.setStart(subtitle.firstChild, subtitle.firstChild.length - 1);
      range.setEnd(subtitle.firstChild, subtitle.firstChild.length);
      return { result, suffixRight: range.getBoundingClientRect().right,
        paperRight: document.querySelector('#receipt-container').getBoundingClientRect().right };
    });
    assert.equal(actual.result.ok, true);
    assert.ok(actual.suffixRight <= actual.paperRight + 1);
  } finally {
    await page.close();
  }
});

test('an invisible-only Fourthwall name uses the anonymous label', async () => {
  const page = await rendererPage();
  try {
    const actual = await page.evaluate(async () => {
      const result = await window.PrinterBot.render({
        __source: 'FourthwallDonation', 'fw.amount': 5, 'fw.currency': 'USD', 'fw.username': '\u200d',
      }, {});
      return { result, subtitle: document.querySelector('#receipt-subtitle').textContent,
        joinedName: window.PrinterBot.internals.displayName('ب\u200dت') };
    });
    assert.equal(actual.result.ok, true);
    assert.equal(actual.subtitle, 'Anonymous supporter');
    assert.equal(actual.joinedName, 'ب\u200dت', 'joiners within visible names remain intact');
  } finally {
    await page.close();
  }
});
