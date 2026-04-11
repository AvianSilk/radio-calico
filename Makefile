DOCKER_TIMEOUT := 60

.PHONY: prod dev stop test ensure-docker

## Start production: build images + start postgres/app/nginx in background (http://localhost:80)
prod: ensure-docker
	docker compose build app nginx
	docker compose up -d
	@echo "Running at http://localhost:$${PORT:-80}"
	@echo "Logs: docker compose logs -f app nginx"

## Start development: hot-reload Express on :3000, attached — Ctrl+C to stop
dev: ensure-docker
	docker compose --profile dev build dev
	docker compose --profile dev up dev

## Stop all containers. Use VOLUMES=1 to also wipe the postgres data volume.
stop:
	@if ! docker info > /dev/null 2>&1; then \
		echo "Docker is not running — nothing to stop."; \
		exit 0; \
	fi
	@echo "Stopping all containers$(if $(VOLUMES), and removing data volumes)..."
	@docker compose --profile dev down $(if $(VOLUMES),--volumes)
	@echo "Done."

## Run the Jest test suite (no Docker needed)
test:
	npm test

# ── internal: start Docker Desktop if it isn't already running ────────────────
ensure-docker:
	@if ! docker info > /dev/null 2>&1; then \
		echo "Docker is not running — starting Docker Desktop..."; \
		open -a Docker; \
		echo -n "Waiting for Docker"; \
		i=0; \
		while ! docker info > /dev/null 2>&1; do \
			i=$$((i + 1)); \
			if [ $$i -ge $(DOCKER_TIMEOUT) ]; then \
				echo ""; \
				echo "Error: Docker did not start within $(DOCKER_TIMEOUT) seconds. Start Docker Desktop manually and try again."; \
				exit 1; \
			fi; \
			printf "."; \
			sleep 1; \
		done; \
		echo " ready."; \
	fi
