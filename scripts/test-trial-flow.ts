import 'dotenv/config';
import crypto from 'node:crypto';
import prisma from '../src/config/prisma.js';
import TrialService from '../src/services/TrialService.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  process.env.FF_TRIALS_ENABLED = 'true';

  const trialService = new TrialService();
  const email = `trial-test-${Date.now()}@example.com`;
  const email2 = `trial-test-${Date.now()}-second@example.com`;
  const deviceHash = crypto.createHash('sha256').update(`ios-${Date.now()}`).digest('hex');

  console.log('🔧 Creating test user…');
  const user = await prisma.user.create({
    data: {
      email,
      provider: 'demo',
      emailVerified: true,
      displayName: 'Trial Tester',
    },
  });

  console.log('🚀 Granting trial (should succeed)…');
  const grant = await trialService.grantIfEligible(user, deviceHash);
  console.log('   grant result:', grant);

  let status = await trialService.status(user.id);
  console.log('   status after grant:', status);

  console.log('⏱️ Shortening trial to 5 seconds…');
  const expiresSoon = new Date(Date.now() + 5_000);
  await prisma.user.update({
    where: { id: user.id },
    data: { trialEndsAt: expiresSoon },
  });
  await prisma.trialGrant.update({
    where: { userId: user.id },
    data: { expiresAt: expiresSoon },
  });

  status = await trialService.status(user.id);
  console.log('   status after shortening:', status);

  console.log('⌛ Waiting 7 seconds for reminder + expiry logs…');
  await sleep(7_000);
  await trialService.expireIfNeeded(user.id);
  status = await trialService.status(user.id);
  console.log('   status after expiry:', status);

  console.log('🔁 Attempting to re-grant trial to same user (should block)…');
  const repeatGrant = await trialService.grantIfEligible(user, deviceHash);
  console.log('   repeat grant result:', repeatGrant);

  console.log('👤 Creating second user with same device fingerprint…');
  const user2 = await prisma.user.create({
    data: {
      email: email2,
      provider: 'demo',
      emailVerified: true,
      displayName: 'Trial Tester 2',
    },
  });

  const secondGrant = await trialService.grantIfEligible(user2, deviceHash);
  console.log('   second user grant result (should be blocked):', secondGrant);

  console.log('✅ Trial flow test complete');

  console.log('🧹 Cleaning up test data…');
  await prisma.deviceTrialFingerprint.deleteMany({ where: { hash: deviceHash } });
  await prisma.trialGrant.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: [email, email2] } } });
}

main()
  .catch((error) => {
    console.error('❌ Trial flow test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

