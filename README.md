# Rythm

## What it does

Rythm — небольшое веб-приложение для отслеживания ежедневных привычек. Можно
добавлять привычки, отмечать их выполненными, фильтровать список и следить за
прогрессом. Данные хранятся локально в браузере.

Сервис также предоставляет `GET /healthz` для проверки состояния.

## Requirements

- Node.js 18 или новее
- Bash

## Run

Запустить сервис на порту `8080`:

./scripts/run.sh

Порт можно изменить через переменную окружения `PORT`:

PORT=9000 ./scripts/run.sh

После запуска открыть <http://localhost:8080>.

## Testing

Запустить все HTTP-тесты:

./scripts/test.sh

## Runtime configuration

`PORT` sets the listening port (default: `8080`). `LOG_LEVEL=info` logs request
methods and paths; `LOG_LEVEL=silent` disables request logs. Headers and secret
values are never logged.

`API_KEY` enables `GET /admin/status`, which requires an `Authorization: Bearer`
header containing that value. Without a configured key the endpoint returns 503;
missing or incorrect authorization returns 401. `/healthz` remains public.

## M4: Kubernetes

The three YAML files directly in `k8s/` deploy two replicas, a Service and a
ConfigMap. `PORT` and `LOG_LEVEL` come from `rythm-config`; `API_KEY` comes from
the separately created Secret `app-secret`. No secret values are committed.

On a running Kubernetes cluster:

```bash
kubectl create secret generic app-secret --from-literal=API_KEY="$(openssl rand -hex 16)"
kubectl apply --dry-run=server -f k8s/
kubectl apply -f k8s/
kubectl rollout status deployment/rythm --timeout=180s
kubectl port-forward service/rythm 8080:80
```

In another terminal, `curl -i localhost:8080/healthz` should return HTTP 200 and
`{"status":"ok"}`.

Readiness checks `/healthz` every 5 seconds, removing an unresponsive Pod from
traffic after three failures. Liveness checks it every 10 seconds and restarts
the container after three failures. The other replica keeps serving requests.
Each Pod requests 50m CPU / 64Mi memory and is limited to 250m CPU / 192Mi memory.
Containers run as UID/GID 1000 with a read-only root filesystem and writable `/tmp`.

After changing ConfigMap values, apply the file and restart the Deployment:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl rollout restart deployment/rythm
```

Changing `PORT` also requires matching `containerPort` in the Deployment. The
Service and probes use the named `http` port and follow that change.

### Official M4 checks

Download the marker outside the repository, then run static checks:

```bash
curl -fsSLo /tmp/mark_m4.py https://raw.githubusercontent.com/inf345/inf345-week9-lab/main/mark_m4.py
python3 /tmp/mark_m4.py --path .
```

The marker requires PyYAML (`pyyaml==6.0.3`). The `Kubernetes` pull-request workflow
runs the full marker on a disposable Intel kind cluster, including freezing a
Pod and trying a random `PORT`. This works even when the developer uses an
Apple Silicon Mac and the published image is AMD64-only. For a local ARM64
cluster, build the manifest's source commit for ARM64 and load that image into
kind first, as in Week 8. Local loading does not publish an ARM64 image to GHCR.
