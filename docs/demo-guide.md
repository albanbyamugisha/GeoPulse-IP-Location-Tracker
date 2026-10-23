# GeoPulse Demonstration Guide

This guide is for a 6–8 minute classroom demonstration of the IP Location Tracker. It covers setup, a suggested speaking script, expected observations, and what to do if the network or API fails.

## Before the demonstration

1. Confirm the repository is in `/home/alban-byamugisha/Public/IP-Location-Tracker` (or the equivalent location on the presentation machine).
2. Start a local web server from the repository root:

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

3. Open `http://127.0.0.1:8765/src/` in Chrome or Firefox.
4. Confirm that the world map and OpenStreetMap tiles load.
5. Confirm that `8.8.8.8` returns a result and a marker.
6. Keep the browser at a comfortable zoom level and close unrelated tabs.
7. Have `docs/ip-geolocation-research.md`, `tests/test-results.md`, and the screenshots folder available for questions.
8. If using a projector, test the colour contrast of both light and dark themes in advance.

The application requires an internet connection for the geolocation API, Leaflet, and map tiles. It does not require an API key or login.

## Suggested demonstration script

### 1. Introduce the problem (45–60 seconds)

Open with the distinction that makes the project credible:

> "The assignment title mentions laptop location tracking. I want to show what can actually be done from a browser using an IP address, and where the limits are. This is a network-location estimate, not GPS tracking."

Point out the empty world map and the search card. Explain that the user can enter a public IPv4 or IPv6 address or ask the app to detect their own public address.

### 2. Look up a well-known IPv4 address (90 seconds)

Enter:

```text
8.8.8.8
```

Select **Search**.

While the request is running, point out the loading state and status banner. When the result arrives, highlight:

- The address and its **IPv4** type.
- Mountain View, California, United States.
- Coordinates shown in the result panel, map footer, and popup.
- The ISP/organization and ASN: Google LLC, AS15169.
- The time zone: America/Los_Angeles.
- The single map marker and the popup explanation that the point is an estimate.

Suggested wording:

> "The provider associates this address with a Google network location in Mountain View. That does not mean a laptop is sitting at these coordinates. It means the public address belongs to a network that the provider places there."

### 3. Demonstrate IPv6 support (45–60 seconds)

Enter:

```text
2001:4860:4860::8888
```

Select **Search**.

Point out that the result type changes to **IPv6**, the marker is replaced rather than duplicated, and the history now contains two unique entries. Mention that IPv6 addresses are longer and use colons, which is why the app derives the version from the address itself.

### 4. Use Find My IP (45–60 seconds)

Select **Find My IP**.

Explain:

- The app asks ipinfo.io for the public address visible to the service.
- The result may belong to a router, university, company, VPN, proxy, or mobile carrier.
- The input is filled with the detected address so it can be reused.
- The status message explicitly says this is the address visible to the provider, not a GPS position.

If the detected address is in a different city from the classroom, use it as a teaching moment: shared NAT, carrier routing, or a VPN can move the apparent location.

### 5. Show the supporting interface (30–45 seconds)

- Point out the **Recent searches** card. Explain that it keeps at most five unique successful lookups and only for the current browser session.
- Use **Clear history** to show that the list and session storage are cleared.
- Toggle the theme button and note that the preference persists after a reload.
- If presenting on a laptop, use browser developer tools to switch to a mobile width (about 390 px) and show that the layout stacks without horizontal scrolling.
- Point out the OpenStreetMap attribution.

### 6. Demonstrate error handling (60–90 seconds)

Search for a private address:

```text
10.0.0.1
```

Expected result: **Not a public IP address**, with a short explanation and no marker. Point out that the previous marker disappears so stale data cannot be confused with the new lookup.

Then search for an invalid value:

```text
999.999.999.999
```

Expected result: **Invalid IP address**, with no marker.

Suggested wording:

> "The app validates what it can, and it reports what the service cannot resolve. It does not make up coordinates when data is missing."

