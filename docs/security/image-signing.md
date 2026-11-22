# Container Image Signing & Verification

Published Docker images are cryptographically signed with
[Sigstore Cosign](https://github.com/sigstore/cosign) using **GitHub OIDC
keyless signing**. A signature and a CycloneDX SBOM attestation are pushed to
GHCR alongside each image, so any deployment can prove the image was built by
the official CI pipeline and has not been tampered with.

This closes the provenance gap: without signing, a deployed image cannot be
distinguished from a look-alike that was built elsewhere.

## Overview

```
container-registry.yml                    deploy.yml
──────────────────────                    ───────────
build & push image  ──►  cosign sign       cosign verify  ──►  ECS deploy
                        (keyless, GH OIDC)   (before deploy)
                        + SBOM attestation
```

Two workflows participate:

1. **[`Build and Push to GHCR`](../../.github/workflows/container-registry.yml)**
   builds and pushes the `linux/amd64` + `linux/arm64` manifest, then a
   `sign-images` job signs each image by digest and attaches a CycloneDX SBOM
   attestation.
2. **[`Deploy with Blue-Green Strategy`](../../.github/workflows/deploy.yml)**
   signs the ECR image it built and runs `cosign verify` against the image
   **before** handing it to ECS. Deployment aborts if the signature does not
   verify.

## 1. Signing in CI (GHCR, keyless)

The `sign-images` job in `container-registry.yml`:

- has `permissions: id-token: write` (required to mint the GitHub OIDC token
  cosign uses as the signing key — there is no long-lived private key to
  manage or rotate), plus `packages: write` (to push the signature artifact);
- installs cosign via `sigstore/cosign-installer@v3`;
- signs the precise, immutable reference `<image>@<digest>` (the multi-arch
  manifest digest produced by the build job), so the signature is bound to
  the exact image that was pushed — not to a mutable tag;
- generates a CycloneDX SBOM with `anchore/sbom-action` and attaches it as an
  attestation with `cosign attest --type cyclonedx`.

```yaml
- name: Sign image with GitHub OIDC
  run: cosign sign --yes "${IMAGE}@${DIGEST}"

- name: Attach SBOM attestation
  run: cosign attest --yes --predicate sbom.cyclonedx.json --type cyclonedx "${IMAGE}@${DIGEST}"
```

`cosign sign --yes` uses the ephemeral OIDC certificate; the signature and
attestation are stored in GHCR as OCI referrers to the image.

### What gets signed

Both services, on every build trigger (push to `main`/`develop`, release
tags, manual dispatch): `ghcr.io/<owner>/stellarkraal-backend` and
`ghcr.io/<owner>/stellarkraal-frontend`, referenced by manifest digest. See
[docker-multi-arch-build.md](../docker-multi-arch-build.md) for the tagging
strategy; signing is by digest so it is independent of which tag pointed at
that digest.

## 2. Verifying before deploy

`deploy.yml` builds and pushes the image it will deploy to Amazon ECR, then:

- installs cosign;
- signs that ECR image (`cosign sign --yes "$IMAGE@$DIGEST"`) using the same
  GitHub OIDC keyless flow (the job has `id-token: write`);
- runs `cosign verify` against the same reference, pinning the issuer and the
  expected certificate identity, **before** `amazon-ecs-deploy-task-definition`:

```yaml
- name: Verify image signature before deploying
  run: |
    cosign verify "$IMAGE@$DIGEST" \
      --certificate-identity-regexp "https://github.com/<owner>/<repo>/.github/workflows/deploy.yml@.*" \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

If verification fails (the image was not signed by this workflow's OIDC
identity), the step exits non-zero and ECS is never updated. This guarantees
that the image running in production is one this CI pipeline signed.

## 3. Verify a published image locally

Install cosign ([docs](https://docs.sigstore.dev/cosign/systems/configuration/)),
then verify against GitHub's public Fulcio/Rekor infrastructure:

```bash
# Verify the GHCR image was signed in the build/sign workflow.
cosign verify ghcr.io/<owner>/stellarkraal-backend@sha256:<digest> \
  --certificate-identity-regexp "https://github.com/<owner>/<repo>/.github/workflows/container-registry.yml@.*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# Verify the attached CycloneDX SBOM attestation.
cosign verify-attestation ghcr.io/<owner>/stellarkraal-backend@sha256:<digest> \
  --certificate-identity-regexp "https://github.com/<owner>/<repo>/.github/workflows/container-registry.yml@.*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --type cyclonedx
```

Replace `<digest>` with the manifest digest from the workflow run summary
(or `docker buildx imagetools inspect <image>`). Always verify by **digest**
rather than a mutable tag — a tag can be re-pointed; a digest cannot.

## 4. Prerequisites & configuration

- **GitHub OIDC** must be enabled for the repository (it is by default for
  GitHub-hosted runners). The signing jobs declare `id-token: write`.
- **No secrets are needed for signing.** Keyless signing mints a short-lived
  certificate from GitHub's Fulcio instance bound to the workflow's
  `job_workflow_ref`. There is no `COSIGN_PRIVATE_KEY` to rotate or leak.
- **GHCR** must allow the workflow to push packages (the build/sign jobs use
  `GITHUB_TOKEN` with `packages: write`).
- **ECR** (for `deploy.yml`) must support OCI referrers so cosign can attach
  signatures. `amazon-ecr-login` populates the Docker config that cosign reads
  to push/verify signatures in ECR.
- cosign is pinned via `sigstore/cosign-installer@v3` with `cosign-release`.

## 5. Operational notes

- **Re-signing**: re-running the `container-registry.yml` workflow re-signs the
  (re-built) image; the previous signature remains attached to the old digest.
- **Rollback safety**: because verification is by digest, rolling back to an
  older image only deploys it if that older image was also signed by CI.
- **Debugging verification failures**: run `cosign verify` locally (section 3)
  with the same flags; confirm the digest matches and that the workflow's
  `job_workflow_ref` matches the `--certificate-identity-regexp`. A mismatch
  means the image was signed by a different workflow/ref (or not by CI at all).

Closes #1530.
