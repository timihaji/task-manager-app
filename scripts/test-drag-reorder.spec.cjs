// @ts-check
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://[::1]:5179/?dev=1&mobile=1';

// Dispatch a PointerEvent on whichever element is at (x,y)
async function pointerDown(page, x, y, pid = 1) {
  await page.evaluate(({ x, y, pid }) => {
    const el = document.elementFromPoint(x, y);
    el?.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerId: pid, pointerType: 'touch', isPrimary: true,
    }));
  }, { x, y, pid });
}

// Dispatch a document-level pointermove (matches how useReorder registers its listener)
async function pointerMove(page, x, y, pid = 1) {
  await page.evaluate(({ x, y, pid }) => {
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerId: pid, pointerType: 'touch', isPrimary: true,
    }));
  }, { x, y, pid });
}

async function pointerUp(page, x, y, pid = 1) {
  await page.evaluate(({ x, y, pid }) => {
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      pointerId: pid, pointerType: 'touch', isPrimary: true,
    }));
  }, { x, y, pid });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test.describe('Mobile drag-to-reorder', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('long-press + drag reorders tasks in Inbox', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('[data-task-id]', { timeout: 10000 });

    // Navigate to Inbox tab
    await page.locator('button', { hasText: 'Inbox' }).click();
    await page.waitForTimeout(300);

    // Read initial order
    const tasksBefore = await page.evaluate(() =>
      [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'))
    );
    console.log('Tasks before:', tasksBefore);
    expect(tasksBefore.length).toBeGreaterThanOrEqual(2);

    // Get bounding rects for first two cards
    const [rect0, rect1] = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-task-id]')];
      return cards.slice(0, 2).map(c => {
        const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      });
    });

    const cx = rect0.left + rect0.width / 2;
    const cy = rect0.top + rect0.height / 2;
    console.log(`Card0 center: (${cx.toFixed(0)}, ${cy.toFixed(0)}), Card1 bottom: ${rect1.bottom.toFixed(0)}`);

    // ── Simulate long-press on card 0 ────────────────────────────────────────
    await pointerDown(page, cx, cy);
    await page.waitForTimeout(420);   // past the 380ms threshold

    // Verify ghost appeared (phase transitions to 'dragging' at 60ms after press)
    await page.waitForTimeout(80);
    const ghostExists = await page.evaluate(() => {
      // ReorderGhost renders a fixed div with filter:drop-shadow at zIndex 1001
      return [...document.querySelectorAll('div')].some(el => {
        const s = el.style;
        return s.position === 'fixed' && s.zIndex === '1001';
      });
    });
    console.log('Ghost card visible:', ghostExists);
    expect(ghostExists).toBe(true);

    // ── Drag down past card 1 ────────────────────────────────────────────────
    const endY = rect1.bottom + 8;
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const y = cy + (endY - cy) * (i / steps);
      await pointerMove(page, cx, y);
      await page.waitForTimeout(16);
    }

    // Check insertion line appeared
    const lineExists = await page.evaluate(() =>
      [...document.querySelectorAll('div')].some(el => {
        const s = el.style;
        return s.position === 'fixed' && s.zIndex === '1000' && s.height === '3px';
      })
    );
    console.log('Insertion line visible:', lineExists);

    // ── Release ──────────────────────────────────────────────────────────────
    await pointerUp(page, cx, endY);
    await page.waitForTimeout(400);

    // Read final order
    const tasksAfter = await page.evaluate(() =>
      [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'))
    );
    console.log('Tasks after: ', tasksAfter);

    // First task should have moved — order must differ
    expect(tasksAfter[0]).not.toBe(tasksBefore[0]);
    console.log(`✓ Reorder confirmed: first card changed from ${tasksBefore[0]} to ${tasksAfter[0]}`);
  });

  test('long-press cancel (no movement) snaps ghost back', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('[data-task-id]', { timeout: 10000 });

    await page.locator('button', { hasText: 'Inbox' }).click();
    await page.waitForTimeout(300);

    const rect0 = await page.evaluate(() => {
      const r = document.querySelectorAll('[data-task-id]')[0].getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const cx = rect0.left + rect0.width / 2;
    const cy = rect0.top + rect0.height / 2;

    const tasksBefore = await page.evaluate(() =>
      [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'))
    );

    // Long-press then release without moving
    await pointerDown(page, cx, cy);
    await page.waitForTimeout(420);
    await pointerUp(page, cx, cy);
    await page.waitForTimeout(400);

    const tasksAfter = await page.evaluate(() =>
      [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'))
    );

    expect(tasksAfter[0]).toBe(tasksBefore[0]);
    console.log('✓ Cancel-drag: order unchanged, as expected');
  });
});
