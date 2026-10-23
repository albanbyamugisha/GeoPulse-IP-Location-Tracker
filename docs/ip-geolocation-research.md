# Design and Implementation of a Web-Based Laptop Location Tracking System Using IP Geolocation

**Project:** GeoPulse — IP Location Tracker  
**Type:** Student GIS and web-development project  
**Research and test date:** 23 October 2026  
**Implementation:** Client-side HTML, CSS, vanilla JavaScript, Leaflet, and OpenStreetMap

## Abstract

This report examines how a web application can estimate the location of a laptop using its public IP address. The project implements GeoPulse, a browser-based dashboard that accepts an IPv4 or IPv6 address, requests geolocation data from an external API, normalizes the response, and plots the estimate on an interactive map. The report explains the data sources behind IP geolocation, compares four free API options, documents the selection of ipinfo.io, describes the implementation, and reports the results of 48 browser checks. The central finding is that IP geolocation can provide useful country, region, city, and network context, but it cannot provide GPS-level accuracy, exact addresses, or continuous movement tracking. The application therefore presents every result as a network estimate and reports missing data honestly instead of inventing coordinates.

## 1. Introduction

The assignment asks for a web-based laptop location tracking system using IP geolocation. That phrase needs careful interpretation. A browser cannot ask a website visitor for a laptop's GPS position without permission and suitable hardware, and an IP address does not identify a physical device. What an IP address can support is an estimate of the network through which a connection reaches the internet.

GeoPulse addresses that narrower and more defensible problem:

> Given a public IPv4 or IPv6 address, what geographic area and network does publicly available IP geolocation data associate with it, and how should that estimate be presented responsibly?

The application combines a geolocation API with Leaflet and OpenStreetMap. It also demonstrates the limits of the technique through explicit notices, error handling, and a refusal to plot fabricated coordinates.

## 2. Research question and scope

The project investigates three questions:

1. How is an IP address associated with a geographic location?
2. Which free geolocation API is suitable for a keyless, client-side student demonstration?
3. How accurately and responsibly can the resulting estimate be presented as a "laptop location"?

The scope is a public, unauthenticated web application with no backend. It supports public IPv4 and IPv6 addresses, lookup of the visitor's own public address, session-only history, and responsive light and dark themes. It does not attempt to identify a person, bypass VPNs, access device GPS, or track movement over time.

## 3. How IP geolocation works

### 3.1 IP addresses are network identifiers

An IP address identifies an interface on a network. It is assigned by an internet service provider (ISP), mobile carrier, hosting company, or another network operator. A laptop usually has a private address behind a router and shares the router's public address with other devices. The public address seen by a website may therefore belong to a home router, a university, a company, a mobile carrier, a VPN, or a cloud hosting provider.

### 3.2 Sources used by geolocation providers

IP geolocation is not a single measurement. Providers combine several kinds of evidence:

- **Registration data.** Regional internet registries record which organization holds blocks of addresses. This can indicate a country or region.
- **Routing data.** BGP announcements and Autonomous System (AS) information show which network operates an address block.
- **ISP and subscriber data.** Providers may use commercial data about where networks and service areas are located.
- **Network measurements.** Some providers use latency, traceroute, or other measurements to estimate the path and likely region of a connection.
- **Device and survey signals.** Some datasets include observations from apps or surveys, but this project does not access device location.

The result is a statistical estimate, not a measured point. Different providers can legitimately return different cities for the same address. The test lookups in this project illustrate that pattern: `8.8.8.8` was associated with Mountain View, California, at coordinates `38.0088, -122.1175`, while other services may place the same address elsewhere in the San Francisco Bay Area.

### 3.3 Why the estimate can be wrong

Common sources of error include:

- **NAT and shared addresses.** Many devices share one public address.
- **VPNs and proxies.** The visible address belongs to the exit server, not the user.
- **Mobile networks.** Carrier-grade NAT and centralized gateways can place users far from their actual location.
- **Corporate and campus networks.** Traffic may leave through a central egress point.
- **Anycast services.** A single address may be served from many locations; public DNS resolvers are a common example.
- **Dynamic assignment.** An address can be reassigned to a different customer or region.
- **Database lag.** Registration and geolocation records may be outdated.

