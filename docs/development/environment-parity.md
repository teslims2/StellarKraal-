# Environment Parity

This page is the checklist that keeps local Docker Compose, staging and production
configured the same way. Most "works locally, breaks in staging" bugs come from one of
three things: a different environment variable name, a different Node.js version, or a
different container image tag. The automated check in `scripts/check-environment-parity.js`
(run by `.github/workflows/environment-parity.yml` on every relevant pull request) catches
these before merge.

Run it locally with:

```bash
npm run check:env-parity
```

## Parity checklist

| # | Check | Source of truth | Enforced by |
|---|-------|-----------------|-------------|
| 1 | Every variable referenced by `docker-compose*.yml` is documented in `.env.example` with a default | `.env.example` | `check-environment-parity.js` |
| 2 | Every backend config variable is in `.env.example` and in `docs/guides/environment-variables.md` | `backend/src/config.ts` | `validate-env-example.js` |
| 3 | Node.js major version in both Dockerfiles matches `.nvmrc` and every CI `node-version` | `.nvmrc` | `check-environment-parity.js` |
| 4 | `docker-compose*.yml` and the ECS task definition use the same image names and tag default | `IMAGE_TAG` / `image_tag` | `check-environment-parity.js` |

## 1. Environment variables

`.env.example` is the single list of variables every environment needs. Add a
variable there first, with a comment that says whether it is required, its format, and
its default. Then document it in `docs/guides/environment-variables.md`.

Variables used only by Docker Compose (for example `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, `IMAGE_TAG`, and the `STAGING_*` overrides) live in the **DOCKER** and
**STAGING** sections of `.env.example`.

Staging and production secrets are stored as GitHub Actions secrets. The
`[GitHub Secret: NAME]` annotation in `.env.example` names the secret to create.

## 2. Node.js version

`.nvmrc` is the source of truth (currently `20`). These must all agree:

- `FROM node:<N>-alpine` in `backend/Dockerfile` and `frontend/Dockerfile`
- `node-version: '<N>'` in `.github/workflows/backend-ci.yml` and other workflows
  (workflows that use `node-version-file: '.nvmrc'` inherit it automatically)

To upgrade Node, change `.nvmrc`, both Dockerfile `FROM` lines (including the digest), and the
literal CI `node-version` values in the same pull request. The parity check fails until all of
them match.

## 3. Image names and tags

Local Compose, the ECS task definition and CI build the same images:

| Image | Built by | Deployed by |
|-------|----------|-------------|
| `stellarkraal-backend:<tag>` | `docker-compose.yml` / `docker-compose.prod.yml` (`backend` service) | `terraform/compute.tf` (`backend` container) |
| `stellarkraal-frontend:<tag>` | `docker-compose.yml` / `docker-compose.prod.yml` (`frontend` service) | `terraform/compute.tf` (`frontend` container) |

The tag is controlled by one value on each side:

- Compose: `IMAGE_TAG` (default `latest`, see `.env.example`)
- Terraform: `image_tag` in `terraform/variables.tf` (default `latest`)

Keep the defaults identical. These defaults are what a local Compose build and a first Terraform
bootstrap use. The production deploy in `.github/workflows/deploy.yml` pushes each build to ECR tagged
with the git commit SHA and replaces the task definition image at deploy time, so the Terraform tag
is only the starting value. See [Production deployment guide](../deployment/production-deployment-guide.md#4-image-tagging-conventions)
for the full tagging rules.

## 4. Verifying parity by hand

Before promoting a build to staging or production:

1. `npm run check:env-parity` passes.
2. `node scripts/validate-env-example.js` passes.
3. `docker compose -f docker-compose.yml config` resolves without warnings about unset variables.
4. `docker compose -f docker-compose.yml build` completes and produces `stellarkraal-backend` and `stellarkraal-frontend`
   tagged with the value of `IMAGE_TAG`.
5. `terraform -chdir=terraform plan -var image_tag=<tag>` shows the task definition image as
   `stellarkraal-backend:<tag>` and `stellarkraal-frontend:<tag>`.

## Related

- [Local setup](./local-setup.md)
- [Environment variables](../guides/environment-variables.md)
- [Docker guide](../guides/docker.md)
- [Production deployment guide](../deployment/deployment-guide.md)
