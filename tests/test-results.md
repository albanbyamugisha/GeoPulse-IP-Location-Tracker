# GeoPulse Browser Test Results

**Test date:** 23 October 2026<br>
**Final run:** 23 October 2026 at 11:42:52 UTC<br>
**Application URL:** `http://127.0.0.1:8765/src/index.html`<br>
**Result:** **48 passed, 0 failed**

## Summary

The final browser suite passed all 48 checks. It exercised live IPv4 and IPv6 lookups, the visitor-IP lookup, map rendering, history, theme persistence, responsive layout, invalid and private addresses, and controlled failure modes. The run produced no runtime exceptions and no application console errors.

The checks were run in headless Google Chrome 154 on Linux through the Chrome DevTools Protocol. The test driver is [`tests/browser-test.js`](browser-test.js). Live requests went to ipinfo.io; rate-limit, timeout, missing-field, and network-failure cases were simulated with Chrome network interception so that failure handling could be tested deterministically.

The generated machine-readable summary is written to `tests/latest-test-summary.json` when the suite runs. It is ignored by Git.

## Environment

| Item | Value |
| --- | --- |
| Operating system | Linux |
| Browser | Google Chrome 154 (headless) |
| Browser automation | Chrome DevTools Protocol over port 9222 |
| Test driver | Node.js 22.22.1 using the built-in `WebSocket` |
| Web server | Python 3 `http.server` on `127.0.0.1:8765` |
| Viewports | 1440 × 1100 desktop, 820 × 1000 tablet, 390 × 844 mobile |
| Live data provider | ipinfo.io legacy keyless endpoint |
| Map library | Leaflet 1.9.4 from unpkg |
| Map tiles | OpenStreetMap standard tiles |

## Test method

1. Start the app with `python3 -m http.server 8765 --bind 127.0.0.1`.
2. Start headless Chrome with `--remote-debugging-port=9222`.
3. Run `node tests/browser-test.js`.
4. The script navigates to the app, enables runtime and network instrumentation, and checks the DOM after each interaction.
5. Live public addresses are used for successful lookups:
   - `8.8.8.8`
   - `2001:4860:4860::8888`
   - `1.1.1.1`
   - `9.9.9.9`
   - `4.2.2.2`
   - `8.8.4.4`
   - `208.67.222.222`
6. Failure modes are injected without altering the application source:
   - HTTP `429` fulfilled by the DevTools protocol.
   - A blocked request to `ipinfo.io` for a network failure.
   - An intercepted request paused for longer than the app's 12-second timeout.
   - A synthetic response with missing city, region, and coordinates.
7. `10.0.0.1`, `999.999.999.999`, and an empty submission check local validation and provider errors.

## Results

| # | Check | Status | Observed result |
| --- | --- | --- | --- |
| 1 | Application title | PASS | GeoPulse — IP Location Tracker |
| 2 | Initial world map rendered | PASS | leaflet=true, tiles=12 |
| 3 | Initial map chip | PASS | World view |
| 4 | Initial result state | PASS | contentHidden=true, errorHidden=true |
| 5 | OpenStreetMap attribution visible | PASS | Leaflet \| © OpenStreetMap contributors |
| 6 | IPv4 lookup succeeds | PASS | Location estimate found for 8.8.8.8. |
| 7 | IPv4 address displayed | PASS | 8.8.8.8 |
| 8 | IPv4 type displayed | PASS | IPv4 |
| 9 | Location details displayed | PASS | Mountain View / United States |
| 10 | Coordinates displayed | PASS | 38.0088° N, 122.1175° W |
| 11 | Map marker and popup update | PASS | markers=1, popup contains address, place, and coordinates |
| 12 | Map view chip updates | PASS | Local estimate |
| 13 | History records first lookup | PASS | `["8.8.8.8"]` |
| 14 | IPv6 lookup succeeds | PASS | Location estimate found for 2001:4860:4860::8888. |
| 15 | IPv6 address displayed | PASS | 2001:4860:4860::8888 |
| 16 | IPv6 type displayed | PASS | IPv6 |
| 17 | Marker replaced, not duplicated | PASS | markers=1 |
| 18 | History keeps unique newest first | PASS | `["2001:4860:4860::8888","8.8.8.8"]` |
| 19 | History entry performs lookup | PASS | 8.8.8.8 / successful result |
| 20 | History entry not duplicated | PASS | `["8.8.8.8","2001:4860:4860::8888"]` |
| 21 | Dark theme applies | PASS | dark, pressed=true |
| 22 | Theme preference stored | PASS | localStorage=dark |
| 23 | Theme persists after reload | PASS | dark, pressed=true |
| 24 | History persists within session | PASS | 2 entries |
| 25 | Find My IP returns a public address | PASS | Public address detected |
| 26 | Find My IP displays a result | PASS | Successful result with provider disclosure |
| 27 | Find My IP fills input | PASS | Input matches detected address |
| 28 | Invalid input handled | PASS | Invalid IP address error |
| 29 | Failed lookup hides old result | PASS | contentHidden=true, markers=0 |
| 30 | Private IP handled | PASS | Not a public IP address error |
| 31 | Private IP lookup hides old result | PASS | contentHidden=true, markers=0 |
| 32 | Empty input handled | PASS | Helpful empty-input message |
| 33 | History capped at five unique entries | PASS | `["208.67.222.222","8.8.4.4","4.2.2.2","9.9.9.9","1.1.1.1"]` |
| 34 | Newest history entry first | PASS | 208.67.222.222 |
| 35 | Clear History works | PASS | count=0, disabled=true |
| 36 | Clear History clears session storage | PASS | `[]` |
| 37 | Network failure handled | PASS | Network problem error |
| 38 | Rate limit handled | PASS | Service limit reached error |
| 39 | Missing fields show Not available | PASS | Not available / Not available / United States |
| 40 | Missing coordinates handled safely | PASS | No coordinates, markers=0 |
| 41 | Missing coordinates still complete lookup | PASS | Success status with coordinate warning |
| 42 | Request timeout handled | PASS | Request timed out after 12,034 ms |
| 43 | Lookup works after errors | PASS | 8.8.8.8, markers=1 |
| 44 | Mobile layout has no horizontal overflow | PASS | scrollWidth=390, clientWidth=390 |
| 45 | Tablet layout has no horizontal overflow | PASS | scrollWidth=820, clientWidth=820 |
| 46 | Corrupted history handled safely | PASS | history=0, app usable |
| 47 | No runtime exceptions | PASS | `[]` |
| 48 | No application console errors | PASS | `[]` |