For these reasons, the application never describes a marker as the laptop's exact position. The interface calls it an estimate and explains that it may represent an ISP, VPN, or network hub.

## 4. Requirements and design criteria

The implementation was guided by the following requirements:

| Area | Requirement |
| --- | --- |
| Platform | Browser-based, no backend or database |
| Stack | HTML5, CSS3, vanilla JavaScript, Leaflet, OpenStreetMap |
| Input | Public IPv4 and IPv6 addresses, plus visitor IP detection |
| Data | Place names, country, coordinates, ISP/organization, ASN, time zone |
| Map | One marker per successful lookup, OSM attribution, useful popup |
| Reliability | Handle invalid input, private addresses, rate limits, timeouts, network errors, and missing fields |
| Privacy | No API key in the repository, no application backend, no persistent search history |
| Accessibility | Labels, keyboard operation, live status announcements, visible focus, reduced-motion support |
| Responsiveness | No horizontal overflow at mobile, tablet, and desktop widths |
| Integrity | Never invent or silently substitute coordinates |

These criteria led to a client-only architecture with a thin provider adapter. The provider choice was treated as an engineering decision rather than an assumption.

## 5. API evaluation and selection

### 5.1 Method

Four no-key or free-tier options were reviewed against six criteria: HTTPS support, browser CORS support, IPv4 and IPv6 coverage, available fields, usage limits, and observed reliability from a local development origin. The review used official documentation and direct `curl` requests with an `Origin: http://127.0.0.1:8765` header, followed by browser tests in Chrome 154.

### 5.2 Comparison

| Service | Key required | CORS / HTTPS | IPv4 and IPv6 | Useful fields | Limits and observations | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| ipwho.is | No | Yes / Yes | Yes | City, region, country, coordinates, ISP, ASN, time zone, flag | Free endpoint: 1,000 requests per day per client IP; CORS limits are counted per domain. In testing, requests with Origin `http://127.0.0.1:8765` returned HTTP `429` with `retry-after` about 39,214 seconds, while `localhost` and other origins worked. | Not selected |
| ipinfo.io legacy | No | Yes / Yes | Yes | City, region, country code, `loc` coordinates, organization/ASN, time zone, hostname, `bogon` flag | Returned HTTP `200` from the `127.0.0.1` origin. IPinfo states the legacy service is actively maintained but recommends the newer token-based API for new integrations. | **Selected** |
| FreeIPAPI v1 | No | Yes / Yes | Yes | City, region, country, coordinates, time-zone list, ASN, organization, proxy flag | Free plan: 10 requests per 10 seconds and 60 per minute per visitor IP. Returned useful 200 responses from the same origin. The `timeZones` field can be a country-level list with many zones rather than one city-level zone. | Strong fallback, not selected |
| ipapi.co | No for limited use | Yes / Yes | Yes | City, region, country, coordinates, organization | Returned HTTP `429` during evaluation. | Not selected |

### 5.3 Why ipwho.is was rejected

ipwho.is is a capable service with a rich response and clear documentation. It was the initial choice. However, its documented CORS model counts requests per domain, and the test origin `127.0.0.1:8765` returned a persistent `429` while `localhost` worked. That makes a classroom demonstration dependent on the exact hostname used by the local server. Even though the issue could be avoided by forcing `localhost`, the failure is confusing for a user who starts a default server and sees a rate-limit message before making a single lookup. For a small student project, that is an unnecessary source of risk.

### 5.4 Why ipinfo.io was selected

ipinfo.io's keyless legacy endpoints satisfied the practical requirements:

- `https://ipinfo.io/json` returns the caller's public address and available details.
- `https://ipinfo.io/<address>/json` returns details for an explicit IPv4 or IPv6 address.
- The service supports HTTPS and browser CORS, including from `127.0.0.1`.
- The response provides city, region, ISO country code, coordinates as a `loc` string, organization and ASN, and an IANA time zone.
- The `bogon` flag allows private and reserved addresses to be handled explicitly.
- Invalid inputs return HTTP `404`.

