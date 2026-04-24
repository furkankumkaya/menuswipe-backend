// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo data...");

  const passwordHash = await bcrypt.hash("demo1234", 12);

  const org = await prisma.organization.upsert({
    where: { slug: "ortaya" },
    update: {},
    create: {
      name: "Ortaya Restaurant",
      slug: "ortaya",
      accentColor: "#1a1a1a",
      plan: "CHAIN",
      planStatus: "ACTIVE",
      users: {
        create: {
          email: "admin@ortaya.com",
          passwordHash,
          name: "Demo Admin",
          role: "OWNER",
        },
      },
      branches: {
        create: [
          { name: "Ortaya Karaköy", city: "Istanbul", slug: "karakoy", active: true },
          { name: "Ortaya Nişantaşı", city: "Istanbul", slug: "nisantasi", active: true },
          { name: "Ortaya Ankara", city: "Ankara", slug: "ankara", active: false },
        ],
      },
      menuItems: {
        create: [
          {
            name: "Lamb Tandır",
            description: "Slow-cooked for 12 hours, served with roasted vegetables",
            price: 485,
            category: "MAIN",
            sortOrder: 1,
          },
          {
            name: "Mediterranean Salad",
            description: "Fresh arugula, cherry tomatoes, pomegranate molasses and goat cheese",
            price: 185,
            category: "STARTER",
            sortOrder: 1,
          },
          {
            name: "Sütlaç",
            description: "Oven-baked traditional rice pudding with cinnamon and pistachios",
            price: 145,
            category: "DESSERT",
            sortOrder: 1,
          },
          {
            name: "Ayran",
            description: "Homemade chilled yogurt drink",
            price: 45,
            category: "DRINK",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  console.log(`Seeded organization: ${org.name} (slug: ${org.slug})`);
  console.log("Login: admin@ortaya.com / demo1234");
}

main().catch(console.error).finally(() => prisma.$disconnect());
