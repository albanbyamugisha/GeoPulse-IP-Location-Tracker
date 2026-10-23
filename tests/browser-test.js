const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = process.env.GEOPULSE_URL || 'http://127.0.0.1:8765/src/index.html';
const CDP_PORT = Number(process.env.GEOPULSE_CDP_PORT || 9222);
const OUT = path.join(ROOT, 'screenshots');
const SUMMARY_PATH = path.join(__dirname, 'latest-test-summary.json');

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const runtimeExceptions = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: CDP_PORT, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const handlers = this.listeners.get(message.method) || [];
      handlers.slice().forEach((handler) => handler(message.params));
    });
  }

  async send(method, params) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
    return () => {
      const list = this.listeners.get(method) || [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    };
  }

  waitEvent(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('Timed out waiting for event ' + method));
      }, timeout);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  close() {
    try { this.ws.close(); } catch (error) { /* ignore */ }
  }
}

let client;

async function evaluate(expression, awaitPromise = false) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception && response.exceptionDetails.exception.description;
    throw new Error(description || response.exceptionDetails.text || 'Evaluation failed');
  }
  return response.result.value;
}

async function waitFor(expression, timeout = 30000, label = 'condition') {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for ' + label + (lastError ? ' (' + lastError.message + ')' : ''));
}

async function snapshot() {
  return evaluate(`(() => {
    const text = (id) => (document.getElementById(id)?.textContent || '').trim();
    return {
      ip: text('result-ip'),
      place: text('result-place'),
      type: text('result-type'),
      lat: text('result-lat'),
      lng: text('result-lng'),
      mapLat: text('map-lat'),
      mapLng: text('map-lng'),
      city: text('detail-city'),
      region: text('detail-region'),
      country: text('detail-country'),
      network: text('detail-network'),
      timezone: text('detail-timezone'),
      asn: text('detail-asn'),
      errorTitle: text('result-error-title'),
      errorMessage: text('result-error-message'),
      status: text('status-region'),
      statusClass: document.getElementById('status-region').className,
      contentHidden: document.getElementById('result-content').hidden,
      errorHidden: document.getElementById('result-error').hidden,
      loadingHidden: document.getElementById('result-loading').hidden,
      markerCount: document.querySelectorAll('.gp-marker').length,
      popup: (document.querySelector('.leaflet-popup-content')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      mapChip: text('map-chip'),
      historyCount: document.querySelectorAll('#history-list li').length,
      historyIps: Array.from(document.querySelectorAll('#history-list button[data-ip]')).map((b) => b.dataset.ip),
      historyStorage: (() => { try { return sessionStorage.getItem('geopulse-history'); } catch (e) { return null; } })(),
      theme: document.documentElement.getAttribute('data-theme'),
      themePressed: document.getElementById('theme-toggle').getAttribute('aria-pressed'),
      attribution: (document.querySelector('.leaflet-control-attribution')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      mapTiles: document.querySelectorAll('#map img.leaflet-tile').length,
      leafletReady: !!document.querySelector('#map .leaflet-pane'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      busy: document.getElementById('ip-form').getAttribute('aria-busy'),
      inputValue: document.getElementById('ip-input').value,
      clearDisabled: document.getElementById('clear-history').disabled
    };
  })()`);
}

async function search(ip) {
  await evaluate(`(() => {
    const input = document.getElementById('ip-input');
    input.value = ${JSON.stringify(ip)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('ip-form').requestSubmit();
  })()`);
  await waitFor(
    `document.getElementById('ip-form').getAttribute('aria-busy') === 'false' && document.getElementById('result-loading').hidden === true`,
    25000,
    'lookup to finish for ' + ip
  );
  await sleep(350);
  return snapshot();
}

