#!/bin/bash
# Neon Tide screenshots: serve game/ locally, capture each ?shot= scene with
# Playwright's headless Chromium (waits for window.__shotReady, so the frame
# is really painted), convert to JPEG under 256 KiB in screenshots/.
set -u
REPO="$HOME/workspace/make-fun/gta6-01"
cd "$REPO"
node serve.ts --port 8080 > /tmp/neon-serve.log 2>&1 &
SRV=$!
sleep 1
python3 - <<'PYEOF'
import json, os
from playwright.sync_api import sync_playwright
from PIL import Image

specs = json.load(open('shots.json'))
with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=os.path.expanduser('~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
        args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: print('PAGEERROR:', e))
    pg.on('requestfailed', lambda r: print('REQFAIL:', r.url))
    for spec in specs:
        name, query = spec['name'], spec['query']
        pg.goto(f'http://localhost:8080/{query}')
        pg.wait_for_function('window.__shotReady === true', timeout=30000)
        tmp = f'/tmp/neon-{name}.png'
        pg.screenshot(path=tmp)
        im = Image.open(tmp).convert('RGB')
        dst = f'screenshots/{name}'
        quality = 88
        while True:
            im.save(dst, 'JPEG', quality=quality)
            size = os.path.getsize(dst)
            if size <= 256 * 1024 or quality <= 40:
                break
            quality -= 8
        print(name, im.size, size, 'bytes', 'quality', quality)
    b.close()
PYEOF
kill $SRV 2>/dev/null
echo done
