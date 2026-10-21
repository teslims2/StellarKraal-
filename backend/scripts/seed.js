'use strict';

/**
 * Database seed script for local development and testing.
 *
 * Usage: npm run db:seed
 *
 * Idempotent: re-running will not duplicate seed data. Seed records are
 * identified by stable, well-known keys (email for borrowers, tag for
 * collateral, external reference for loans).
 */

const path = require('path');
const bcrypt = require('bcrypt');

// Resolve the app's data layer. Adjust the require path if the project
// exposes models from a different entry point.
const db = require(path.join(__dirname, '..', 'src', 'models'));

const SALT_ROUNDS = 10;
const SEED_PASSWORD = 'Password123!';

const BORROWERS = [
  { email: 'alice@example.com', name: 'Alice Johnson', creditScore: 780 },
  { email: 'bob@example.com', name: 'Bob Smith', creditScore: 720 },
  { email: 'carol@example.com', name: 'Carol Williams', creditScore: 690 },
  { email: 'dave@example.com', name: 'Dave Brown', creditScore: 640 },
  { email: 'erin@example.com', name: 'Erin Davis', creditScore: 610 },
  { email: 'frank@example.com', name: 'Frank Miller', creditScore: 560 },
];

// Covers every supported animal type.
const COLLATERAL = [
  { tag: 'SEED-COW-001', animalType: 'Cattle', breed: 'Angus', estimatedValue: 1800 },
  { tag: 'SEED-GOAT-001', animalType: 'Goat', breed: 'Boer', estimatedValue: 350 },
  { tag: 'SEED-SHEEP-001', animalType: 'Sheep', breed: 'Merino', estimatedValue: 400 },
  { tag: 'SEED-PIG-001', animalType: 'Pig', breed: 'Duroc', estimatedValue: 300 },
  { tag: 'SEED-CHICKEN-001', animalType: 'Chicken', breed: 'Leghorn', estimatedValue: 25 },
  { tag: 'SEED-HORSE-001', animalType: 'Horse', breed: 'Quarter Horse', estimatedValue: 5000 },
];

// One loan per state machine state.
const LOANS = [
  { reference: 'SEED-LOAN-PENDING', state: 'Pending', principal: 1000, borrowerEmail: 'alice@example.com', collateralTag: 'SEED-COW-001' },
  { reference: 'SEED-LOAN-ACTIVE', state: 'Active', principal: 1500, borrowerEmail: 'bob@example.com', collateralTag: 'SEED-GOAT-001' },
  { reference: 'SEED-LOAN-ATRISK', state: 'AtRisk', principal: 2000, borrowerEmail: 'carol@example.com', collateralTag: 'SEED-SHEEP-001' },
  { reference: 'SEED-LOAN-REPAID', state: 'Repaid', principal: 800, borrowerEmail: 'dave@example.com', collateralTag: 'SEED-PIG-001' },
  { reference: 'SEED-LOAN-LIQUIDATED', state: 'Liquidated', principal: 2500, borrowerEmail: 'erin@example.com', collateralTag: 'SEED-HORSE-001' },
];

async function seedBorrowers() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
  const created = [];

  for (const borrower of BORROWERS) {
    const [record] = await db.Borrower.findOrCreate({
      where: { email: borrower.email },
      defaults: {
        email: borrower.email,
        name: borrower.name,
        creditScore: borrower.creditScore,
        passwordHash,
      },
    });
    created.push(record);
  }

  return created;
}

async function seedCollateral() {
  const created = [];

  for (const asset of COLLATERAL) {
    const [record] = await db.Collateral.findOrCreate({
      where: { tag: asset.tag },
      defaults: {
        tag: asset.tag,
        animalType: asset.animalType,
        breed: asset.breed,
        estimatedValue: asset.estimatedValue,
      },
    });
    created.push(record);
  }

  return created;
}

async function seedLoans(borrowers, collateral) {
  const borrowerByEmail = new Map(borrowers.map((b) => [b.email, b]));
  const collateralByTag = new Map(collateral.map((c) => [c.tag, c]));

  for (const loan of LOANS) {
    const borrower = borrowerByEmail.get(loan.borrowerEmail);
    const asset = collateralByTag.get(loan.collateralTag);

    if (!borrower || !asset) {
      throw new Error(`Missing seed dependency for loan ${loan.reference}`);
    }

    await db.Loan.findOrCreate({
      where: { reference: loan.reference },
      defaults: {
        reference: loan.reference,
        state: loan.state,
        principal: loan.principal,
        borrowerId: borrower.id,
        collateralId: asset.id,
      },
    });
  }
}

async function main() {
  try {
    const borrowers = await seedBorrowers();
    const collateral = await seedCollateral();
    await seedLoans(borrowers, collateral);

    console.log(
      `Seed complete: ${borrowers.length} borrowers, ${collateral.length} collateral assets, ${LOANS.length} loans.`
    );
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