The legacy endpoint does not expose a project-specific API key or require an account, which is appropriate for a no-secrets demonstration. It is not the recommended path for a new production integration: IPinfo advises new users to adopt the current token-based API, and the unauthenticated legacy service may have usage limits that are not documented as a fixed classroom quota. The application therefore keeps the provider behind a small adapter and handles `429` and other failures visibly. This is an honest trade-off between reproducibility and long-term production design.

### 5.5 Why a token-based API was not used

IPinfo Lite is free and does not impose request quota limits, but it requires an API token and returns only country and ASN data. Embedding a token in a public client-side project would expose it, and the assignment explicitly forbids committing secrets. A backend proxy would solve that problem but would add a server, deployment requirements, and a new attack surface beyond the project's scope. For this project, a keyless endpoint with clear limitations is preferable to a leaked token or an unnecessary backend.

## 6. Implementation

### 6.1 Architecture

The application is entirely client-side:

```text
Browser
  ├── src/index.html          page structure and accessible content
  ├── src/css/style.css       layout, themes, responsive states
  └── src/js/app.js
        ├── input validation and UI state
        ├── fetch() request to ipinfo.io
        ├── response normalization
        ├── Leaflet map and marker
        ├── session history
        └── localStorage theme preference

External services
  ├── ipinfo.io geolocation API
  ├── unpkg.com Leaflet 1.9.4 with Subresource Integrity
  └── tile.openstreetmap.org map tiles
```

There is no server-side application, database, account, or secret. The only stored data is the theme preference in `localStorage` and up to five successful lookups in `sessionStorage`.

### 6.2 Lookup flow

1. The user submits an address or selects **Find My IP**.
2. The app rejects empty, whitespace-containing, or overlong input before making a request.
3. A request is sent with an `AbortController` timeout of 12 seconds and `cache: 'no-store'`.
4. HTTP `429`, `404`, other non-2xx responses, invalid JSON, and network failures are mapped to distinct user-facing messages.
5. A `bogon: true` response becomes **Not a public IP address**; it is never plotted.
6. The response is normalized into a stable internal result object.
7. The result panel, map marker, popup, status banner, and session history are updated.
8. A private or invalid address clears the previous marker and result, so stale data cannot be mistaken for the new lookup.

### 6.3 Response normalization

The provider's legacy response is intentionally not used directly throughout the UI. A normalization layer prevents provider-specific fields from leaking into the render code:

| Provider field | Internal use |
| --- | --- |
| `ip` | Displayed address; used to infer `IPv4` or `IPv6` by the presence of `:` |
| `city`, `region` | Place details |
| `country` (ISO code) | Expanded with `Intl.DisplayNames`; converted to a flag emoji |
| `loc` (`"lat,lng"`) | Split and validated against latitude/longitude ranges |
| `org` (`"AS15169 Google LLC"`) | Parsed into ASN `15169` and organization `Google LLC` |
| `timezone` | IANA time-zone identifier |
| `bogon` | Treated as a private or reserved address, not a location |
| missing fields | Displayed as `Not available` |

Coordinates are only considered usable when both parsed values are finite and within range. If coordinates are missing, the app still shows the available place and network data, sets the map chip to **No coordinates**, and does not add a marker.

### 6.4 User interface and map

The interface uses a navy, blue, pale-blue, and green palette. The light theme is the default; the dark theme is applied through a `data-theme` attribute. The layout uses a two-column dashboard on desktop and stacked cards on smaller screens.

The map is initialized with a world view at zoom level 2. A successful lookup creates one custom `L.divIcon` marker, sets the view to the result coordinates, and opens a popup containing the estimated place, IP address, coordinates, and a reminder that the point may be an ISP, VPN, or network hub. Marker `title` and `alt` text are provided, and the popup is keyboard-reachable through Leaflet. OpenStreetMap attribution is always visible.

### 6.5 Accessibility and responsive design

The implementation includes:

- A skip link to the main content.
- A labelled search field and clearly named buttons.
- A `role="status"` live region with `aria-live="polite"` for lookup progress and errors.
- Visible focus states and keyboard-operable controls.
- `aria-pressed` and changing accessible labels on the theme toggle.
- A reduced-motion media query that disables smooth map movement.
- Responsive breakpoints tested at 1440 px, 820 px, and 390 px, with no horizontal overflow.

