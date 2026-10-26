import type { CreateCheckInData } from "@maia/contracts";
import { appConfigFrom, validateEnv } from "../config/env";
import { loadEnvFile } from "../config/load-env";
import { UsersRepository } from "../users/users.repository";
import { createDatabase } from "./database";
import { checkIns } from "./schema";

loadEnvFile();

function dateDaysAgo(base: Date, daysAgo: number): string {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function createSeedCheckIns(today: Date): CreateCheckInData[] {
  return [
    {
      date: dateDaysAgo(today, 0),
      wellbeing: 4,
      sleepQuality: 4,
      energy: 3,
      stress: 2,
      symptoms: ["fatigue"],
      notes: "Buen día, aunque me cuesta Concentrarme por la tarde.",
    },
    {
      date: dateDaysAgo(today, 1),
      wellbeing: 3,
      sleepQuality: 3,
      energy: 2,
      stress: 3,
      symptoms: ["cramps", "bloating"],
      notes: "Molestias leves después de comer.",
    },
    {
      date: dateDaysAgo(today, 2),
      wellbeing: 5,
      sleepQuality: 4,
      energy: 5,
      stress: 1,
      symptoms: [],
      notes: "Descansé bien y me sentí con mucha energía.",
    },
    {
      date: dateDaysAgo(today, 3),
      wellbeing: 2,
      sleepQuality: 2,
      energy: 2,
      stress: 4,
      symptoms: ["headache", "insomnia"],
      notes: "Dormí poco y tuve dolor de cabeza durante la mañana.",
    },
    {
      date: dateDaysAgo(today, 4),
      wellbeing: 3,
      sleepQuality: 3,
      energy: 3,
      stress: 3,
      symptoms: ["anxiety"],
      notes: "Día tranquilo, aunque estuve algo preocupada.",
    },
    {
      date: dateDaysAgo(today, 5),
      wellbeing: 4,
      sleepQuality: 4,
      energy: 4,
      stress: 2,
      symptoms: ["breast_tenderness"],
      notes: "Sensible, pero con un buen día en general.",
    },
    {
      date: dateDaysAgo(today, 6),
      wellbeing: 2,
      sleepQuality: 2,
      energy: 1,
      stress: 4,
      symptoms: ["nausea", "fatigue"],
      notes: "Poca energía y náuseas por la mañana.",
    },
    {
      date: dateDaysAgo(today, 7),
      wellbeing: 3,
      sleepQuality: 3,
      energy: 3,
      stress: 3,
      symptoms: [],
      notes: "Rutina habitual, sin novedades relevantes.",
    },
  ];
}

async function main(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);
  const appConfig = appConfigFrom(env);
  const connection = createDatabase(env.DATABASE_URL);

  try {
    const usersRepository = new UsersRepository(connection.db);
    const user = await usersRepository.ensureDemoUser(appConfig.demoUser);
    const seedCheckIns = createSeedCheckIns(new Date());

    const inserted = await connection.db
      .insert(checkIns)
      .values(seedCheckIns.map((checkIn) => ({ ...checkIn, userId: user.id })))
      .onConflictDoNothing({ target: [checkIns.userId, checkIns.date] })
      .returning({ id: checkIns.id });

    console.log(
      `Seed completed for ${appConfig.demoUser.email}: ${seedCheckIns.length} check-ins available, ${inserted.length} inserted`,
    );
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
