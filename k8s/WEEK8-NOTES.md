# Week 8: результаты

Контекст: kind-inf345. Узел Ready, Kubernetes v1.37.0.

1. Отдельный Pod после удаления не восстановился.
2. Deployment создал 3 Pod и заменил удалённый новым. Несовпадение selector и template labels отклонено API.
3. Проверено масштабирование 3 → 5 → 2 через scale → 5 после apply → 3. Apply использует число из YAML.
4. Service дал HTTP 200 от nginx/1.30.5. Ошибочная метка wev оставила его без endpoints, curl не подключился. Метка восстановлена.
5. Обновление до nginx/1.31.6 прошло, HTTP 200 подтверждён. Неверный тег 1.31.66-alpine вызвал ImagePullBackOff, старые 3 Pod продолжили работу. Rollback восстановил Deployment. Port-forward также дал HTTP 200. Учебные Deployment и Service web удалены по инструкции; кластер сохранён.
6. app.yaml заполнен: образ Rythm с полным SHA main, 2 реплики, PORT/containerPort/targetPort = 8080, Service port = 80. Образ в GHCR только AMD64, поэтому первоначально возник ImagePullBackOff. Для Mac из чистой копии main (dda1c80ba6189e27a830929826aea4948c4a8136) собран локальный ARM64-образ с тем же тегом и загружен в kind. Обе реплики Running; через Service и port-forward /healthz вернул HTTP 200 и {"status":"ok"}. Шаг 6 локально выполнен.

## Повторить nginx

```bash
cd ~/inf345-week8-lab
kubectl apply -f playground/web-deployment.yaml -f playground/web-service.yaml
kubectl rollout status deployment/web
kubectl get deploy,rs,pods
kubectl port-forward service/web 8080:80
```

Открой http://localhost:8080. Ctrl+C остановит туннель.

## Повторить шаг 6 на Mac

Локальная сборка не меняет образ в GHCR. После пересоздания kind нужно снова загрузить ARM64-образ. Для запуска на другом ARM64-компьютере понадобится такая же локальная сборка либо публикация ARM64 в CI.

Из чистой копии проекта на коммите dda1c80ba6189e27a830929826aea4948c4a8136:

```bash
docker build --platform linux/arm64 -t ghcr.io/shadnevermore/rythm:dda1c80ba6189e27a830929826aea4948c4a8136 .
kind load docker-image ghcr.io/shadnevermore/rythm:dda1c80ba6189e27a830929826aea4948c4a8136 --name inf345
```

Из каталога проекта с манифестом:

```bash
kubectl apply -f k8s/app.yaml
kubectl rollout status deployment/mine --timeout=120s
kubectl port-forward service/mine 8080:80
```

В другом терминале: `curl -i localhost:8080/healthz`. Ожидается HTTP 200.

Для M4 используется k8s/app.yaml. Он также подходит для AMD64-кластера, который скачает опубликованный образ из GHCR.
