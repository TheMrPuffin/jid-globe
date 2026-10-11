# Shortcuts for the common jobs. Run `make` on its own to list them.
#
# Each one is just a short name for a command you could type yourself;
# the README explains what the commands do.

# Stops Git Bash on Windows rewriting the /data/... paths used by `make backup`.
export MSYS_NO_PATHCONV := 1

.PHONY: help install dev test build image up down restart logs status backup version scan

# The list is printed by make itself, so it looks the same in every kind of terminal.
define HELP
Running the app (Docker):
  make image    Build the Docker image (jid-globe:local) without starting it
  make up       Build the image and start the app at http://localhost:8080
  make down     Stop the app (the pins are kept)
  make restart  Restart the app without rebuilding it
  make logs     Follow the app's log (Ctrl+C to stop watching)
  make status   Show whether the app is running and healthy
  make backup   Copy the database to backup.db in this folder
  make scan     Look for known security problems in the image (after make image)

Changing the code:
  make install  Install the packages (once, and after they change)
  make dev      Run with live reload at http://localhost:3000
  make test     Run all the tests
  make build    Build the web pages and the server without Docker
  make version V=1.2.3   Set the version number everywhere, ready for a release
endef

help:
	$(info $(HELP))
	@cd .

install:
	npm install

dev:
	npm run dev

test:
	npm test

build:
	npm run build

image:
	docker compose build

up:
	docker compose up --build -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

status:
	docker compose ps

# The app must be running. Makes a safe copy inside the container, then copies it out.
backup:
	docker compose exec app sqlite3 /data/jid-globe.db ".backup /data/backup.db"
	docker compose cp app:/data/backup.db ./backup.db

# Writes the new number into all three package.json files and package-lock.json.
# It does not commit or tag anything.
version:
	npm version $(V) --workspaces --include-workspace-root --no-git-tag-version

# Checks an image against the public lists of known security problems, using Grype.
# It fails if any problem rated High or Critical has a fix available.
# By default it checks the image built by `make image`; to check another one:
#   make scan IMAGE=ghcr.io/themrpuffin/jid-globe:latest
IMAGE ?= jid-globe:local
GRYPE := anchore/grype:v0.120.1

scan:
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock $(GRYPE) $(IMAGE) --only-fixed --fail-on high
