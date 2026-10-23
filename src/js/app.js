(function () {
  'use strict';

  const API_BASE = 'https://ipinfo.io/';
  const REQUEST_TIMEOUT_MS = 12000;
  const HISTORY_KEY = 'geopulse-history';
  const THEME_KEY = 'geopulse-theme';
  const HISTORY_LIMIT = 5;
  const WORLD_CENTER = [20, 0];
  const WORLD_ZOOM = 2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const elements = {};
  let map = null;
  let marker = null;
  let isSearching = false;
  let history = [];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    hydrateTheme();
    history = readHistory();
    renderHistory();
    bindEvents();
    initMap();
  }

  function cacheElements() {
    elements.form = document.getElementById('ip-form');
    elements.input = document.getElementById('ip-input');
    elements.searchButton = document.getElementById('search-btn');
    elements.searchLabel = document.getElementById('search-label');
    elements.findButton = document.getElementById('find-my-ip');
    elements.findLabel = document.getElementById('find-label');
    elements.status = document.getElementById('status-region');
    elements.themeToggle = document.getElementById('theme-toggle');
    elements.map = document.getElementById('map');
    elements.mapChip = document.getElementById('map-chip');
    elements.mapLat = document.getElementById('map-lat');
    elements.mapLng = document.getElementById('map-lng');
    elements.resultBadge = document.getElementById('result-badge');
    elements.resultEmpty = document.getElementById('result-empty');
    elements.resultLoading = document.getElementById('result-loading');
    elements.loadingText = document.getElementById('loading-text');
    elements.resultError = document.getElementById('result-error');
    elements.resultErrorTitle = document.getElementById('result-error-title');
    elements.resultErrorMessage = document.getElementById('result-error-message');
    elements.resultContent = document.getElementById('result-content');
    elements.resultFlag = document.getElementById('result-flag');
    elements.resultIp = document.getElementById('result-ip');
    elements.resultPlace = document.getElementById('result-place');
    elements.resultType = document.getElementById('result-type');
    elements.detailIp = document.getElementById('detail-ip');
    elements.detailVersion = document.getElementById('detail-version');
    elements.detailCity = document.getElementById('detail-city');
    elements.detailRegion = document.getElementById('detail-region');
    elements.detailCountry = document.getElementById('detail-country');
    elements.detailNetwork = document.getElementById('detail-network');
    elements.detailTimezone = document.getElementById('detail-timezone');
    elements.detailAsn = document.getElementById('detail-asn');
    elements.resultLat = document.getElementById('result-lat');
    elements.resultLng = document.getElementById('result-lng');
    elements.historyList = document.getElementById('history-list');
    elements.historyEmpty = document.getElementById('history-empty');
    elements.clearHistory = document.getElementById('clear-history');
  }

  function bindEvents() {
    elements.form.addEventListener('submit', function (event) {
      event.preventDefault();
      lookupIp(elements.input.value, false);
    });

    elements.findButton.addEventListener('click', function () {
      lookupIp('', true);
    });

    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.clearHistory.addEventListener('click', clearHistory);
    elements.historyList.addEventListener('click', handleHistoryClick);
  }

  function initMap() {
    if (typeof window.L === 'undefined') {
      const fallback = document.createElement('div');
      fallback.className = 'map-fallback';
      fallback.textContent = 'The map library could not load. Check your internet connection and reload the page.';
      elements.map.replaceChildren(fallback);
      setMapChip('Map unavailable');
      return;
    }

    map = L.map(elements.map, {
      center: WORLD_CENTER,
      zoom: WORLD_ZOOM,
      minZoom: 2,
      worldCopyJump: true
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
  }

  async function lookupIp(rawIp, isSelf) {
    if (isSearching) {
      return;
    }

    const ip = String(rawIp || '').trim();

    if (!isSelf) {
      const validationMessage = validateInput(ip);
      if (validationMessage) {
        showStatus('error', validationMessage);
        setResultState('error', {
          title: 'Check the IP address',
          message: validationMessage
        });
        clearMarker();
        resetCoordinates();
        resetMapToWorld();
        elements.input.focus();
        return;
      }
      elements.input.value = ip;
    } else {
      elements.input.value = '';
    }

    startSearching(isSelf, ip);

    try {
      const data = await requestLookup(isSelf ? '' : ip);
      const result = normalizeResult(data, isSelf ? '' : ip);

      renderResult(result);
      updateMap(result);
      addHistory(result);

      if (isSelf) {
        elements.input.value = result.ip;
      }

      if (result.hasCoordinates) {
        showStatus(
          'success',
          isSelf
            ? 'Public IP ' + result.ip + ' located. This is the address visible to ipinfo.io, not a GPS position.'
            : 'Location estimate found for ' + result.ip + '.'
        );
      } else {
        showStatus(
          'success',
          'Lookup completed for ' + result.ip + ', but the service did not return usable coordinates. No map point was added.'
        );
      }
    } catch (error) {
      const problem = describeError(error);
      setResultState('error', problem);
      clearMarker();
      resetCoordinates();
      resetMapToWorld();
      showStatus('error', problem.message);
    } finally {
      stopSearching();
    }
  }

  function validateInput(ip) {
    if (!ip) {
      return 'Enter an IP address, or use Find My IP to look up your public address.';
    }

    if (ip.length > 64) {
      return 'That address is too long. Check it and try again.';
    }

    if (/\s/.test(ip)) {
      return 'IP addresses cannot contain spaces. Check the address and try again.';
    }

    return '';
  }

  function startSearching(isSelf, ip) {
    setSearching(true);
    clearMarker();
    resetCoordinates();

    setResultState('loading', {
      message: isSelf
        ? 'Requesting the public IP address visible to ipinfo.io...'
        : 'Contacting ipinfo.io for ' + ip + '...'
    });

    setMapChip(isSelf ? 'Detecting IP...' : 'Locating...', 'is-loading');
    showStatus(
      'loading',
      isSelf
        ? 'Finding the public IP address your connection is using...'
        : 'Looking up ' + ip + '...'
    );
  }

  async function requestLookup(ip) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const url = API_BASE + (ip ? encodeURIComponent(ip) + '/json' : 'json');
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });

      if (response.status === 429) {
        throw createLookupError('rate-limit');
      }

      if (response.status === 404) {
        // ipinfo.io reports inputs that are not valid public IP addresses as a 404.
        throw createLookupError('api', { apiMessage: '404 not found' });
      }

      if (!response.ok) {
        throw createLookupError('http', { status: response.status });
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw createLookupError('malformed');
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw createLookupError('malformed');
      }

      if (data.bogon === true) {
        throw createLookupError('reserved');
      }

      if (!cleanString(data.ip)) {
        throw createLookupError('malformed');
      }

      return data;
    } catch (error) {
      if (timedOut || (error && error.name === 'AbortError')) {
        throw createLookupError('timeout');
      }

      if (error && error.code) {
        throw error;
      }

      throw createLookupError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  function createLookupError(code, details) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details || {});
    return error;
  }

  function describeError(error) {
    if (error.code === 'timeout') {
      return {
        title: 'Request timed out',
        message: 'The geolocation service did not respond within 12 seconds. Check your connection and try again.'
      };
    }

    if (error.code === 'rate-limit') {
      return {
        title: 'Service limit reached',
        message: 'The geolocation service has reached its request limit. Please wait a little while and try again.'
      };
    }

    if (error.code === 'reserved') {
      return {
        title: 'Not a public IP address',
        message: 'This address is reserved or private, so it has no public geolocation. Try a public IP address.'
      };
    }

    if (error.code === 'network') {
      return {
        title: 'Network problem',
        message: 'GeoPulse could not reach the geolocation service. Check your internet connection and try again.'
      };
    }

    if (error.code === 'api') {
      const apiMessage = cleanString(error.apiMessage);

      if (/invalid ip|404|not found/i.test(apiMessage)) {
        return {
          title: 'Invalid IP address',
          message: 'That is not a valid public IPv4 or IPv6 address. Check it and try again.'
        };
      }

      if (/reserved|private|bogon/i.test(apiMessage)) {
        return {
          title: 'Not a public IP address',
          message: 'This address is reserved or private, so it has no public geolocation. Try a public IP address.'
        };
      }

      return {
        title: 'Lookup failed',
        message: apiMessage
          ? 'The service could not complete this lookup: ' + apiMessage + '.'
          : 'The service could not complete this lookup. Check the address and try again.'
      };
    }

    if (error.code === 'malformed') {
      return {
        title: 'Unexpected response',
        message: 'The geolocation service returned data that GeoPulse could not read. Please try again.'
      };
    }

    if (error.code === 'http') {
      return {
        title: 'Service error',
        message: 'The geolocation service returned an unexpected response. Please try again later.'
      };
    }

    return {
      title: 'Lookup failed',
      message: 'Something went wrong while looking up this address. Please try again.'
    };
  }

  function normalizeResult(data, requestedIp) {
    const ip = cleanString(data.ip) || cleanString(requestedIp);
    const countryCode = cleanString(data.country).toUpperCase();
    const location = parseLocation(data.loc);
    const network = parseOrganization(data.org);

    return {
      ip: ip,
      type: ip ? (ip.includes(':') ? 'IPv6' : 'IPv4') : '',
      city: cleanString(data.city),
      region: cleanString(data.region),
      country: countryNameFromCode(countryCode),
      isp: network.name,
      org: network.name,
      asn: network.asn,
      timezoneId: cleanString(data.timezone),
      latitude: location.latitude,
      longitude: location.longitude,
      hasCoordinates: location.latitude !== null && location.longitude !== null,
      flagEmoji: flagEmojiFromCode(countryCode)
    };
  }

  function parseLocation(value) {
    const parts = cleanString(value).split(',');

    if (parts.length !== 2) {
      return { latitude: null, longitude: null };
    }

    return {
      latitude: parseCoordinate(parts[0].trim(), -90, 90),
      longitude: parseCoordinate(parts[1].trim(), -180, 180)
    };
  }

  function parseOrganization(value) {
    const text = cleanString(value);
    const match = /^AS(\d+)\s+(.+)$/i.exec(text);

    if (!match) {
      return { asn: null, name: text };
    }

    const asn = Number(match[1]);

    return {
      asn: Number.isInteger(asn) && asn > 0 ? asn : null,
      name: match[2].trim()
    };
  }

  function countryNameFromCode(code) {
    if (!/^[A-Z]{2}$/.test(code)) {
      return '';
    }

    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      return regionNames.of(code) || code;
    } catch (error) {
      return code;
    }
  }

  function flagEmojiFromCode(code) {
    if (!/^[A-Z]{2}$/.test(code)) {
      return '';
    }

    return String.fromCodePoint(
      code.charCodeAt(0) + 127397,
      code.charCodeAt(1) + 127397
    );
  }

  function renderResult(result) {
    setResultState('content');

    elements.resultIp.textContent = result.ip || 'Not available';
    elements.resultPlace.textContent = formatPlace(result) || 'Location not available';
    elements.resultFlag.textContent = result.flagEmoji || '\u{1F310}';
    elements.resultType.textContent = result.type || 'IP';

    elements.detailIp.textContent = valueOrFallback(result.ip);
    elements.detailVersion.textContent = valueOrFallback(result.type);
    elements.detailCity.textContent = valueOrFallback(result.city);
    elements.detailRegion.textContent = valueOrFallback(result.region);
    elements.detailCountry.textContent = valueOrFallback(result.country);
    elements.detailNetwork.textContent = valueOrFallback(formatNetwork(result));
    elements.detailTimezone.textContent = valueOrFallback(formatTimezone(result));
    elements.detailAsn.textContent = result.asn ? 'AS' + result.asn : 'Not available';

    const latitudeText = formatCoordinate(result.latitude, 'latitude');
    const longitudeText = formatCoordinate(result.longitude, 'longitude');

    elements.resultLat.textContent = latitudeText;
    elements.resultLng.textContent = longitudeText;
    elements.mapLat.textContent = latitudeText;
    elements.mapLng.textContent = longitudeText;
  }

  function setResultState(state, details) {
    elements.resultEmpty.hidden = state !== 'empty';
    elements.resultLoading.hidden = state !== 'loading';
    elements.resultError.hidden = state !== 'error';
    elements.resultContent.hidden = state !== 'content';

    if (state === 'loading') {
      elements.loadingText.textContent =
        (details && details.message) || 'Contacting the geolocation service...';
      setResultBadge('Searching', 'is-loading');
    } else if (state === 'error') {
      elements.resultErrorTitle.textContent =
        (details && details.title) || 'Lookup failed';
      elements.resultErrorMessage.textContent =
        (details && details.message) || 'The address could not be located. Please try again.';
      setResultBadge('Unavailable', 'is-error');
    } else if (state === 'content') {
      setResultBadge('Estimate', 'is-active');
    } else {
      setResultBadge('', '');
    }
  }

  function setResultBadge(text, modifier) {
    if (!text) {
      elements.resultBadge.hidden = true;
      elements.resultBadge.className = 'result-badge';
      elements.resultBadge.textContent = '';
      return;
    }

    elements.resultBadge.hidden = false;
    elements.resultBadge.className = 'result-badge ' + modifier;
    elements.resultBadge.textContent = text;
  }

  function setMapChip(text, modifier) {
    elements.mapChip.textContent = text;
    elements.mapChip.className = 'map-chip' + (modifier ? ' ' + modifier : '');
  }

  function setSearching(searching) {
    isSearching = searching;
    elements.input.disabled = searching;
    elements.searchButton.disabled = searching;
    elements.findButton.disabled = searching;
    elements.searchLabel.textContent = searching ? 'Searching...' : 'Search';
    elements.findLabel.textContent = searching ? 'Working...' : 'Find My IP';
    elements.form.setAttribute('aria-busy', searching ? 'true' : 'false');
  }

  function stopSearching() {
    setSearching(false);
  }

  function updateMap(result) {
    if (!map) {
      return;
    }

    clearMarker();

    if (!result.hasCoordinates) {
      resetMapToWorld();
      setMapChip('No coordinates');
      return;
    }

    const zoom = result.city ? 10 : result.region ? 7 : 5;
    const markerIcon = L.divIcon({
      className: 'gp-marker',
      html: '<span class="gp-marker-pin" aria-hidden="true"></span>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -17]
    });

    marker = L.marker([result.latitude, result.longitude], {
      icon: markerIcon,
      title: 'Estimated location for ' + result.ip,
      alt: 'Estimated location for ' + result.ip,
      keyboard: true
    });

    marker.bindPopup(buildPopup(result), {
      minWidth: 180,
      maxWidth: 260,
      autoPanPadding: [24, 24]
    });

    marker.addTo(map);
    map.setView([result.latitude, result.longitude], zoom, {
      animate: !reducedMotion.matches
    });
    marker.openPopup();
    setMapChip('Local estimate', 'is-active');
  }

  function buildPopup(result) {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-popup';

    const kicker = document.createElement('p');
    kicker.className = 'map-popup-kicker';
    kicker.textContent = 'Estimated network location';

    const title = document.createElement('h3');
    title.className = 'map-popup-title';
    title.textContent = result.city || result.region || result.country || 'Location estimate';

    const placeParts = [result.region, result.country].filter(function (part) {
      return part && part !== title.textContent;
    });

    const place = document.createElement('p');
    place.className = 'map-popup-place';
    place.textContent = placeParts.length ? placeParts.join(', ') : 'Place details may be incomplete';

    const ip = document.createElement('p');
    ip.className = 'map-popup-ip';
    ip.textContent = result.ip || 'IP address not available';

    const coords = document.createElement('p');
    coords.className = 'map-popup-coords';
    coords.textContent =
      formatCoordinate(result.latitude, 'latitude') +
      '  /  ' +
      formatCoordinate(result.longitude, 'longitude');

    const note = document.createElement('p');
    note.className = 'map-popup-note';
    note.textContent = 'Estimate only. This point may be an ISP, VPN, or network hub.';

    wrapper.append(kicker, title, place, ip, coords, note);
    return wrapper;
  }

  function clearMarker() {
    if (marker && map) {
      map.removeLayer(marker);
    }
    marker = null;
  }

  function resetMapToWorld() {
    if (map) {
      map.setView(WORLD_CENTER, WORLD_ZOOM, { animate: false });
    }
    setMapChip('World view');
  }

  function resetCoordinates() {
    elements.mapLat.textContent = '\u2014';
    elements.mapLng.textContent = '\u2014';
    elements.resultLat.textContent = '\u2014';
    elements.resultLng.textContent = '\u2014';
  }

  function formatPlace(value) {
    return [value.city, value.region, value.country].filter(Boolean).join(', ');
  }

  function formatNetwork(result) {
    if (result.isp && result.org && result.isp.toLowerCase() !== result.org.toLowerCase()) {
      return result.isp + ' (' + result.org + ')';
    }
    return result.isp || result.org;
  }

  function formatTimezone(result) {
    return result.timezoneId || '';
  }

  function formatCoordinate(value, axis) {
    if (value === null) {
      return 'Not available';
    }

    const direction = axis === 'latitude'
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');

    return Math.abs(value).toFixed(4) + '\u00B0 ' + direction;
  }

  function valueOrFallback(value) {
    return value || 'Not available';
  }

  function parseCoordinate(value, minimum, maximum) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const number = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      return null;
    }

    return number;
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function limitString(value, maximumLength) {
    return cleanString(value).slice(0, maximumLength);
  }

  function showStatus(type, message) {
    if (!message) {
      elements.status.hidden = true;
      elements.status.textContent = '';
      elements.status.className = 'status-banner';
      return;
    }

    elements.status.className = 'status-banner status-' + type;
    elements.status.textContent = message;
    elements.status.hidden = false;
  }

  function addHistory(result) {
    if (!result.ip) {
      return;
    }

    const key = result.ip.toLowerCase();
    const entry = {
      ip: result.ip,
      type: result.type,
      city: result.city,
      region: result.region,
      country: result.country,
      lat: result.latitude,
      lng: result.longitude
    };

    history = [entry].concat(
      history.filter(function (item) {
        return item.ip.toLowerCase() !== key;
      })
    ).slice(0, HISTORY_LIMIT);

    writeHistory();
    renderHistory();
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    elements.historyEmpty.hidden = history.length > 0;
    elements.clearHistory.disabled = history.length === 0;

    if (!history.length) {
      return;
    }

    const fragment = document.createDocumentFragment();

    history.forEach(function (entry) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const text = document.createElement('span');
      const ip = document.createElement('span');
      const place = document.createElement('span');
      const arrow = document.createElement('span');

      button.type = 'button';
      button.className = 'history-item';
      button.dataset.ip = entry.ip;
      button.setAttribute('aria-label', 'Look up ' + entry.ip + ' again');

      text.className = 'history-text';
      ip.className = 'history-ip';
      ip.textContent = entry.ip;

      place.className = 'history-place';
      place.textContent = [entry.city, entry.region, entry.country].filter(Boolean).join(', ') ||
        'Location not available';

      arrow.className = 'history-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '\u2192';

      text.append(ip, place);
      button.append(text, arrow);
      item.append(button);
      fragment.append(item);
    });

    elements.historyList.append(fragment);
  }

  function handleHistoryClick(event) {
    const button = event.target.closest('button[data-ip]');

    if (!button || isSearching) {
      return;
    }

    const ip = button.dataset.ip;

    if (ip) {
      elements.input.value = ip;
      lookupIp(ip, false);
    }
  }

  function clearHistory() {
    if (!history.length) {
      return;
    }

    history = [];
    writeHistory();
    renderHistory();
    showStatus('info', 'Recent search history cleared from this browser session.');
  }

  function readHistory() {
    try {
      const stored = sessionStorage.getItem(HISTORY_KEY);

      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
        sessionStorage.removeItem(HISTORY_KEY);
        return [];
      }

      const seen = new Set();

      return parsed
        .slice(0, 20)
        .map(sanitizeHistoryEntry)
        .filter(function (entry) {
          if (!entry) {
            return false;
          }

          const key = entry.ip.toLowerCase();

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        })
        .slice(0, HISTORY_LIMIT);
    } catch (error) {
      try {
        sessionStorage.removeItem(HISTORY_KEY);
      } catch (storageError) {
        /* Session storage may be blocked; history stays empty. */
      }
      return [];
    }
  }

  function sanitizeHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const ip = limitString(entry.ip, 64);

    if (!ip) {
      return null;
    }

    return {
      ip: ip,
      type: limitString(entry.type, 10),
      city: limitString(entry.city, 120),
      region: limitString(entry.region, 120),
      country: limitString(entry.country, 120),
      lat: parseCoordinate(entry.lat, -90, 90),
      lng: parseCoordinate(entry.lng, -180, 180)
    };
  }

  function writeHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      /* The lookup still works when session storage is unavailable. */
    }
  }

  function hydrateTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light';
    applyTheme(currentTheme, false);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
  }

  function applyTheme(theme, persist) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    elements.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    elements.themeToggle.setAttribute(
      'aria-label',
      isDark ? 'Switch to light theme' : 'Switch to dark theme'
    );
    elements.themeToggle.setAttribute(
      'title',
      isDark ? 'Switch to light theme' : 'Switch to dark theme'
    );

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', isDark ? '#081B2D' : '#102F50');
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
      } catch (error) {
        /* The theme still changes when local storage is blocked. */
      }
    }
  }
})();
