import { existsSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { users, roles, userRoles, notes } from './schema';
import {
  createConnection,
  closeConnection,
  migrateDatabase,
  isPostgresUrl,
  type DatabaseConnection,
} from './connections';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATABASE_PATH || resolve(__dirname, '../../../data/pglite');
const BCRYPT_ROUNDS = 12;
const NO_RESET = process.argv.includes('--no-reset');
const IS_POSTGRES = isPostgresUrl(process.env.DATABASE_URL);

const TEST_CREDENTIALS = {
  admin: { email: 'admin@example.com', password: 'Admin123!' },
  user: { email: 'user@example.com', password: 'User1234!' },
};

// Fixed IDs for test data
const IDS = {
  roles: { admin: 'role-admin', user: 'role-user' },
  users: { admin: 'user-admin-1', user: 'user-regular-1' },
  notes: { note1: 'note-1', note2: 'note-2', note3: 'note-3' },
};

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Seed script cannot run in production');
    process.exit(1);
  }

  console.log('Seeding database...');

  let db: DatabaseConnection;

  if (IS_POSTGRES) {
    db = await createConnection();
    await migrateDatabase(db);
  } else {
    if (!NO_RESET && existsSync(DATA_DIR)) {
      rmSync(DATA_DIR, { recursive: true, force: true });
      console.log('  Removed existing database');
    }
    // PGlite connections apply migrations on open
    db = await createConnection(DATA_DIR);
  }

  const now = new Date();
  const adminHash = await bcrypt.hash(TEST_CREDENTIALS.admin.password, BCRYPT_ROUNDS);
  const userHash = await bcrypt.hash(TEST_CREDENTIALS.user.password, BCRYPT_ROUNDS);

  try {
    // Existing rows are left untouched so re-seeding is idempotent
    await db
      .insert(roles)
      .values([
        {
          id: IDS.roles.admin,
          name: 'admin',
          displayName: 'Practice admin',
          description: 'Manages the practice: therapists, accounts, settings',
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: IDS.roles.user,
          name: 'user',
          displayName: 'Therapist',
          description: 'Physiotherapist following their own patients',
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(users)
      .values([
        {
          id: IDS.users.admin,
          email: TEST_CREDENTIALS.admin.email,
          passwordHash: adminHash,
          firstName: 'Claire',
          lastName: 'Admin',
          isActive: true,
          status: 'approved',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: IDS.users.user,
          email: TEST_CREDENTIALS.user.email,
          passwordHash: userHash,
          firstName: 'Julien',
          lastName: 'Kiné',
          isActive: true,
          status: 'approved',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(userRoles)
      .values([
        { id: 'ur-1', userId: IDS.users.admin, roleId: IDS.roles.admin, assignedAt: now },
        { id: 'ur-2', userId: IDS.users.user, roleId: IDS.roles.user, assignedAt: now },
      ])
      .onConflictDoNothing();

    await db
      .insert(notes)
      .values([
        {
          id: IDS.notes.note1,
          title: 'M.D. — séance 4 — genou droit (LCA post-op J+28)',
          content:
            'Flexion 105°, extension -3°. Douleur 3/10 en fin de séance. Quadriceps : bon recrutement, léger flessum. Exercices : vélo 10 min, squats partiels 3x12, proprio sur plateau. Patient motivé, fait ses exercices à la maison 1 jour sur 2. À revoir : travail excentrique, objectif course légère à M+4.',
          userId: IDS.users.user,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: IDS.notes.note2,
          title: 'S.L. — séance 2 — lombalgie chronique',
          content:
            'Douleur 6/10 au réveil, 4/10 après mobilisation. Peur du mouvement marquée (évite de se pencher). Éducation sur la douleur + gainage doux, marche 20 min/jour proposée. A arrêté les exercices la semaine dernière ("trop mal"). Penser à en parler avec son médecin traitant si pas d amélioration à 3 semaines.',
          userId: IDS.users.user,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: IDS.notes.note3,
          title: 'Cabinet — organisation planning décembre',
          content: 'Fermeture du 24 au 26/12. Prévoir relance des patients sans rendez-vous depuis 3 semaines.',
          userId: IDS.users.admin,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing();
  } finally {
    await closeConnection(db);
  }

  console.log('Database seeded successfully!');
  console.log(`  Admin: ${TEST_CREDENTIALS.admin.email}`);
  console.log(`  User: ${TEST_CREDENTIALS.user.email}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
