# Public health monitor

A small generic monitor for a public HTTPS JSON health endpoint. Contains no app source, private data or credentials.

Configure repository variables MONITOR_URL, EXPECTED_RESULTS, EXPECTED_CHANNELS and optionally REQUIRED_SETTINGS (a JSON object). The contract checks HTTP status, explicit health problems/warnings, actual successful result/source timestamps, completeness, clock anomalies and required runtime flags. Retries and network waits are bounded.

Optionally set EXPIRY_DOMAIN to check, about hourly (and on every scheduled run), that the domain registration (via the registry's RDAP record) is at least 30 days from expiry and the TLS certificate at least 14 days.

Run `node --test check.test.mjs` locally. The monitored service dispatches the workflow about every ten minutes; an hourly schedule is a backup for when the service itself is down. GitHub can delay or drop schedules or have outages, so this is not a promise of continuous availability.

A failed run is the alert: GitHub emails the run's actor according to their notification settings. A problem must fail two checks in a row (about ten minutes apart) before it fails a run, so brief provider blips that heal on their own pass with a warning annotation. After that, the same failure (ignoring changing numbers) fails once per UTC day while it lasts, and later runs pass with a warning annotation; a different failure fails immediately. Alert markers live in the Actions cache and are cleared after a healthy run. The monitor never dispatches work to a private repository and holds no app token.
