# Multi-arch Docker Image Build & Publish

The backend and frontend are published to GitHub Container Registry (GHCR) as
**multi-arch manifests** covering `linux/amd64` and `linux/arm64`. This lets
x86-64 CI runners and Apple Silicon (arm64) developers pull a native image with
no emulation, and is the foundation for signing images with Sigstore Cosign
(see [docs/security/image-signing.md](security/image-signing.md)).

This document explains how the manifest is built and published in CI, how to
build and test arm64 images locally on an amd64 machine, how to troubleshoot
architecture-mismatch errors, and the image tagging strategy.

> **Consumer guide** (pulling/verifying the native arm64 image) lives in the
> README's *Pulling pre-built images* section. This doc covers the
> **build and publish** side.

## 1. CI workflow that builds and pushes the manifest

The [`Build and Push to GHCR`](../.github/workflows/container-registry.yml)
workflow produces both architectures for each service. It runs on every push
to `main` and `develop`, on `v*.*.*` tags, and via `workflow_dispatch`.

The `build-and-push` job runs a matrix of `{backend, frontend}` and executes
these steps for each service:

1. **Set up QEMU** (`docker/setup-qemu-action@v3`, `platforms: arm64`)
   registers an arm64 emulator on the x86-64 runner. Without it the runner
   cannot execute arm64 instructions and the arm64 layer cannot be built.
2. **Set up Docker Buildx** (`docker/setup-buildx-action@v3`) creates a
   Buildx builder that can emit a multi-platform manifest list.
