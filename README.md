# JID Globe

A web app for JOTA-JOTI that turns the JID codes your Scouts collect into pins on a shared 3D
globe. Someone types a code on one screen and it lands on every other screen, live.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Runs on** | Docker (one container, one SQLite file) |
| **Image** | `ghcr.io/themrpuffin/jid-globe` |
| **Built with** | Node.js 24, Fastify, SQLite, globe.gl |
| **Checks** | [![Checks](https://github.com/TheMrPuffin/jid-globe/actions/workflows/checks.yml/badge.svg)](https://github.com/TheMrPuffin/jid-globe/actions/workflows/checks.yml) |
| **Licence** | [MIT](LICENSE) |

> No cloud accounts and no sign-ups. Once the image is on the machine it needs no internet at
> all; only the optional *Streets* and *Satellite* map views load anything from outside.

## What it does

**Every JID becomes a pin.** Type a code and it is decoded as you type: region, country, number
and suffix. The globe flies to the country, and you can narrow the pin down to a city or town,
or tap an exact spot.

**It catches mistakes.** The first digit has to suit the country. The UK is in region 5, so
`1GB123TXA` is refused with a suggestion of what was probably meant. Region 7, for special
stations, is accepted with any country. The server makes the same check as the page.

**Everyone sees it happen.** A new pin is announced on every device: rings pulse from it, a
"NEW" label and a banner show the JID, and its row flashes in the logbook. If several arrive
together they are shown one after another. A globe left spinning on a projector flies to each
new pin for a few seconds, then carries on turning.

**Repeat contacts are counted, not duplicated.** A JID keeps the place it was first given.
Enter it again and it is counted again: the logbook shows one row per JID with a count such as
**×3**, and when it was first and last seen.

**Pins in the same place stack.** JIDs that share a town share one pin, drawn taller with a
number on it. Tap it to highlight all of its JIDs in the logbook.

**Three ways to look at the world.** *Basic* is built in and works offline. *Streets*
(OpenStreetMap) and *Satellite* (Esri World Imagery) show the real place down to street level,
on any device that has its own internet connection. Town names appear as you zoom in, biggest
first.

**The logbook filters the globe.** Search by JID, place, region, note or station and only the
matching JIDs keep their pins.

**Stats, live.** JIDs per region and per country, the country with the most, the most-seen
JIDs and how many each station has added.

**You know which machine added what, without anyone giving a name.** Label a machine `PC01` in
its address and every JID it saves is tagged with that.

## Getting started

### Prerequisites

- **Docker** installed and running ([Docker Desktop](https://www.docker.com/products/docker-desktop/),
  Rancher Desktop or plain Docker Engine)

### Quick start (Docker)

```sh
docker run -d \
  --name jid-globe \
  -e ADMIN_PASSCODE="pick-your-own" \
  -p 8080:8080 \
  -v jid-globe-data:/data \
  --restart unless-stopped \
  ghcr.io/themrpuffin/jid-globe:latest
```

Then open <http://localhost:8080>.

This does the following:

- Runs the container in the background (`-d`)
- Sets the passcode that unlocks moving and deleting pins
- Serves the app on port 8080 of the host
- Keeps the pins in a Docker volume called `jid-globe-data`, so they survive the container
  being stopped, removed or updated
- Starts it again by itself after a reboot

Stop it with `docker stop jid-globe` and start it again with `docker start jid-globe`.

### Quick start (Docker Compose)

If you prefer a file to a long command, save this as `docker-compose.yml`:

```yaml
services:
  jid-globe:
    image: ghcr.io/themrpuffin/jid-globe:latest
    environment:
      ADMIN_PASSCODE: pick-your-own
    ports:
      - "8080:8080"
    volumes:
      - jid-globe-data:/data
    restart: unless-stopped

volumes:
  jid-globe-data:
```

```sh
docker compose up -d
```

### Updating

```sh
docker pull ghcr.io/themrpuffin/jid-globe:latest
```

Then remove the container (`docker rm -f jid-globe`) and run the quick start command again. The
pins are in the volume, not the container, so they are kept. To stay on one version instead of
following the newest, replace `latest` with a version such as `1.0.0`.

### Where to run it

It is an ordinary web server on one port, so it works anywhere you can reach that port:

- **One machine:** open <http://localhost:8080> and that's it.
- **A local network:** other devices open `http://<host address>:8080`. The host's firewall has
  to allow the port, and some guest networks stop devices talking to each other.
- **The internet:** put it behind a reverse proxy that adds HTTPS. The app has no encryption
  of its own, and its passcodes only keep casual visitors out, so turn on `SUBMIT_LOCK` too.

## Pages

| Address | What it is |
|---|---|
| `/` | The globe, with the form, the logbook and a *Quick stats* pop-up |
| `/stats` | The stats as a dashboard, with no globe. Good for a second screen, and light enough for an old laptop |
| `/logbook` | A live feed of entries, newest first, for a screen on the wall. Shows the latest 150; *Show more* adds 150 at a time |
| `/submit` | Just the form for entering JIDs. Quick on a phone |

Every page updates live.

## Configuration

### Settings

These are environment variables: pass each with `-e NAME=value` on `docker run`, or list them
under `environment:` in a compose file. Recreate the container after changing one.

| Setting | Default | What it does |
|---|---|---|
| `ADMIN_PASSCODE` | *(none)* | Unlocks moving and deleting pins. Pick something only the leaders know |
| `SUBMIT_LOCK` | `off` | Set to `on` to make each device unlock before it can add JIDs |
| `SUBMIT_PASSCODE` | *(none)* | The passcode for that unlock |

To serve the app on a different port, change the first number in `-p 8080:8080`, for example
`-p 9000:8080`.

### Address options

These go on the end of a page's address and apply to that browser only.

| Option | Example | What it does |
|---|---|---|
| `kiosk` | `/submit?kiosk` | Hides the links to the other pages |
| `station=NAME` | `/submit?station=PC01` | Tags every JID saved from this page with `NAME` (up to 30 characters) |
| `from=NAME` | `/logbook?from=PC01` | Logbook page: only that station's entries |
| `region=N` | `/logbook?region=5` | Logbook page: only that region's entries |
| `country=CC` | `/logbook?country=GB` | Logbook page: only that country's entries |

They combine: `/submit?kiosk&station=PC01`.

## Running an event

### Stations

Give each machine a label with `station=` and its JIDs are tagged with it. The label shows on
the submit page, in the logbook ("First seen Sat 23:26 by PC01"), in the new-JID banner, in the
stats, and in the `added_by` column of the CSV.

Rather than typing the address, press **Set station** at the bottom of the globe or submit page
(it is there whenever no station is set), type the name, and the page reopens with it. The
links to the other pages carry the station along.

To see everything one station has added, open the **Logbook** page and choose it from the
picker, or press its name on any row or in the stats.

Entries saved with no label are shown as **Unknown**. In the logbook and stats that only
appears once at least one entry has a real label; the CSV always says Unknown.

### Kiosk mode

`?kiosk` removes the links between pages, so a shared machine stays on the page you opened.
Every page also has a **Kiosk mode** link at the bottom that does the same. Set the station
first. To leave kiosk mode, remove `kiosk` from the address.

> This only hides the links. Someone can still type another address, so on a machine you want
> locked down, also run the browser in its own full-screen kiosk mode, which hides the address
> bar (Chrome or Edge: start it with `--kiosk` followed by the address).

### Locking who can add JIDs

By default anyone who can open the page can add a JID. With `SUBMIT_LOCK=on`, each device
shows "Adding JIDs is locked on this device" in place of the form until someone presses
**Unlock with passcode**. It stays unlocked across tabs and reloads, and locks again when the
browser is closed. Looking at the globe and the stats stays open to everyone.

> This keeps casual visitors out. It is not strong security: nothing here is encrypted.

### Admin

**Move** and **Delete** are hidden until you press **Admin** above the logbook on the globe
page and enter `ADMIN_PASSCODE`. The device then stays unlocked across tabs and reloads until
you press **Lock admin** or close the browser. An admin device can always add JIDs, even when
submissions are locked.

- **Move** changes the place of a JID: choose a new city or spot, then *Move pin*.
- **Delete 1** removes the most recent entry of that JID.

### On the globe

| Control | Where | What it does |
|---|---|---|
| **Find a place** | Top of the side panel | Flies the globe to a city, town or country. It doesn't add a pin |
| **Basic / Streets / Satellite** | Top right | Switches the map. With no internet the app says so and stays on *Basic* |
| **Borders** | Under the map switch, on *Satellite* | Draws country borders over the photo |
| **Counts** | Under the map switch | Shows or hides the numbers on stacked pins |
| **Spin / Pause** | Top left | The globe spins until you touch it; *Spin* zooms out and sets it turning again |
| **Following new pins** | Beside *Pause*, while spinning | Whether a spinning globe flies to each new pin |
| **Quick stats** | Top of the side panel | The stats in a pop-up |
| Arrow tab | Edge of the side panel | Hides the panel so the globe fills the screen |
| **Download CSV** | Bottom of the side panel | Every entry as a spreadsheet, one line per entry |

### How many machines?

Tested with 16 machines connected and all submitting at once (400 entries in one second, every
one saved and every screen updated), and with 40 connected. One small container handles it
easily. There is a safety limit of 600 new entries a minute across all devices, far more than
people can type; it is `MAX_NEW_ENTRIES_PER_MINUTE` in `api/src/app.ts`.

## Backup and reset

The easy backup is **Download CSV** in the app. For a full copy of the database, with the app
running:

```sh
docker exec jid-globe sqlite3 /data/jid-globe.db ".backup /data/backup.db"
```

```sh
docker cp jid-globe:/data/backup.db ./backup.db
```

On Windows, run these in PowerShell: Git Bash rewrites the `/data/...` paths and the command
fails.

To delete **all** pins and start fresh, remove the container and its volume:

```sh
docker rm -f jid-globe
```

```sh
docker volume rm jid-globe-data
```

> ⚠️ This cannot be undone. Back up first.

## Development

You need [Node.js 24](https://nodejs.org/) to work on the code, and Docker to build the image.

### Running from source

```sh
git clone https://github.com/TheMrPuffin/jid-globe.git
```

```sh
cd jid-globe
```

```sh
npm install
```

```sh
npm run dev
```

This starts the API on port 8080, restarting when you edit a file, and the Vite dev server.
Open <http://localhost:3000>. Pins added in dev mode go into `./data/jid-globe.db`, separate
from any Docker one. Stop a running container first so the two don't fight over port 8080.

### Building the image yourself

```sh
cp .env.example .env
```

```sh
docker compose up --build -d
```

The `docker-compose.yml` in the repository builds the image from the source in front of you,
rather than pulling the published one, and reads its settings (including `PORT`) from `.env`.
The first build takes a few minutes. Its container and volume have different names from the
quick start ones, so use `make backup` and `docker compose down -v` for backup and reset.

### Make shortcuts

Run `make` on its own to list them. On Windows, `winget install ezwinports.make` installs it.

| Command | What it does |
|---|---|
| `make up` | Build the image from source and start the app |
| `make down` | Stop the app (pins are kept) |
| `make restart` | Restart without rebuilding |
| `make logs` | Follow the app's log |
| `make status` | Show whether it is running and healthy |
| `make backup` | Copy the database to `backup.db` |
| `make image` | Build the Docker image without starting it |
| `make scan` | Look for known security problems in the image |
| `make install` | Install the packages |
| `make dev` | Run with live reload |
| `make test` | Run all the tests |
| `make build` | Build the web pages and the server without Docker |

### Automatic checks

Every pull request, and every change to `main`, is checked by
[checks.yml](.github/workflows/checks.yml). It runs `make test` and `make build`, then
`make image`, then starts the app from that image and makes sure it answers.

### Staying up to date

Every version in this project is pinned exactly, so nothing changes by surprise.
[Dependabot](.github/dependabot.yml) is what moves them on: each Monday it opens pull requests
for newer npm packages, a newer Node.js image and newer GitHub actions. Small updates arrive
grouped together, and a new major version gets a pull request of its own. The checks run on
each, so a green tick means it is safe to merge. Security fixes arrive as soon as they exist.

The [security scan](.github/workflows/scan.yml) runs every Monday too. It builds the image
from scratch and checks it, and the published image, against the public lists of known
security problems. It fails, and GitHub emails you, when a problem rated High or Critical has a
fix available. If only the published image fails, the fix is already in the code and it is time
for a release. `make scan` runs the same check on your own machine.

Updates only reach people running the app once a new version is released.

### Releasing

A release is a version tag on `main`. Versions follow `MAJOR.MINOR.PATCH`: a new major means
whoever runs the app has to do something by hand, a minor adds features, a patch only fixes.

1. Set the new number, and get that change into `main` through a pull request:

   ```sh
   make version V=1.1.0
   ```

2. Tag the commit on `main` and push the tag:

   ```sh
   git tag v1.1.0
   ```

   ```sh
   git push origin v1.1.0
   ```

[release.yml](.github/workflows/release.yml) does the rest: it runs the checks again, builds the
image for PCs and for ARM machines, publishes it as `ghcr.io/themrpuffin/jid-globe` under
`1.1.0`, `1.1` and `latest`, and creates the GitHub Release with notes. It refuses a tag that
is not on `main` or that disagrees with the `package.json` files.

The version and the build (the short git commit the image was made from) are shown in the
**About** pop-up, printed in the log when the app starts, and reported by `/api/health`. An
image you build yourself says "dev build".

Running it by hand from the Actions page is a rehearsal: it builds everything and publishes
nothing.

### Architecture

One Node.js server does everything: it serves the built web pages, answers the `/api` routes,
and pushes live updates to every open page over Server-Sent Events. Pins live in one SQLite
file on a Docker volume. Town search uses a second, read-only SQLite file that is built from
the GeoNames list when the image is built.

The web side is plain TypeScript with no framework, one HTML file per page.

| Path | What it is |
|---|---|
| `api/src/server.ts` | Starts the server |
| `api/src/app.ts` | All the `/api` routes |
| `api/src/pins.ts` | Checking and saving pins |
| `api/src/cities.ts` | City search, and building `cities.db` |
| `api/src/events.ts` | Live updates (Server-Sent Events) |
| `api/migrations/` | Database table definitions, applied in order at startup |
| `api/data/cities5000.txt` | GeoNames city list (the source for `cities.db`) |
| `web/index.html`, `stats.html`, `logbook.html`, `submit.html` | One file per page; each loads its own script from `web/src` |
| `web/src/stats-page.ts`, `stats-render.ts`, `summary.ts` | The stats dashboard, drawing the stats, and working them out |
| `web/src/jid.ts` | Decoding a JID |
| `web/src/globe.ts` | The 3D globe and its pins |
| `web/src/map-layer.ts` | Drawing the countries and borders on the globe |
| `web/src/city-labels.ts` | Town names that appear when you zoom in |
| `web/src/form.ts` | The "Add a JID" form |
| `web/src/logbook.ts` | The logbook list, move and delete |
| `Dockerfile`, `docker-compose.yml` | How the container is built and run |

The country-to-region table is `scout-regions.ts`, which exists in both `web/src` and
`api/src`. If it ever needs correcting, change both copies; a test fails if they differ.

### Adding a page

1. Create `web/yourpage.html` (copy `stats.html` as a starting point) and a script for it in
   `web/src`.
2. Add its name to the `PAGES` list in `web/vite.config.ts`.
3. Rebuild. It is then served at `/yourpage`.

### Even smaller places

The app ships with every town of 5,000 or more people. For villages too, download
`cities1000.zip` from <https://download.geonames.org/export/dump/>, unzip it, save it as
`api/data/cities5000.txt` in place of the existing file, and rebuild.

## Licence and credits

[MIT](LICENSE). Made by Alexander Garner ([@TheMrPuffin](https://github.com/TheMrPuffin)).

The data and map services the app uses are **not** covered by that licence. Each keeps its own,
and the same credits are shown in the app under **About**.

| What | Used for | Licence |
|---|---|---|
| [GeoNames](https://www.geonames.org/) `cities5000` | Town search and town names. Converted into `cities.db` when the app is built | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [world-countries](https://github.com/mledoze/countries) | Country names and codes | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1.0/) |
| [world-atlas](https://github.com/topojson/world-atlas), from [Natural Earth](https://www.naturalearthdata.com/) | Country shapes on the Basic map | ISC (the data itself is public domain) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles | The *Streets* view, loaded live | Map data © OpenStreetMap contributors, ODbL 1.0. Use is subject to the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| Esri World Imagery | The *Satellite* view, loaded live | Imagery © Esri, Maxar, Earthstar Geographics. A proprietary service: use is subject to Esri's terms of use |

The libraries the app is built with (globe.gl, three.js, Fastify, better-sqlite3, Vite and
others) are under their own permissive licences, found in each package's folder inside
`node_modules`.

This is an independent project. It is not affiliated with or endorsed by the World
Organization of the Scout Movement or JOTA-JOTI.