### 6.6 Privacy and security decisions

- No API key, token, or secret is stored in the repository.
- The app uses HTTPS for the API and map libraries.
- Leaflet is loaded with pinned versions and Subresource Integrity hashes.
- User input is inserted with `textContent` and DOM APIs, not HTML string interpolation.
- Search history and theme are stored only in browser storage.
- The external provider necessarily sees the queried address and the visitor's network request; the interface states this in the privacy section.

## 7. Accuracy, privacy, and ethics

### 7.1 What the result means

A successful result means that the provider associated the address with a geographic area. It does not mean that the provider measured the device's position. Country and region estimates are generally more stable than city estimates, but no level is guaranteed. A city-level marker should be read as "the network is probably in or near this area", not "the laptop is at this address".

The user interface avoids several common misrepresentations:

- It labels results as estimates.
- It shows missing values as `Not available`.
- It refuses to plot private or reserved addresses.
- It explains that VPNs, proxies, carriers, and organizations can move the apparent location.
- It does not offer a history that survives the browser session.

### 7.2 Privacy considerations

IP addresses can be personal data in some legal contexts because they can be linked to a subscriber. A responsible demonstration should therefore minimize collection and retention. GeoPulse does not store queries server-side, does not create accounts, and keeps only five recent successful lookups in session storage. The provider receives the lookup request and may log it under its own policy; users should consult the provider's privacy documentation before using the app with sensitive addresses.

The application is intended for learning, network diagnostics, and rough context. It should not be used to monitor a person, infer sensitive attributes, or make decisions about individuals. The interface explicitly warns against surveillance and claims about exact location.

## 8. Testing and results

The browser suite was executed against `http://127.0.0.1:8765/src/index.html` in headless Google Chrome 154 on Linux, using a Node.js 22 script that communicates over the Chrome DevTools Protocol. Live lookups used public DNS addresses, while failure modes were tested with controlled network interception.

The final run passed **48 of 48 checks**:

- Initial page title, map initialization, tiles, world view, empty state, and OSM attribution.
- Successful IPv4 lookup, displayed fields, coordinates, marker, popup, and history.
- Successful IPv6 lookup and correct type detection.
- Marker replacement without duplication.
- History uniqueness, ordering, persistence within the session, limit of five, and clearing.
- Theme switching, persistence, and dark-state screenshot.
- **Find My IP** returning the visitor's public address and filling the input.
- Invalid input and private/reserved address handling.
- Empty input handling.
- Network failure, HTTP 429, malformed/missing fields, missing coordinates, and a 12-second timeout.
- Recovery after error states.
- Mobile and tablet widths with no horizontal overflow.
- Corrupted session storage handled safely.
- Zero runtime exceptions and zero application console errors.

An earlier run against the initial ipwho.is implementation failed all live lookups because the `127.0.0.1` CORS origin had reached its rate limit. That evidence directly motivated the provider evaluation and the switch to ipinfo.io. The final results, including the full check list and screenshots, are in [`tests/test-results.md`](../tests/test-results.md).

### 8.1 Manual real-world observation

The automated checks were supplemented by a manual real-world observation. While physically located in Mbarara, Uganda, the author selected **Find My IP**. The application returned:

| Field | Observed value |
| --- | --- |
| Public IP address | `154.72.202.37` |
| City | Kampala |
| Region | Central Region |
| Country | Uganda |
| Coordinates | `0.3163° N, 32.5822° E` |

The reported city was therefore different from the laptop's physical location. This observation is separate from the 48 automated checks and is not a failed test. It does not indicate that the application malfunctioned. Instead, it illustrates the central limitation of IP geolocation: the provider returns an estimate based on network and database evidence, not a measurement of the device's position.

Several explanations are possible. The public address may be associated with an ISP gateway or routing point in Kampala rather than with the subscriber's city. Traffic may be routed through a regional network location, or the provider's geolocation database may record the address block at a regional or national hub. These are possible explanations only; this project did not obtain provider confirmation of the cause. The observation is consistent with the limitations discussed in Sections 3.3 and 7.1, and the returned values are reported here without alteration.

