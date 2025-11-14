import { Prisma, PrismaClient } from "@prisma/client";
import defaultConfig from "../src/config/default-vpn-config.json" assert { type: "json" };
import { generateWeakEtag } from "../src/utils/etag.js";

const prisma = new PrismaClient();

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function main(): Promise<void> {
  const baseConfig = cloneConfig(defaultConfig);
  const nowIso = new Date().toISOString();

  baseConfig.version = `global-${nowIso.replace(/[:.]/g, "-")}`;
  baseConfig.updatedAt = nowIso;

  baseConfig.servers = [
    ...baseConfig.servers,
    {
      id: "de-frankfurt",
      name: "Germany",
      country: "Germany",
      city: "Frankfurt",
      serverAddress: "18.194.22.101",
      remoteIdentifier: null,
      credentialId: "client",
      assetKey: "de",
      flagUrl: "https://flagcdn.com/w40/de.png",
      coordinates: { lat: 50.1109, lng: 8.6821 },
      isDefault: false,
      sortOrder: 30,
      metadata: { region: "eu-central", displayName: "Germany (Frankfurt)" },
    },
    {
      id: "jp-tokyo",
      name: "Japan",
      country: "Japan",
      city: "Tokyo",
      serverAddress: "13.115.55.210",
      remoteIdentifier: null,
      credentialId: "client",
      assetKey: "jp",
      flagUrl: "https://flagcdn.com/w40/jp.png",
      coordinates: { lat: 35.6762, lng: 139.6503 },
      isDefault: false,
      sortOrder: 40,
      metadata: { region: "ap-northeast", displayName: "Japan (Tokyo)" },
    },
    {
      id: "br-sao-paulo",
      name: "Brazil",
      country: "Brazil",
      city: "São Paulo",
      serverAddress: "18.228.45.90",
      remoteIdentifier: null,
      credentialId: "client",
      assetKey: "br",
      flagUrl: "https://flagcdn.com/w40/br.png",
      coordinates: { lat: -23.5505, lng: -46.6333 },
      isDefault: false,
      sortOrder: 50,
      metadata: { region: "sa-east", displayName: "Brazil (São Paulo)" },
    },
  ];

  const payload = baseConfig as Prisma.JsonObject;
  const payloadJson = payload as unknown as Prisma.InputJsonValue;
  const version = baseConfig.version;
  const etag = generateWeakEtag(payload);

  await prisma.vpnConfig.updateMany({
    where: { isActive: true },
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

  console.log(`✅ Seeded VPN config version "${version}" with additional countries.`);
}

main()
  .catch((error) => {
    console.error("❌ Failed to seed demo VPN config:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