async function findMyIp() {
  await evaluate(`document.getElementById('find-my-ip').click()`);
  await waitFor(
    `document.getElementById('ip-form').getAttribute('aria-busy') === 'false' && document.getElementById('result-loading').hidden === true`,
    25000,
    'Find My IP to finish'
  );
  await sleep(350);
  return snapshot();
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

function check(name, condition, expected, actual) {
  results.push({ name, status: condition ? 'PASS' : 'FAIL', expected, actual });
  console.log((condition ? 'PASS' : 'FAIL') + ' | ' + name + ' | expected=' + expected + ' | actual=' + actual);
}

async function screenshot(name) {
  const response = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(OUT + '/' + name, Buffer.from(response.data, 'base64'));
  console.log('Screenshot saved: ' + name);
}

async function scrollToDashboard() {
  await evaluate(`document.getElementById('dashboard').scrollIntoView({ block: 'start', behavior: 'instant' });`);
  await sleep(500);
}

async function waitForMap() {
  await waitFor(`!!document.querySelector('#map .leaflet-pane')`, 15000, 'Leaflet map to initialise');
  await waitFor(`document.querySelectorAll('#map img.leaflet-tile').length > 0`, 12000, 'map tiles to appear');
}

async function main() {
  const targets = await getJson('/json/list');
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No Chrome page target found');
  client = new CDP(page.webSocketDebuggerUrl);

  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      consoleErrors.push(params.args.map((arg) => arg.value || arg.description || '').join(' '));
    }
  });
  client.on('Runtime.exceptionThrown', (params) => {
    const details = params.exceptionDetails;
    runtimeExceptions.push((details.exception && details.exception.description) || details.text);
  });

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Network.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false
  });

  let loadEvent = client.waitEvent('Page.loadEventFired', 30000);
  await client.send('Page.navigate', { url: APP_URL });
  await loadEvent;
  await waitFor(`document.readyState === 'complete'`, 15000, 'page load');
  await waitForMap();
  await sleep(500);

  let state = await snapshot();
  check('Application title', (await evaluate('document.title')) === 'GeoPulse — IP Location Tracker', 'GeoPulse — IP Location Tracker', await evaluate('document.title'));
  check('Initial world map rendered', state.leafletReady === true && state.mapTiles > 0, 'Leaflet map with tiles', `leaflet=${state.leafletReady}, tiles=${state.mapTiles}`);
  check('Initial map chip', state.mapChip === 'World view', 'World view', state.mapChip);
  check('Initial result state', state.contentHidden === true && state.errorHidden === true, 'Empty result panel', `contentHidden=${state.contentHidden}, errorHidden=${state.errorHidden}`);
  check('OpenStreetMap attribution visible', /OpenStreetMap/.test(state.attribution), 'OpenStreetMap attribution', state.attribution);
  await screenshot('hero-light.png');

  state = await search('8.8.8.8');
  check('IPv4 lookup succeeds', state.contentHidden === false && /status-success/.test(state.statusClass), 'Successful IPv4 result', state.status);
  check('IPv4 address displayed', state.ip === '8.8.8.8', '8.8.8.8', state.ip);
  check('IPv4 type displayed', state.type === 'IPv4', 'IPv4', state.type);
  check('Location details displayed', state.country !== 'Not available' && state.city !== 'Not available', 'City and country from live API', `${state.city} / ${state.country}`);
  check('Coordinates displayed', /°/.test(state.lat) && /°/.test(state.lng), 'Formatted latitude and longitude', `${state.lat}, ${state.lng}`);
  check('Map marker and popup update', state.markerCount === 1 && state.popup.includes('8.8.8.8'), 'One marker and matching popup', `markers=${state.markerCount}, popup=${state.popup}`);
  check('Map view chip updates', state.mapChip === 'Local estimate', 'Local estimate', state.mapChip);
  check('History records first lookup', state.historyCount === 1 && state.historyIps[0] === '8.8.8.8', '1 entry for 8.8.8.8', JSON.stringify(state.historyIps));
  await scrollToDashboard();
  await screenshot('dashboard-light.png');

  state = await search('2001:4860:4860::8888');
  check('IPv6 lookup succeeds', state.contentHidden === false && /status-success/.test(state.statusClass), 'Successful IPv6 result', state.status);
  check('IPv6 address displayed', state.ip === '2001:4860:4860::8888', '2001:4860:4860::8888', state.ip);
  check('IPv6 type displayed', state.type === 'IPv6', 'IPv6', state.type);
  check('Marker replaced, not duplicated', state.markerCount === 1 && state.popup.includes('2001:4860:4860::8888'), 'One marker for new IP', `markers=${state.markerCount}, popup=${state.popup}`);
  check('History keeps unique newest first', state.historyCount === 2 && state.historyIps[0] === '2001:4860:4860::8888', 'IPv6 first, 2 unique entries', JSON.stringify(state.historyIps));

  await click('button[data-ip="8.8.8.8"]');
  await waitFor(`document.getElementById('ip-form').getAttribute('aria-busy') === 'false' && document.getElementById('result-loading').hidden === true`, 25000, 'history lookup');
  await sleep(350);
  state = await snapshot();
  check('History entry performs lookup', state.ip === '8.8.8.8' && /status-success/.test(state.statusClass), '8.8.8.8 result', `${state.ip} / ${state.status}`);
  check('History entry not duplicated', state.historyCount === 2 && new Set(state.historyIps).size === 2, '2 unique entries', JSON.stringify(state.historyIps));

  await click('#theme-toggle');
  await sleep(500);
  state = await snapshot();
  check('Dark theme applies', state.theme === 'dark' && state.themePressed === 'true', 'dark and aria-pressed=true', `${state.theme}, pressed=${state.themePressed}`);
  check('Theme preference stored', (await evaluate(`localStorage.getItem('geopulse-theme')`)) === 'dark', 'localStorage=dark', await evaluate(`localStorage.getItem('geopulse-theme')`));
  await scrollToDashboard();
  await screenshot('dashboard-dark.png');

  loadEvent = client.waitEvent('Page.loadEventFired', 30000);
  await client.send('Page.reload', { ignoreCache: false });
  await loadEvent;
  await waitFor(`document.readyState === 'complete'`, 15000, 'reload');
  await waitForMap();
  await sleep(400);
  state = await snapshot();
  check('Theme persists after reload', state.theme === 'dark' && state.themePressed === 'true', 'dark restored', `${state.theme}, pressed=${state.themePressed}`);
  check('History persists within session', state.historyCount === 2, '2 entries after reload', state.historyCount);

  await click('#theme-toggle');
  await sleep(300);

  state = await findMyIp();
  check('Find My IP returns a public address', /^(?:\d{1,3}\.){3}\d{1,3}$/.test(state.ip) || state.ip.includes(':'), 'IPv4 or IPv6 public address', 'Public address detected');
  check('Find My IP displays a result', state.contentHidden === false && /status-success/.test(state.statusClass), 'Successful result', 'Successful result with provider disclosure');
  check('Find My IP fills input', state.inputValue === state.ip, 'Input matches detected address', state.inputValue === state.ip ? 'Input matches' : 'Input mismatch');

  state = await search('hello');
  check('Invalid input handled', state.errorHidden === false && state.errorTitle === 'Invalid IP address', 'Invalid IP address error', `${state.errorTitle}: ${state.errorMessage}`);
  check('Failed lookup hides old result', state.contentHidden === true && state.markerCount === 0, 'No result content or marker', `contentHidden=${state.contentHidden}, markers=${state.markerCount}`);
  await scrollToDashboard();
  await screenshot('error-state.png');

  state = await search('10.0.0.1');
  check('Private IP handled', state.errorHidden === false && state.errorTitle === 'Not a public IP address', 'Not a public IP address error', `${state.errorTitle}: ${state.errorMessage}`);
  check('Private IP lookup hides old result', state.contentHidden === true && state.markerCount === 0, 'No result content or marker', `contentHidden=${state.contentHidden}, markers=${state.markerCount}`);

  state = await search('');
  check('Empty input handled', /status-error/.test(state.statusClass) && /Enter an IP address/.test(state.errorMessage), 'Helpful empty-input message', state.errorMessage);

  const testIps = ['1.1.1.1', '9.9.9.9', '4.2.2.2', '8.8.4.4', '208.67.222.222'];
  for (const ip of testIps) {
    state = await search(ip);
    if (state.contentHidden) {
      check('History limit test lookup ' + ip, false, 'Successful lookup', state.errorMessage);
    }
  }
  state = await snapshot();
  check('History capped at five unique entries', state.historyCount === 5 && new Set(state.historyIps).size === 5, '5 unique entries', JSON.stringify(state.historyIps));
  check('Newest history entry first', state.historyIps[0] === '208.67.222.222', '208.67.222.222', state.historyIps[0]);

  await click('#clear-history');
  await sleep(300);
  state = await snapshot();
  check('Clear History works', state.historyCount === 0 && state.clearDisabled === true, 'Empty list and disabled button', `count=${state.historyCount}, disabled=${state.clearDisabled}`);
  check('Clear History clears session storage', (await evaluate(`sessionStorage.getItem('geopulse-history')`)) === '[]', '[]', await evaluate(`sessionStorage.getItem('geopulse-history')`));

  await client.send('Network.setBlockedURLs', { urls: ['*ipinfo.io*'] });
  state = await search('8.8.8.8');
  check('Network failure handled', state.errorHidden === false && state.errorTitle === 'Network problem', 'Network problem error', `${state.errorTitle}: ${state.errorMessage}`);
  await client.send('Network.setBlockedURLs', { urls: [] });

  let fetchMock = null;
  const pausedRequests = [];
  client.on('Fetch.requestPaused', async (params) => {
    try {
      if (!fetchMock) {
        await client.send('Fetch.continueRequest', { requestId: params.requestId });
        return;
      }
      const current = fetchMock;
      if (current.mode === 'pause') {
        pausedRequests.push(params.requestId);
        fetchMock = null;
        return;
      }
      fetchMock = null;
      if (current.mode === 'fail') {
        await client.send('Fetch.failRequest', {
          requestId: params.requestId,
          errorReason: current.reason || 'Failed'
        });
        return;
      }
      await client.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: current.status,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' }
        ],
        body: Buffer.from(JSON.stringify(current.body)).toString('base64')
      });
    } catch (error) {
      console.error('Fetch handler error:', error.message);
    }
  });
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*ipinfo.io*', requestStage: 'Request' }] });

  fetchMock = { mode: 'fulfill', status: 429, body: { error: 'Rate limit exceeded' } };
  state = await search('1.1.1.1');
  check('Rate limit handled', state.errorHidden === false && state.errorTitle === 'Service limit reached', 'Service limit reached error', `${state.errorTitle}: ${state.errorMessage}`);

  fetchMock = {
    mode: 'fulfill',
    status: 200,
    body: {
      ip: '8.8.4.4',
      country: 'US'
    }
  };
  state = await search('8.8.4.4');
  check('Missing fields show Not available', state.city === 'Not available' && state.region === 'Not available' && state.country === 'United States', 'Not available for missing city/region', `${state.city} / ${state.region} / ${state.country}`);
  check('Missing coordinates handled safely', state.mapChip === 'No coordinates' && state.markerCount === 0, 'No marker, No coordinates chip', `${state.mapChip}, markers=${state.markerCount}`);
  check('Missing coordinates still complete lookup', /status-success/.test(state.statusClass) && /did not return usable coordinates/.test(state.status), 'Success status with coordinate warning', state.status);

  fetchMock = { mode: 'pause' };
  const started = Date.now();
  await evaluate(`(() => {
    const input = document.getElementById('ip-input');
    input.value = '9.9.9.9';
    document.getElementById('ip-form').requestSubmit();
  })()`);
  await waitFor(`/status-error/.test(document.getElementById('status-region').className)`, 20000, 'timeout error');
  state = await snapshot();
  check('Request timeout handled', state.errorTitle === 'Request timed out', 'Request timed out error', `${state.errorTitle} after ${Date.now() - started}ms`);
  for (const requestId of pausedRequests) {
    try { await client.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch (error) { /* already gone */ }
  }
  await client.send('Fetch.disable');

  state = await search('8.8.8.8');
  check('Lookup works after errors', state.contentHidden === false && state.markerCount === 1, 'Successful result after failure states', `${state.ip}, markers=${state.markerCount}`);

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(900);
  state = await snapshot();
  check('Mobile layout has no horizontal overflow', state.scrollWidth <= state.clientWidth + 1, 'scrollWidth <= clientWidth', `scrollWidth=${state.scrollWidth}, clientWidth=${state.clientWidth}`);
  await scrollToDashboard();
  await screenshot('mobile-light.png');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(700);
  state = await snapshot();
  check('Tablet layout has no horizontal overflow', state.scrollWidth <= state.clientWidth + 1, 'scrollWidth <= clientWidth', `scrollWidth=${state.scrollWidth}, clientWidth=${state.clientWidth}`);

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false
  });

  await evaluate(`sessionStorage.setItem('geopulse-history', '{not valid json')`);
  loadEvent = client.waitEvent('Page.loadEventFired', 30000);
  await client.send('Page.reload', { ignoreCache: false });
  await loadEvent;
  await waitFor(`document.readyState === 'complete'`, 15000, 'reload with corrupt history');
  await waitForMap();
  await sleep(400);
  state = await snapshot();
  check('Corrupted history handled safely', state.historyCount === 0 && state.contentHidden === true, 'Empty history, app usable', `history=${state.historyCount}`);

  check('No runtime exceptions', runtimeExceptions.length === 0, '0 exceptions', JSON.stringify(runtimeExceptions));
  check('No application console errors', consoleErrors.length === 0, '0 console errors', JSON.stringify(consoleErrors));

  const summary = {
    timestamp: new Date().toISOString(),
    appUrl: APP_URL,
    cdpPort: CDP_PORT,
    results,
    consoleErrors,
    runtimeExceptions,
    passed: results.filter((item) => item.status === 'PASS').length,
    failed: results.filter((item) => item.status === 'FAIL').length
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log('\nSUMMARY: ' + summary.passed + ' passed, ' + summary.failed + ' failed.');
  console.log('Summary written to ' + SUMMARY_PATH);
  if (summary.failed) {
    console.log(JSON.stringify(results.filter((item) => item.status === 'FAIL'), null, 2));
  }
  client.close();
}

main().catch((error) => {
  console.error('TEST HARNESS ERROR:', error.stack || error);
  if (client) client.close();
  process.exit(1);
});
