"""Cross-tab queue regression. Run against local Vite with --url and --chrome."""
import argparse
import asyncio
from playwright.async_api import async_playwright


async def multiwriter_reproducer(url, chrome, module):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, executable_path=chrome)
        try:
            context = await browser.new_context()
            # Empty document avoids mounting the full app while loading its real module.
            await context.route(url + '/', lambda route: route.fulfill(body='<html></html>', content_type='text/html'))
            first, second = await context.new_page(), await context.new_page()
            for page in (first, second):
                await page.goto(url + '/')
                await page.evaluate("async module => { window.queue = await import(module); }", module)
            # Pause the ACK after its read and before its write. An enqueue in
            # another tab used to be erased by the stale ACK's full-array write.
            paused, release_write = asyncio.Event(), asyncio.Event()

            async def barrier(route):
                paused.set()
                await release_write.wait()
                await route.fulfill(body='continue', content_type='text/plain')

            await context.route(url + '/outbox-write-barrier', barrier)
            await first.evaluate("""async () => {
                localStorage.removeItem('life-os:web-outbox');
                await queue.enqueueOutcome({ itemId: 'old', command: 'complete', createdAt: '2026-11-20T09:00:00Z', idempotencyKey: 'old' });
                const originalSet = Storage.prototype.setItem;
                Storage.prototype.setItem = function(key, value) {
                    Storage.prototype.setItem = originalSet;
                    const pause = new XMLHttpRequest();
                    pause.open('GET', '/outbox-write-barrier', false);
                    pause.send();
                    return originalSet.call(this, key, value);
                };
            }""")
            acknowledging = asyncio.create_task(first.evaluate('async () => { await queue.updatePendingOutcome(queue.readOutbox()[0]); }'))
            await asyncio.wait_for(paused.wait(), timeout=10)
            adding = asyncio.create_task(second.evaluate("""async () => {
                await queue.enqueueOutcome({ itemId: 'survivor', command: 'complete', createdAt: '2026-11-20T09:01:00Z', idempotencyKey: 'survivor' });
            }"""))
            try:
                await asyncio.wait([adding], timeout=0.25)
            finally:
                release_write.set()
            await asyncio.gather(acknowledging, adding)
            assert await first.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['survivor'], 'stale ACK erased an unconfirmed operation enqueued by another tab'
            await context.unroute(url + '/outbox-write-barrier', barrier)
            await first.evaluate("""async () => {
                localStorage.removeItem('life-os:web-outbox');
                await queue.enqueueOutcome({ itemId: 'original', command: 'complete', createdAt: '2026-11-20T10:00:00Z', idempotencyKey: 'original' });
                window.held = navigator.locks.request('life-os:web-outbox:storage', async () => {
                    window.entered = true;
                    await new Promise(resolve => { window.release = resolve; });
                });
            }""")
            await first.wait_for_function('window.entered === true')
            # Independent JavaScript realms contend with an ACK and an enqueue
            # while another holder owns the shared mutation lock.
            await second.evaluate("""() => {
                window.added = false;
                window.adding = Promise.resolve(queue.enqueueOutcome({ itemId: 'new', command: 'complete', createdAt: '2026-11-20T10:01:00Z', idempotencyKey: 'new' })).then(() => { window.added = true; });
            }""")
            await first.evaluate("""() => {
                window.removed = false;
                const original = queue.readOutbox().find(entry => entry.itemId === 'original');
                window.removing = Promise.resolve(queue.updatePendingOutcome(original)).then(() => { window.removed = true; });
            }""")
            try:
                assert await second.evaluate('window.added') is False, 'enqueue bypassed the cross-tab mutation lock'
                assert await first.evaluate('window.removed') is False, 'ACK bypassed the cross-tab mutation lock'
                assert await first.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['original']
            finally:
                await first.evaluate('async () => { release(); await held; }')
            await asyncio.gather(first.evaluate('window.removing'), second.evaluate('window.adding'))
            after_ack = await first.evaluate('queue.readOutbox().map(entry => entry.itemId)')
            assert after_ack == ['new'], after_ack
            # Repeated real-tab read/modify/write contention cannot erase new
            # unconfirmed operations, including when state updates race enqueues.
            for iteration in range(20):
                await asyncio.gather(
                    first.evaluate("""async i => {
                        const current = queue.readOutbox().find(entry => entry.itemId === 'new');
                        await queue.updatePendingOutcome(current, { ...current, state: 'FAILED', reason: 'retry' });
                    }""", iteration),
                    second.evaluate("""async i => {
                        await queue.enqueueOutcome({ itemId: 'extra-' + i, command: 'complete', createdAt: '2026-11-20T10:02:00Z', idempotencyKey: 'extra-' + i });
                    }""", iteration),
                )
            await second.reload()
            await second.evaluate("async module => { window.queue = await import(module); }", module)
            ids = await second.evaluate('queue.readOutbox().map(entry => entry.itemId)')
            assert set(ids) == {'new', *(f'extra-{i}' for i in range(20))}, ids
            print('PASS: real two-tab stale ACK/enqueue race, shared mutation lock, 20 concurrent state/enqueue writes, reload preserved 21 pending operations')
        finally:
            await browser.close()


