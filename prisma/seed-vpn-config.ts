import { PrismaClient, Prisma } from "@prisma/client";
import defaultConfig from "../src/config/default-vpn-config.json" assert { type: "json" };
import { generateWeakEtag } from "../src/utils/etag.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const payload = defaultConfig as Prisma.JsonObject;
  const payloadJson = payload as unknown as Prisma.InputJsonValue;
  const version = (payload.version as string) ?? "fallback-1.0.0";
  const etag = generateWeakEtag(payload);

  await prisma.vpnConfig.updateMany({
    where: {
      version: { not: version },
      isActive: true,
    },
    data: { isActive: false },
  });

  await prisma.vpnConfig.upsert({
    where: { version },
    create: {
      version,
      payload: payloadJson,
      etag,
      isActive: true,
    },
    update: {
      payload: payloadJson,
      etag,
      isActive: true,
    },
  });

  console.log(`✅ Seeded VPN config version "${version}" (active).`);
}

main()
  .catch((error) => {
    console.error("❌ Failed to seed VPN config:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

