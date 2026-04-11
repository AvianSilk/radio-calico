DOCKER_TIMEOUT := 60

.PHONY: prod dev stop test audit scan ensure-docker

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

## Run npm security audit (fails on high or critical vulnerabilities)
audit:
	npm audit --audit-level=high

## Full security scan: dependency audit + Docker image CVEs (high/critical) + SAST + secrets
## Docker images must exist — run 'make prod' first if they don't
## All four stages always run; exits 1 if any stage found issues
scan:
	@status=0; \
	echo "══ 1/4  npm audit ════════════════════════════════════════════════════════════"; \
	npm audit --audit-level=high || status=1; \
	echo ""; \
	echo "══ 2/4  Docker image CVE scan (high + critical only) ════════════════════════"; \
	for image in radiocalico-app:latest radiocalico-nginx:latest; do \
		if docker image inspect $$image > /dev/null 2>&1; then \
			echo "--- $$image ---"; \
			docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(CURDIR)/.trivyignore:/.trivyignore" ghcr.io/aquasecurity/trivy image --ignorefile /.trivyignore --severity HIGH,CRITICAL --exit-code 1 $$image || status=1; \
		else \
			echo "$$image not found — skipping (run 'make prod' first)"; \
		fi; \
	done; \
	echo ""; \
	echo "══ 3/4  SAST — semgrep (nodejs security rules) ══════════════════════════════"; \
	docker run --rm -v "$(CURDIR):/src" semgrep/semgrep semgrep scan --config=p/nodejs --config=p/secrets --error /src || status=1; \
	echo ""; \
	echo "══ 4/4  Secrets scan — gitleaks ════════════════════════════════════════════"; \
	docker run --rm -v "$(CURDIR):/path" ghcr.io/gitleaks/gitleaks:latest detect --source=/path || status=1; \
	echo ""; \
	if [ $$status -ne 0 ]; then \
		echo "Security scan complete. Findings were detected — review the output above."; \
		echo "(make will report 'Error 1' below — this is expected and means findings were detected, not that the scan itself failed)"; \
		exit 1; \
	fi; \
	echo "All security checks passed."

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