async def single_writer_regression(url, chrome, module):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, executable_path=chrome)
        try:
            context = await browser.new_context()
            await context.route(url + '/', lambda route: route.fulfill(body='<html></html>', content_type='text/html'))
            first, second = await context.new_page(), await context.new_page()
            for page in (first, second):
                await page.goto(url + '/')
                await page.evaluate('async module => { window.queue = await import(module); }', module)
            await first.evaluate("""async () => {
                localStorage.removeItem('life-os:web-outbox');
                await queue.enqueueOutcome({ itemId: 'original', command: 'complete', createdAt: '2026-11-20T10:00:00Z', idempotencyKey: 'original' });
            }""")
            denied_enqueue = await second.evaluate("""async () => {
                try {
                    await queue.enqueueOutcome({ itemId: 'new', command: 'complete', createdAt: '2026-11-20T10:01:00Z', idempotencyKey: 'new' });
                    return null;
                } catch (error) { return error.message; }
            }""")
            assert denied_enqueue and 'другой вкладке' in denied_enqueue, denied_enqueue
            denied_ack = await second.evaluate("""async () => {
                try {
                    await queue.updatePendingOutcome({ itemId: 'original', command: 'complete', createdAt: '2026-11-20T10:00:00Z', idempotencyKey: 'original' });
                    return null;
                } catch (error) { return error.message; }
            }""")
            assert denied_ack and 'другой вкладке' in denied_ack, denied_ack
            denied_online = await second.evaluate("""async () => {
                const offline = await import('/src/offline.ts');
                try {
                    await offline.submitQueuedOutcome({ id: 'original', title: 'Task', kind: 'task', status: 'planned',
                        planned_start: '2026-11-20T09:00:00+03:00', planned_end: null, carry_forward: false },
                        'complete', { online: true, items: [] });
                    return null;
                } catch (error) { return error.message; }
            }""")
            assert denied_online and 'другой вкладке' in denied_online, denied_online
            assert await first.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['original']
            # The admitted document can merge concurrent local operations.
            await first.evaluate("""async () => {
                const original = queue.readOutbox()[0];
                await Promise.all([
                    queue.updatePendingOutcome(original, { ...original, state: 'FAILED', reason: 'retry' }),
                    queue.enqueueOutcome({ itemId: 'retained', command: 'complete', createdAt: '2026-11-20T10:02:00Z', idempotencyKey: 'retained' }),
                ]);
                await queue.updatePendingOutcome(queue.readOutbox().find(entry => entry.itemId === 'original'));
            }""")
            assert await first.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['retained']
            await first.close()
            await second.wait_for_function("async () => !(await navigator.locks.query()).held.some(lock => lock.name === 'life-os:web-outbox:writer')")
            # A previously denied renderer stays denied until reload: no claim
            # of seamless handover with a potentially stale Storage snapshot.
            still_denied = await second.evaluate("""async () => {
                try {
                    await queue.enqueueOutcome({ itemId: 'new', command: 'complete', createdAt: '2026-11-20T10:01:00Z', idempotencyKey: 'new' });
                    return false;
                } catch { return true; }
            }""")
            assert still_denied
            await second.reload()
            await second.evaluate('async module => { window.queue = await import(module); }', module)
            assert await second.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['retained']
            await second.evaluate("""async () => {
                await queue.enqueueOutcome({ itemId: 'new', command: 'complete', createdAt: '2026-11-20T10:01:00Z', idempotencyKey: 'new' });
            }""")
            assert await second.evaluate('queue.readOutbox().map(entry => entry.itemId)') == ['retained', 'new']
            print('PASS: real two-tab writer/ACK/online-command denial preserves pending operation; owner close + required reload + retry preserves both operations')
        finally:
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--chrome', required=True)
    parser.add_argument('--module', default='/src/outbox.ts')
    parser.add_argument('--multiwriter-repro', action='store_true', help='Exercise the rejected multiwriter design; expected RED for the old baseline')
    args = parser.parse_args()
    test = multiwriter_reproducer if args.multiwriter_repro else single_writer_regression
    asyncio.run(test(args.url.rstrip('/'), args.chrome, args.module))