## 9. Discussion

The project demonstrates a complete, testable IP geolocation workflow: input, external API request, response normalization, map rendering, history, theme persistence, and robust failure handling. It also demonstrates why "laptop tracking" is an overstatement for IP-based systems. The application can say that a network address is associated with Mountain View, California, and with AS15169 Google LLC. It cannot say where a particular laptop is, who is using it, or where it moves next.

The provider comparison is a useful result in its own right. A service with richer fields is not automatically the best choice for a browser-only classroom project: CORS behaviour, per-domain limits, and the origin used by the local development server matter. The selected legacy endpoint is not a production recommendation, but it made the demonstration reproducible without exposing a token. The adapter structure makes a future migration to a token-based backend straightforward.

## 10. Limitations and future work

- IP geolocation remains approximate and provider-dependent.
- The free keyless endpoint may change or be rate-limited; production use should adopt an authenticated API and a server-side proxy.
- The current app does not display an accuracy radius because the selected endpoint does not provide one. A provider that returns a radius would allow a more honest uncertainty visualisation.
- A caching layer could reduce repeated requests, but it would introduce retention questions and was not necessary for the session-scoped demo.
- A fallback provider could improve resilience, but would require a second normalization path and a clear disclosure of which provider produced a result.
- The app could add a small "copy result" action and downloadable JSON, but these are usability enhancements rather than core requirements.
- A production deployment should add an explicit content security policy, privacy notice, and provider-specific terms review.

## 11. Conclusion

GeoPulse shows that public IP geolocation can be used in a browser to produce a useful, map-based estimate of the network associated with an address. It also shows the boundaries of that capability. The final implementation meets the assignment's technical constraints, uses no API key or backend, provides an accessible and responsive interface, handles failure states honestly, and passed 48 browser checks. Its most important design decision is not the map or the styling: it is the refusal to present an uncertain network estimate as a precise device location.

## References

1. IPinfo. *IPinfo API Overview — IPinfo Legacy API.* https://ipinfo.io/developers/ipinfo-api (accessed 23 October 2026).
2. IPinfo. *IPinfo Lite API.* https://ipinfo.io/developers/lite-api (accessed 23 October 2026).
3. IPinfo. *Pricing.* https://ipinfo.io/pricing (accessed 23 October 2026).
4. IPinfo. *Privacy Policy.* https://ipinfo.io/privacy-policy (accessed 23 October 2026).
5. IPWhois. *IP Lookup API and IP Geolocation Documentation.* https://ipwhois.io/documentation (accessed 23 October 2026).
6. FreeIPAPI. *API Reference — Introduction.* https://freeipapi.com/docs/api-reference/api-introduction (accessed 23 October 2026).
7. FreeIPAPI. *Rate Limit.* https://freeipapi.com/rate-limit (accessed 23 October 2026).
8. FreeIPAPI. *Terms of Use.* https://freeipapi.com/terms (accessed 23 October 2026).
9. ipapi. *IP Address Location API.* https://ipapi.co/api/ (accessed 23 October 2026).
10. Leaflet. *Leaflet 1.9.4 documentation.* https://leafletjs.com/ (accessed 23 October 2026).
11. OpenStreetMap Foundation. *Copyright and License.* https://www.openstreetmap.org/copyright (accessed 23 October 2026).
12. MDN Web Docs. *Fetch API.* https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API (accessed 23 October 2026).
13. MDN Web Docs. *Intl.DisplayNames.* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames (accessed 23 October 2026).
14. Rekhter, Y., Moskowitz, B., Karrenberg, D., de Groot, G. J., and Lear, E. *Address Allocation for Private Internets (RFC 1918).* https://www.rfc-editor.org/rfc/rfc1918 (accessed 23 October 2026).
15. Hinden, R. and Haberman, B. *Unique Local IPv6 Unicast Addresses (RFC 4193).* https://www.rfc-editor.org/rfc/rfc4193 (accessed 23 October 2026).
16. W3C. *Web Content Accessibility Guidelines (WCAG) 2.2.* https://www.w3.org/TR/WCAG22/ (accessed 23 October 2026).
