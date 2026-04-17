import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
// Create a new Prisma client instance with the PostgreSQL adapter and the connection string from environment variables
const adapter = new PrismaPg({ connectionString });
// Initialize the Prisma client with the configured adapter
const prisma = new PrismaClient({ adapter });
// Export the Prisma client instance for use in other parts of the application
export { prisma };
