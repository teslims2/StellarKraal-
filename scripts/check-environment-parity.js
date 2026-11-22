#!/usr/bin/env node
// Environment parity check (see docs/development/environment-parity.md).
//
// Verifies that local Docker Compose, staging, production (ECS) and CI agree on:
//   1. Node.js major version: .nvmrc == every `FROM node:<N>` in Dockerfiles
//      == every literal `node-version: '<N>'` in .github/workflows/*.yml
//   2. Image names and tags: docker-compose*.yml `stellarkraal-*` images use the
//      same name and default tag as the ECS task definition in terraform/compute.tf
//      (tag default taken from terraform/variables.tf `image_tag`).
//   3. Environment variables: every `${VAR}` referenced in docker-compose*.yml is
//      declared in .env.example.
//
// Exits with code 1 on any mismatch. Dependency-free (Node built-ins only).

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const errors = [];
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------
// 1. Node.js version parity
// ---------------------------------------------------------------------------
const nvmrc = read(".nvmrc").trim();
const nodeMajor = nvmrc.split(".")[0];
if (!/^\d+$/.test(nodeMajor)) {
  fail(`.nvmrc must contain a Node major version (got "${nvmrc}")`);
}

for (const dockerfile of ["backend/Dockerfile", "frontend/Dockerfile"]) {
  const src = read(dockerfile);
  const froms = [...src.matchAll(/^FROM\s+node:(\d+)/gm)].map((m) => m[1]);
  if (froms.length === 0) {
    fail(`${dockerfile} has no "FROM node:<version>" line`);
  }
  for (const v of froms) {
    if (v !== nodeMajor) {
      fail(`${dockerfile} uses node:${v} but .nvmrc specifies ${nodeMajor}`);
    }
  }
}

const workflowDir = path.join(root, ".github", "workflows");
for (const file of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f))) {
  const src = fs.readFileSync(path.join(workflowDir, file), "utf8");
  for (const m of src.matchAll(/node-version:\s*['"]?(\d+)['"]?/g)) {
    if (m[1] !== nodeMajor) {
      fail(`.github/workflows/${file} sets node-version ${m[1]} but .nvmrc specifies ${nodeMajor}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Image name and tag parity: docker-compose vs ECS task definition
// ---------------------------------------------------------------------------
const composeFiles = ["docker-compose.yml", "docker-compose.prod.yml"];
const composeImages = {}; // service image name -> tag default
for (const file of composeFiles) {
  const src = read(file);
  for (const m of src.matchAll(/image:\s*(stellarkraal-[a-z]+):\$\{IMAGE_TAG:-([^}]+)\}/g)) {
    const [, name, tag] = m;
    if (composeImages[name] !== undefined && composeImages[name] !== tag) {
      fail(`${file} tags ${name} as "${tag}" but another compose file uses "${composeImages[name]}"`);
    }
    composeImages[name] = tag;
  }
}

const computeSrc = read("terraform/compute.tf");
const variablesSrc = read("terraform/variables.tf");
const tfTagVar = variablesSrc.match(/variable\s+"image_tag"\s*{[^}]*?default\s*=\s*"([^"]+)"/s);
const tfDefaultTag = tfTagVar ? tfTagVar[1] : null;
if (!tfDefaultTag) {
  fail('terraform/variables.tf must declare variable "image_tag" with a default');
}

const ecsImages = {};
for (const m of computeSrc.matchAll(/image\s*=\s*"(stellarkraal-[a-z]+):\$\{var\.image_tag\}"/g)) {
  ecsImages[m[1]] = true;
}

for (const name of ["stellarkraal-backend", "stellarkraal-frontend"]) {
  if (composeImages[name] === undefined) {
    fail(`docker-compose.yml/docker-compose.prod.yml must set image: ${name}:\${IMAGE_TAG:-...}`);
  }
  if (!ecsImages[name]) {
    fail(`terraform/compute.tf must reference image "${name}:\${var.image_tag}"`);
  }
  if (composeImages[name] !== undefined && tfDefaultTag && composeImages[name] !== tfDefaultTag) {
    fail(
      `Image tag mismatch for ${name}: compose default "${composeImages[name]}" vs terraform image_tag default "${tfDefaultTag}"`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Environment variable parity: compose references must exist in .env.example
// ---------------------------------------------------------------------------
const envExampleKeys = new Set(
  read(".env.example")
    .split("\n")
    .map((l) => l.replace(/^#\s*/, "").match(/^([A-Z_][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((m) => m[1])
);

const composeVarRefs = new Map(); // var -> first file it was seen in
for (const file of composeFiles.concat(["docker-compose.staging.yml", "docker-compose.override.yml"])) {
  const src = read(file);
  for (const m of src.matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)) {
    if (!composeVarRefs.has(m[1])) composeVarRefs.set(m[1], file);
  }
}
for (const [name, file] of composeVarRefs) {
  if (!envExampleKeys.has(name)) {
    fail(`${name} is referenced in ${file} but missing from .env.example`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error("❌ Environment parity check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✅ Environment parity OK — Node ${nodeMajor}, images ${Object.keys(composeImages)
    .map((n) => `${n}:${composeImages[n]}`)
    .join(", ")}, ${composeVarRefs.size} compose variables documented`
);
