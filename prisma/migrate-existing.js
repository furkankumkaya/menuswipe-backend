// Mevcut hesaplar için subscription alanlarını set etmek için tek seferlik script
// Railway'de manuel çalıştırılır: `node prisma/migrate-existing.js`

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BETA_EMAILS = (process.env.BETA_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  console.log("Starting migration for existing accounts...");
  console.log("Beta emails:", BETA_EMAILS);

  const orgs = await prisma.organization.findMany({
    include: { users: true },
  });

  console.log(`Found ${orgs.length} organizations`);

  for (const org of orgs) {
    const ownerEmail = org.users[0]?.email?.toLowerCase();
    const isBeta = ownerEmail && BETA_EMAILS.includes(ownerEmail);

    const data = {};

    // Default language ve enabledLanguages henüz set değilse
    if (!org.defaultLanguage || org.defaultLanguage === "") {
      data.defaultLanguage = "en";
    }
    if (!org.enabledLanguages || org.enabledLanguages.length === 0) {
      data.enabledLanguages = [];
    }

    // Onboarding completed (mevcut kullanıcılar zaten kullanıyor)
    if (org.onboardingCompleted === false || org.onboardingCompleted === null) {
      data.onboardingCompleted = true;
    }

    if (isBeta) {
      // Beta kullanıcıları PRO yıllık olarak ayarla
      data.plan = "PRO";
      data.subscriptionStatus = "ACTIVE";
      data.billingCycle = "YEARLY";
      data.subscriptionEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      console.log(`  -> ${org.slug} (${ownerEmail}): PRO (beta)`);
    } else if (!org.trialEndsAt) {
      // Normal kullanıcılar: trial setup (creation date'inden itibaren 30 gün)
      const trialStart = org.createdAt || new Date();
      const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000);
      data.plan = "TRIAL";
      data.subscriptionStatus = "TRIAL";
      data.trialEndsAt = trialEnd;
      const daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`  -> ${org.slug} (${ownerEmail}): TRIAL, ${daysLeft} days left`);
    } else {
      console.log(`  -> ${org.slug}: skipped (already configured)`);
      continue;
    }

    if (Object.keys(data).length > 0) {
      await prisma.organization.update({
        where: { id: org.id },
        data,
      });
    }
  }

  console.log("Migration done.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