## Manual real-world observation

This section records a manual observation. It is separate from the automated checks above and is **not counted** in the 48 passed checks.

During a manual test, the tester was physically in Mbarara, Uganda, and selected **Find My IP**. The application returned:

| Field | Observed value |
| --- | --- |
| Public IP address | `154.72.202.37` |
| City | Kampala |
| Region | Central Region |
| Country | Uganda |
| Coordinates | `0.3163° N, 32.5822° E` |
| Physical location during the test | Mbarara, Uganda |

The returned city was Kampala, so the estimate did not match the tester's physical location. This does not mean the application malfunctioned: IP geolocation estimates the network location associated with an address, not the GPS position of the device.

Possible explanations include the ISP's network gateway, traffic routed through a regional point, or the geolocation database associating the address block with Kampala. These possibilities were not confirmed with the provider, and no returned value was altered.

Automated total: **48 passed, 0 failed**, unchanged.

## Evidence

The test run regenerated these screenshots:

- [`screenshots/hero-light.png`](../screenshots/hero-light.png) — initial page and world map.
- [`screenshots/dashboard-light.png`](../screenshots/dashboard-light.png) — successful IPv4 result, marker, details, and history.
- [`screenshots/dashboard-dark.png`](../screenshots/dashboard-dark.png) — dark theme after a successful result.
- [`screenshots/error-state.png`](../screenshots/error-state.png) — invalid-address error with no marker.
- [`screenshots/mobile-light.png`](../screenshots/mobile-light.png) — mobile layout at 390 px width.

## Provider migration evidence

An earlier build used ipwho.is. Its initial browser run passed the static-page checks but failed all live lookups. Direct requests with `Origin: http://127.0.0.1:8765` returned:

```text
HTTP/2 429
retry-after: 39214
```

The same service responded successfully from `http://localhost:8765` and from other origins. ipwho.is documents a free limit of 1,000 requests per day per client IP and counts CORS requests per domain. The exact `127.0.0.1` origin bucket was therefore unsuitable for a reliable local demonstration.

ipinfo.io returned HTTP `200` for IPv4, IPv6, and visitor-IP lookups from the same `127.0.0.1` origin, with CORS enabled and no key. The application was migrated to ipinfo.io, its response normalization was updated, and the suite was rerun. The final 48-check result above is from that run.

The provider evaluation compared ipwho.is, ipinfo.io, FreeIPAPI, and ipapi.co. It is documented in [`docs/ip-geolocation-research.md`](../docs/ip-geolocation-research.md).

## What was not tested

- Browsers other than Chrome, such as Firefox and Safari.
- Screen readers and full assistive-technology audits. The markup includes labels, live regions, focus styles, and ARIA state, but this run did not use a screen reader.
- Automated visual regression against a baseline. The screenshots were regenerated and kept as evidence.
- A production deployment with a custom domain, CSP, CDN, or reverse proxy.
- Provider outages beyond the simulated network failure and HTTP 429 cases.

## Reproduce the run

```bash
# Terminal 1
python3 -m http.server 8765 --bind 127.0.0.1

# Terminal 2
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9222 --user-data-dir=/tmp/geopulse-chrome \
  --window-size=1440,1100 about:blank

# Terminal 3
node tests/browser-test.js
```

Live results depend on the provider and the current network. A failure caused by a provider outage or rate limit does not by itself indicate a regression in the application; inspect the displayed error state and retry later.
