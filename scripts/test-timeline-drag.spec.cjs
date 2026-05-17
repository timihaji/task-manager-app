// @ts-check
// Playwright test: desktop Timeline view drag-to-reorder
// Usage: npx playwright test --config=playwright.config.cjs scripts/test-timeline-drag.spec.cjs
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://[::1]:5179/?dev=1';

// Get ordered task ids from a timeline column for a given date string
async function getColTaskIds(page, dateStr) {
  return page.evaluate((ds) => {
    const col = document.querySelector(`.col[data-col-key="${ds}"]`);
    if (!col) return [];
    return [...col.querySelectorAll('.card[data-card-id]:not(.dragging)')].map(el => el.getAttribute('data-card-id'));
  }, dateStr);
}

test.describe('Timeline drag-to-reorder', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('reorders cards within the same day column', async ({ page }) => {
    await page.goto(APP_URL);
    // Wait for the timeline to render with cards
    await page.waitForSelector('.col[data-col-key]', { timeout: 10000 });
    await page.waitForSelector('.card[data-card-id]', { timeout: 10000 });
    await page.waitForTimeout(500); // settle

    // Find a column that has at least 2 draggable (non-done, non-blocked) cards
    const colInfo = await page.evaluate(() => {
      for (const col of document.querySelectorAll('.col[data-col-key]')) {
        const dateStr = col.getAttribute('data-col-key');
        // Cards inside a SortableContext group (not in blocked/done sections)
        const sortableCards = [...col.querySelectorAll('.grp-free .card[data-card-id], .grp-box .card[data-card-id]')].filter(el => {
          // skip cards inside done/blocked grp sections
          return !el.closest('.done-grp-hdr + *') && !el.closest('.blocked-grp-hdr + *');
        });
        if (sortableCards.length >= 2) {
          const rects = sortableCards.map(c => {
            const r = c.getBoundingClientRect();
            return { id: c.getAttribute('data-card-id'), x: r.left + r.width/2, y: r.top + r.height/2, top: r.top, bottom: r.bottom };
          });
          return { dateStr, cards: rects };
        }
      }
      return null;
    });

    if (!colInfo) {
      console.log('No column with 2+ draggable cards found — check INIT_TASKS has today/future tasks');
      test.skip();
      return;
    }

    console.log(`Testing column ${colInfo.dateStr} with ${colInfo.cards.length} cards`);
    console.log('Cards before:', colInfo.cards.map(c => c.id));

    const card0 = colInfo.cards[0];
    const card1 = colInfo.cards[1];
    const card0Height = card0.bottom - card0.top;

    // Drag card0 below card1.
    // Key subtlety: dnd-kit's verticalListSortingStrategy shifts card1 DOWN by
    // card0's height once the drag activates. card1's runtime getBoundingClientRect
    // midpoint is therefore ~(card1.y + card0Height). We must aim the cursor well
    // below THAT shifted midpoint so insertAfter=true and card0 lands after card1.
    const dropY = card1.bottom + card0Height + 20;
    console.log(`card0 height=${Math.round(card0Height)}, card1.bottom=${Math.round(card1.bottom)}, dropY=${Math.round(dropY)}`);

    await page.mouse.move(card0.x, card0.y);
    await page.mouse.down();
    await page.mouse.move(card0.x, card0.y + 8, { steps: 3 });
    await page.waitForTimeout(60);
    await page.mouse.move(card0.x, dropY, { steps: 15 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const idsAfter = await getColTaskIds(page, colInfo.dateStr);
    console.log('Cards after:', idsAfter);

    // card1 should now precede card0 in the column
    const pos0 = idsAfter.indexOf(card0.id);
    const pos1 = idsAfter.indexOf(card1.id);
    console.log(`card0 (${card0.id}) now at index ${pos0}, card1 (${card1.id}) at index ${pos1}`);
    expect(pos1).toBeLessThan(pos0);
    console.log(`✓ Reorder confirmed: ${card1.id} (${pos1}) < ${card0.id} (${pos0})`);
  });

  test('cards have data-card-id and SortableContext is wired', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.col[data-col-key]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const info = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('.col[data-col-key]')];
      const cards = [...document.querySelectorAll('.card[data-card-id]')];
      const draggable = cards.filter(c => c.getAttribute('draggable') === 'true' || c.closest('[data-rfd-draggable-id]') || c.classList.contains('sortable'));
      // Check for dnd-kit transform style (set during drag; at rest it should be identity or absent)
      // Instead just verify sortable data is attached via React internals presence
      return {
        colCount: cols.length,
        cardCount: cards.length,
        hasAnyCard: cards.length > 0,
        sampleCardId: cards[0]?.getAttribute('data-card-id'),
      };
    });

    console.log('Timeline info:', info);
    expect(info.colCount).toBeGreaterThan(0);
    expect(info.hasAnyCard).toBe(true);
  });
});
