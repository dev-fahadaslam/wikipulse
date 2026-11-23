# End-to-end test

One Playwright (TypeScript) test that drives the real dashboard in a browser:
connects, waits for the live feed to populate, filters by wiki, and checks
the AI pulse summary eventually renders.

## Why Playwright instead of Selenium/C#

The brief's preference is Selenium with C#. We used Playwright/TypeScript
instead because the rest of this project (frontend, and this test) already
lives in a Node/TypeScript toolchain -- adding a .NET + Selenium project
would mean a second language runtime and package manager for a single test,
which isn't a good trade for the ~6 hour budget. Playwright also auto-waits
for elements (no manual sleeps/polling) and ships its own browser binaries,
so `npx playwright install` is the only extra setup step. The test itself
is tool-agnostic -- the same scenario would translate directly to Selenium
+ C# if that's the stack the team standardizes on.

## Running it

```bash
cd e2e
npm install
npx playwright install chromium

# In separate terminals:
#   backend:  EVENT_SOURCE=sample uvicorn app.main:app --reload   (from ../backend)
#   frontend: npm run dev                                          (from ../frontend)

npm test
```

`EVENT_SOURCE=sample` is important here: it replays `sample_events.jsonl` on
a loop so the live feed fills up deterministically, instead of depending on
whatever happens to be trending on Wikipedia at test time.
