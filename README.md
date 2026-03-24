# Roamer

A daily, timed route-discovery game. Players sort photos of iconic places into geographic order and watch the route animate across a map.

See [GOALS.md](GOALS.md) for current priorities and open questions.

---

## What's in this repo

```
frontend/       The game — HTML, CSS, and JS
backend/        Python/FastAPI — route data and answer validation
playground/     Kate's working versions of the frontend (not served)
docs/           Guides and design docs
```

---

## Running the game locally

You need both the backend and the frontend running at the same time. Open two Terminal windows (or tabs) and run one in each.

### Terminal 1 — Backend

```zsh
cd ~/work/roadtrip
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload
```

Leave this running. The API is now at `http://localhost:8000`.

### Terminal 2 — Frontend

The frontend is a static HTML file. The simplest way to serve it:

```zsh
cd ~/work/roadtrip/frontend
python3 -m http.server 3000
```

Then open `http://localhost:3000` in your browser.

> The frontend fetches route data from the backend on startup, so both need to be running for the game to work.

---

## Stopping the servers

In each Terminal window, press `Ctrl+C` to stop the server.

---

## First-time setup

### Python environment

From the repo root:

```zsh
cd ~/work/roadtrip
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

You only need to create the venv once. After that, just `source .venv/bin/activate` each time you open a new Terminal.

---

## Working on the frontend

The frontend lives in `frontend/`. The main files are:

| File | What it is |
|------|------------|
| `index.html` | The game shell and layout |
| `roamer-engine.js` | Game logic |
| `roamer.css` | Styles |
| `roamer-globe.js` | Globe animation |
| `roamer-lightbox.js` | Photo lightbox |

Edit files in `frontend/` and reload the browser to see changes. No build step needed.

The `playground/` folder contains Kate's working versions (`roamer-kate-v16.html` is the current reference). These aren't served — open them directly in a browser to preview.

---

## Running backend tests

```zsh
cd ~/work/roadtrip
source .venv/bin/activate
cd backend
pytest tests -v
```

See [backend/README.md](backend/README.md) for more detail on running specific tests and security checks.

---

## Git workflow

New to git? See [docs/git-guide-for-kate.md](docs/git-guide-for-kate.md) for a full walkthrough.

The short version:

```zsh
git checkout main
git pull
git checkout -b your-name/description-of-change
# ... make your changes ...
git add .
git commit -m "Short description of what you did"
git push origin your-name/description-of-change
```

Work on branches, not directly on `main`.