3. **Log in to GHCR** with `GITHUB_TOKEN` (the job has `packages: write`).
4. **Extract metadata** (`docker/metadata-action@v5`) derives tags and labels
   from the git ref (see [Tagging strategy](#4-image-tagging-strategy)).
5. **Build and push** (`docker/build-push-action@v6`) with
   `platforms: linux/amd64,linux/arm64`, `push: true`, and a per-service
   GitHub Actions cache (`type=gha,scope=<service>`, `mode=max`). The arm64
   layer is cross-compiled through the QEMU emulator; the result is a single
   manifest list in GHCR referencing one entry per platform.
6. **Verify the multi-arch manifest** inspects the pushed manifest list and
   fails the job if either `amd64` or `arm64` is missing. This catches a
   silently single-arch push before anyone deploys it.

```text
docker manifest inspect ghcr.io/<owner>/stellarkraal-backend@<digest>
# → manifests: [ { platform: linux/amd64 ... }, { platform: linux/arm64 ... } ]
```

Expected build time with a warm GHA cache is ~6–8 min per service; a cold
build is ~12–15 min per service.

## 2. Build and test arm64 images locally (on an amd64 machine)

You can reproduce the CI multi-arch build on a developer machine using
Docker Buildx and QEMU. This is the fastest way to debug an arm64-only issue
without an Apple Silicon host.

### One-time setup

```bash
# Enable arm64 emulation (installs the binfmt handlers)
docker run --privileged --rm tonistiigi/binfmt --install arm64

# Create a Buildx builder (the default driver cannot build multi-platform)
docker buildx create --use --name multiarch --driver docker-container
docker buildx inspect --bootstrap
```

### Build a single platform (load into the local Docker daemon)

Load a native arm64 image into your local daemon so you can `docker run` it:

```bash
cd backend   # or frontend
docker buildx build \
  --platform linux/arm64 \
  --load \
  -t stellarkraal-backend:arm64-local \
  .
```

> `--load` only supports a single platform at a time. Omit `--platform` (or
> use `--platform linux/amd64`) for an amd64 image.

### Build a real multi-arch manifest (no `--load`)

To produce a true manifest list (like CI), you must `--push` to a registry —
`--load` cannot import a manifest list into the local daemon:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/<owner>/stellarkraal-backend:dev-multiarch \
  --push \
  .
```

### Inspect what you built

```bash
# Confirm the manifest list carries both platforms
docker buildx imagetools inspect ghcr.io/<owner>/stellarkraal-backend:dev-multiarch

# Or, for a local --load image, confirm the architecture
docker image inspect stellarkraal-backend:arm64-local --format '{{.Architecture}}'
# → arm64
```

### Run the arm64 image under emulation

```bash
docker run --rm --platform linux/arm64 -p 3001:3001 stellarkraal-backend:arm64-local
```

The arm64 binary runs through QEMU, so it is slower than a native build — fine
for smoke-testing startup and config, not for load testing.

## 3. Troubleshooting "Architecture mismatch" / "exec format" errors

These errors mean the host tried to run a layer built for a different
architecture.

| Symptom | Cause | Fix |
|---|---|---|
| `exec /usr/local/bin/node: exec format error` when starting a container | The image layer does not match the host CPU arch (e.g. amd64 image on an arm64 host, or QEMU not installed) | Pull by a tag that resolves to the right arch, or install QEMU (`binfmt --install arm64`) for local arm64 |
| `no matching manifest for linux/arm64 in the manifest list entries` on `docker pull` | The pushed manifest list is missing the arm64 entry (e.g. a build pushed only amd64) | Re-run the CI `build-and-push` job; the *Verify multi-arch manifest* step is designed to fail before this reaches a pull |
| `docker run` selects the wrong arch on Apple Silicon | A pinned digest/tag resolved to amd64 only, or the manifest list only has amd64 | Pull a fresh tag and verify with `docker inspect … \| grep Architecture`; ensure the manifest list contains arm64 |
| `--load` fails with `docker exporter does not support exporting manifest lists` | `--load` cannot import a multi-arch manifest list | Build a single `--platform` with `--load`, or `--push` a multi-arch manifest to a registry |
| Build is very slow / hangs on arm64 | QEMU emulation of an amd64 runner building arm64 is slow | This is expected; rely on the warm GHA cache. For local work, prefer a single `--platform` |
| `docker manifest inspect` shows only one platform | The metadata-action or `platforms:` input was changed to a single arch | Restore `platforms: linux/amd64,linux/arm64` in `container-registry.yml` |

### Verify a pulled image's architecture

```bash
docker inspect --format '{{.Architecture}}' <image>
# amd64 host should report "amd64"; Apple Silicon should report "arm64"
```

## 4. Image tagging strategy

Tags are produced by `docker/metadata-action` in `container-registry.yml`.
Which tags are published depends on what triggered the workflow:

| Trigger | Tags published | Example |
|---|---|---|
| Push to `main` | `main`, `sha-<short-sha>` | `…:main`, `…:sha-9f3a1b2` |
| Push to `develop` | `develop`, `sha-<short-sha>` | `…:develop` |
| Tag `v1.2.3` (release) | `1.2.3`, `1.2`, `1`, `latest`, `sha-<short-sha>` | `…:1.2.3`, `…:1.2`, `…:1`, `…:latest` |
| `workflow_dispatch` (manual, on a branch) | branch-name tag + `sha-<short-sha>` | as for a branch push |

Rules the metadata-action enforces:

- **`latest` is only published on semver release tags** (`type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}`). Branch pushes never move `latest`.
- **Semver derivation** strips the leading `v` and publishes major/minor/patch, plus the major-only alias (`v1.2.3` → `1.2.3`, `1.2`, `1`). This lets consumers pin at any granularity.
- **Commit SHA tags** (`sha-<short>`) give an immutable, auditable reference for every build — these are the tags Cosign signs (see [image-signing.md](security/image-signing.md)).
- **Branch tags** (`main`, `develop`) are mutable pointers that move on every push to that branch.

### Which tag should I use?

- **Rolling deploys / staging:** the branch tag (`main`).
- **Production:** a semver tag (`1.2.3`) or the immutable `sha-<short>` digest-pinned reference.
- **Local dev / Apple Silicon pull:** `main` (Docker selects the arm64 layer automatically) or a specific semver tag.

Closes #1531.
