# Public health monitor

A small generic monitor for a public HTTPS JSON health endpoint. Contains no app source, private data or credentials.

Configure repository variables MONITOR_URL, EXPECTED_RESULTS, EXPECTED_CHANNELS and optionally REQUIRED_SETTINGS (a JSON object). The contract checks HTTP status, explicit health problems/warnings, actual successful result/source timestamps, completeness, clock anomalies and required runtime flags. Retries and network waits are bounded.

Run `node --test check.test.mjs` locally. The workflow requests checks every five minutes using standard public-repository runners. GitHub can delay/drop schedules or experience outages, so this is not a promise of continuous availability. Failure notifications follow the owner's GitHub notification preferences; this monitor never dispatches work to a private repository or needs an app token.