If time allows, mention that the test suite also covers rate limits, network failures, timeouts, malformed responses, and missing coordinates.

### 7. Close with accuracy and privacy (45–60 seconds)

Use the **Accuracy and privacy** section on the page:

- Country and region estimates are often more reliable than city estimates.
- VPNs, proxies, mobile carriers, corporate networks, and anycast services can distort the result.
- The app cannot provide GPS accuracy or continuous tracking.
- Queries are sent over HTTPS to ipinfo.io; there is no application backend collecting them.
- History is session-only, and the theme is the only long-lived browser preference.
- The project is for learning and network context, not surveillance.

Final statement:

> "The result is useful context about a network, but it is not proof of a person's or laptop's exact location. The design choice is to make that uncertainty visible rather than hide it."

## Expected live results

Live provider data can change. The following values were observed during the final test run on 23 October 2026 and are examples, not guarantees:

| Input | Observed result |
| --- | --- |
| `8.8.8.8` | IPv4; Mountain View, California, United States; 38.0088, -122.1175; Google LLC; AS15169; America/Los_Angeles |
| `2001:4860:4860::8888` | IPv6; Mountain View, California, United States; 38.0088, -122.1175; Google LLC; AS15169; America/Los_Angeles |
| `1.1.1.1` | IPv4; Brisbane, Queensland, Australia; Cloudflare, Inc.; AS13335 |
| `10.0.0.1` | Not a public IP address; no marker |
| `999.999.999.999` | Invalid IP address; no marker |
| **Find My IP** | The public address visible to the provider at the time of the demo; the exact address depends on the network |

Do not promise the same city for every network or every day. If the audience asks why another website shows a different city, explain that providers use different data and update schedules.

## If the API is unavailable

Do not fabricate a result or manually edit the page to look successful. Instead:

1. Keep the error visible and explain the failure mode. The app distinguishes rate limits, network failures, timeouts, and service errors.
2. Retry once after a short wait if the problem appears transient.
3. Switch to a mobile hotspot or another network if the current network is blocking the request.
4. Use the screenshots in `screenshots/` and the recorded results in `tests/test-results.md` to show what a successful run looks like.
5. Explain that production systems need an authenticated API, server-side proxy, caching, monitoring, and a fallback provider.

If the map tiles fail but the API works, the result panel still displays the data. If Leaflet fails to load, the page shows a map-unavailable message rather than a broken map area.

## Likely questions and short answers

**Is this tracking a specific laptop?**  
No. It locates the public IP address it is given. Without that address, it cannot identify a device.

**Why is the marker not at the user's exact location?**  
IP geolocation estimates a network location. It does not read GPS, and NAT, VPNs, carriers, and corporate gateways can move the apparent location.

**Why does the result differ from another IP lookup site?**  
Different providers use different registration, routing, and measurement data. City-level estimates are not standardized.

**Does it work with IPv6?**  
Yes. The app accepts IPv6 literals and displays them as IPv6 results.

**Does it need an API key?**  
No. The demonstration uses a keyless legacy endpoint. A production version should use a token-based API behind a server-side proxy so the token is not exposed.

**Where is the history stored?**  
In the browser's `sessionStorage`, limited to the last five unique successful lookups. The theme preference is in `localStorage`.

**Can it track movement over time?**  
No. It performs one lookup at a time and keeps no persistent location timeline.

## Time budget

| Segment | Time |
| --- | --- |
| Introduction and problem framing | 1 minute |
| IPv4 lookup and map walkthrough | 2 minutes |
| IPv6 and Find My IP | 1.5 minutes |
| Interface, history, theme, mobile layout | 1 minute |
| Error handling | 1 minute |
| Accuracy, privacy, and conclusion | 1 minute |
| Questions | 1–2 minutes |

## After the demonstration

Stop the local server with `Ctrl+C`. If headless Chrome was used for testing, close it as well. No database or external state needs to be cleaned up; session history ends when the browser session ends.
