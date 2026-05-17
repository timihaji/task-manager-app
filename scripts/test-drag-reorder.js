// Playwright test: mobile drag-to-reorder
// Usage: node scripts/test-drag-reorder.js
// Requires: npx playwright (globally available)

const { chromium } = require('playwright');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dispatchPointerEvent(page, type, x, y, pointerId = 1) {
  await page.evaluate(({ type, x, y, pointerId }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) { console.warn('no element at', x, y); return; }
    const evt = new PointerEvent(type, {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerId, pointerType: 'touch',
      isPrimary: true,
    });
    el.dispatchEvent(evt);
  }, { type, x, y, pointerId });
}

async function dispatchDocumentPointerEvent(page, type, x, y, pointerId = 1) {
  await page.evaluate(({ type, x, y, pointerId }) => {
    const evt = new PointerEvent(type, {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerId, pointerType: 'touch',
      isPrimary: true,
    });
    document.dispatchEvent(evt);
  }, { type, x, y, pointerId });
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();

  // Capture console logs for debug
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[PAGE ERROR]', msg.text());
  });

  console.log('Navigating to app...');
  await page.goto('http://localhost:5174/?dev=1');
  await page.waitForSelector('[data-task-id]', { timeout: 10000 });
  console.log('App loaded.');

  // Click Inbox tab (second tab button)
  await page.click('button:has-text("Inbox")');
  await sleep(400);

  // Read initial task order
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-task-id]')].map(el => ({
      id: el.getAttribute('data-task-id'),
      title: el.querySelector('div[style*="font-size:14.5"]')?.textContent?.trim() || el.textContent?.slice(0,40),
    }))
  );
  console.log('\nTask order BEFORE drag:');
  before.forEach((t, i) => console.log(`  ${i}: ${t.title} (${t.id})`));

  if (before.length < 2) {
    console.log('Not enough tasks to reorder. Exiting.');
    await browser.close();
    process.exit(1);
  }

  // Get positions of first two cards
  const card0 = await page.evaluate(() => {
    const el = document.querySelectorAll('[data-task-id]')[0];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom, top: r.top };
  });
  const card1 = await page.evaluate(() => {
    const el = document.querySelectorAll('[data-task-id]')[1];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom };
  });

  console.log(`\nCard 0 center: (${card0.x.toFixed(0)}, ${card0.y.toFixed(0)})`);
  console.log(`Card 1 center: (${card1.x.toFixed(0)}, ${card1.y.toFixed(0)})`);

  // ── Simulate long-press on card 0, drag to below card 1 ──────────────────
  const dragX = card0.x;
  const dragStartY = card0.y;
  const dragEndY = card1.bottom + 5;   // below card 1 → should land after it

  console.log(`\nDispatching pointerdown at (${dragX.toFixed(0)}, ${dragStartY.toFixed(0)})...`);
  await dispatchPointerEvent(page, 'pointerdown', dragX, dragStartY);

  // Wait past the 380ms long-press threshold
  console.log('Waiting 420ms for long-press threshold...');
  await sleep(420);

  // Check if drag state was set (ghost card should be visible)
  const ghostVisible = await page.evaluate(() => {
    // ReorderGhost is a fixed-position div at zIndex:1001
    const divs = [...document.querySelectorAll('div[style*="z-index: 1001"], div[style*="zIndex: 1001"]')];
    // Also check for fixed div with filter:drop-shadow
    const ghosts = [...document.querySelectorAll('div[style*="drop-shadow"]')];
    return { ghostDivs: divs.length, shadowDivs: ghosts.length };
  });
  console.log('Ghost visibility check:', ghostVisible);

  // Drag down past card 1
  console.log(`Dragging from y=${dragStartY.toFixed(0)} to y=${dragEndY.toFixed(0)}...`);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const y = dragStartY + (dragEndY - dragStartY) * (i / steps);
    await dispatchDocumentPointerEvent(page, 'pointermove', dragX, y);
    await sleep(16); // ~60fps
  }

  // Check insertion line appeared
  const insertionLine = await page.evaluate(() => {
    // InsertionLine is a fixed div with zIndex:1000 and accent background
    const all = [...document.querySelectorAll('div[style*="border-radius: 99px"]')];
    return all.filter(el => {
      const s = el.getAttribute('style') || '';
      return s.includes('position: fixed') || s.includes('position:fixed');
    }).length;
  });
  console.log(`Insertion line elements visible: ${insertionLine}`);

  // Release
  console.log('Dispatching pointerup...');
  await dispatchDocumentPointerEvent(page, 'pointerup', dragX, dragEndY);

  // Wait for state to settle
  await sleep(400);

  // Read final task order
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-task-id]')].map(el => ({
      id: el.getAttribute('data-task-id'),
      title: el.querySelector('div[style*="font-size:14.5"]')?.textContent?.trim() || el.textContent?.slice(0,40),
    }))
  );
  console.log('\nTask order AFTER drag:');
  after.forEach((t, i) => console.log(`  ${i}: ${t.title} (${t.id})`));

  // Compare
  const reordered = before[0].id !== after[0].id || before[1].id !== after[1].id;
  if (reordered) {
    console.log('\n✓ PASS: Task order changed — drag-to-reorder is working.');
  } else {
    console.log('\n✗ FAIL: Task order unchanged after drag.');
    console.log('  This may mean the long-press did not fire, or pointercancel aborted the drag.');
    console.log('  Check the ghost visibility result above.');
  }

  await sleep(1000);
  await browser.close();
  process.exit(reordered ? 0 : 1);
})().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
