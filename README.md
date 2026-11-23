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

For the manual M4 exercise, before handing control to Argo CD:

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

For the manual M4 exercise, apply ConfigMap changes and restart the Deployment:

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

## M5: GitOps with Argo CD

`argocd/application.yaml` tells Argo CD to deploy `k8s/` from this repository's
`main` branch into the `default` namespace. Automated sync applies Git changes;
`selfHeal: true` repairs manual changes and recreates deleted resources;
`prune: true` removes managed resources that are no longer declared in Git.
`app-secret` is created separately and is never tracked or pruned by this Application.

CI builds, tests, scans and publishes images. Argo CD pulls the manifests from
GitHub and deploys them. CI has no credentials for the application cluster.
The M4 and M5 workflows create disposable clusters only to test the manifests.

### Hand over to Argo CD

Use an AMD64 cluster for the published image (for example a Codespace). Install
the course-pinned Argo CD core version once; on macOS `shasum` is available too:

```bash
kubectl create namespace argocd
curl -fsSLo /tmp/rythm-argocd-core.yaml https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.3/manifests/core-install.yaml
echo "1a87025d8eb2eae621653fd312fb9ca51df1b4b3b6992a030e3a9ef38e45c448  /tmp/rythm-argocd-core.yaml" | shasum -a 256 -c -
# Continue only when the checksum prints OK.
kubectl apply -n argocd --server-side --force-conflicts -f /tmp/rythm-argocd-core.yaml
kubectl -n argocd wait --for=condition=Ready pods --all --timeout=600s
```

If `app-secret` does not already exist, create it without committing its value:

```bash
kubectl create secret generic app-secret --from-literal=API_KEY="$(openssl rand -hex 16)"
```

With the latest `main` checked out, remove the manually deployed M4 objects,
then apply only the Application. This leaves the separately created Secret intact:

```bash
kubectl delete -f k8s/ --ignore-not-found
kubectl apply -f argocd/application.yaml
kubectl -n argocd get application rythm -w
```

Wait for `Synced` and `Healthy`. To check HTTP, run
`kubectl port-forward service/rythm 8080:80`, then in another terminal run
`curl -i localhost:8080/healthz`.

After handover, change manifests and configuration through commits and pull
requests. Manual `kubectl scale`, Service deletion and `kubectl rollout undo`
are temporary: self-heal restores what Git declares. `Synced` means the cluster
matches Git; `Healthy` means the declared resources are working.

### Deploy a new image

Wait for the source commit's CI build/scan/publish to pass. In a new branch,
change only `image:` in `k8s/deployment.yaml` to that commit's full 40-character
SHA. Commit, push, open a pull request and merge it into `main`.
Argo CD detects the change within roughly three minutes. To request a refresh:

```bash
kubectl -n argocd annotate application rythm argocd.argoproj.io/refresh=normal --overwrite
kubectl rollout status deployment/rythm --timeout=180s
kubectl get deployment rythm -o jsonpath='{..image}'
```

## Rollback

Argo CD deploys what is on the `main` branch, from the `k8s` folder.
To roll back, undo the image-bump commit with a new commit. For an image-only
pull request merged with a merge commit, revert the merge against its first parent:

```bash
git switch main
git pull --ff-only
git log --oneline --first-parent -- k8s/deployment.yaml
git revert --no-edit -m 1 <image-bump-merge-sha>
git push origin main
```

If the image change is a regular single commit, use
`git revert --no-edit <image-bump-commit-sha>` without `-m 1`. This also works to
undo an image-only commit inside a larger merged pull request, preserving its
other changes. The original bump and the revert both remain in the audit trail.

Argo CD deploys the previous version within roughly three minutes. Do not use
`kubectl rollout undo`: self-heal would put the version still declared in Git
back. Request an Application refresh with the command above to check sooner.

## Official M5 checks

Download the marker outside the repository and run its static checks:

```bash
curl -fsSLo /tmp/mark_m5.py https://raw.githubusercontent.com/inf345/inf345-week10-lab/main/mark_m5.py
python3 /tmp/mark_m5.py --path .
```

The marker requires PyYAML (`pyyaml==6.0.3`). The `M5 check` workflow runs the
unmodified official marker with `--kind` on a disposable AMD64 cluster with
Argo CD 3.5.3. It checks sync/health, replica self-healing, Service recreation,
pruning, Secret preservation, build/deploy separation and image-bump history.
This is the course's CI option for Apple Silicon laptops.
