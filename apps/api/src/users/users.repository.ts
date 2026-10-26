import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/database";
import { DATABASE } from "../db/database.module";
import { users, type UserRow } from "../db/schema";

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async ensureDemoUser(input: { email: string; name: string }): Promise<UserRow> {
    await this.db
      .insert(users)
      .values({ email: input.email, displayName: input.name })
      .onConflictDoNothing({ target: users.email });

    // A concurrent caller may have won the insert, so the conflict-safe write is followed by a
    // separate read. PostgreSQL's READ COMMITTED snapshot then observes the committed winner.
    const user = await this.findByEmail(input.email);
    if (!user) {
      throw new Error("The demo user could not be created");
    }
    return user;
  }
}
